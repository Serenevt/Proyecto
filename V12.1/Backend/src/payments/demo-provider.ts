import {
  Injectable,
  ServiceUnavailableException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentProvider, ProviderOrder } from './payment-provider';
export function assertDemoWallet() {
  if (
    !['local', 'academic'].includes(process.env.APP_MODE || '') ||
    process.env.PAYMENT_ENV !== 'demo' ||
    process.env.DEMO_WALLET_ENABLED !== 'true'
  )
    throw new ServiceUnavailableException(
      'Simulación deshabilitada fuera del perfil de demostración',
    );
}
@Injectable()
export class DemoWalletProvider implements PaymentProvider {
  constructor(private readonly db: PrismaService) {}
  assertConfigured() {
    assertDemoWallet();
  }
  async create(id: string, cents: number): Promise<ProviderOrder> {
    assertDemoWallet();
    const remote: ProviderOrder = {
      id: 'demo:' + id,
      order_number: id,
      amount: cents,
      currency_code: 'PEN',
      state: 'pending',
    };
    await this.db.atomic((tx) =>
      tx.paymentEvent.upsert({
        where: { eventKey: 'demo-intent:' + id },
        create: {
          eventKey: 'demo-intent:' + id,
          orderId: id,
          kind: 'DEMO_PENDING',
          detail: JSON.stringify(remote),
        },
        update: {},
      }),
    );
    return this.get(remote.id);
  }
  async get(id: string): Promise<ProviderOrder> {
    assertDemoWallet();
    if (!id.startsWith('demo:'))
      throw new ConflictException(
        'Orden comercial incompatible con simulación',
      );
    const key = id.slice(5);
    const event =
      (await this.db.paymentEvent.findUnique({
        where: { eventKey: 'demo-terminal:' + key },
      })) ||
      (await this.db.paymentEvent.findUnique({
        where: { eventKey: 'demo-confirm:' + key },
      })) ||
      (await this.db.paymentEvent.findUniqueOrThrow({
        where: { eventKey: 'demo-intent:' + key },
      }));
    return JSON.parse(event.detail) as ProviderOrder;
  }
  async findByReference(id: string) {
    assertDemoWallet();
    const intent = await this.db.paymentEvent.findUnique({
      where: { eventKey: 'demo-intent:' + id },
    });
    if (intent) return this.get('demo:' + id);
    const order = await this.db.onlineOrder.findUnique({ where: { id } });
    // No external side effect exists in DEMO, so an interrupted local creation can be recovered safely.
    return order?.status === 'CREATING'
      ? this.create(id, order.amount.mul(100).toNumber())
      : null;
  }
  private async transition(
    id: string,
    state: 'paid' | 'cancelled' | 'refunded',
    cents?: number,
  ) {
    assertDemoWallet();
    if (!id.startsWith('demo:'))
      throw new ConflictException(
        'Orden comercial incompatible con simulación',
      );
    const key = id.slice(5);
    await this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OnlineOrder" WHERE id=${key}::uuid FOR UPDATE`;
      const event =
        (await tx.paymentEvent.findUnique({
          where: { eventKey: 'demo-terminal:' + key },
        })) ||
        (await tx.paymentEvent.findUnique({
          where: { eventKey: 'demo-confirm:' + key },
        })) ||
        (await tx.paymentEvent.findUniqueOrThrow({
          where: { eventKey: 'demo-intent:' + key },
        }));
      const remote = JSON.parse(event.detail) as ProviderOrder;
      if (
        cents !== undefined &&
        (remote.amount !== cents || remote.currency_code !== 'PEN')
      )
        throw new ConflictException('Importe incompatible');
      if (remote.state === state) return;
      if (
        state === 'refunded'
          ? remote.state !== 'paid'
          : remote.state !== 'pending'
      )
        throw new ConflictException('Orden terminal incompatible');
      const result = {
        ...remote,
        state,
        ...(state === 'paid' ? { paid_at: Math.floor(Date.now() / 1000) } : {}),
        ...(state === 'refunded'
          ? { refunded_at: Math.floor(Date.now() / 1000) }
          : {}),
      };
      await tx.paymentEvent.create({
        data: {
          eventKey:
            (state === 'paid' ? 'demo-confirm:' : 'demo-terminal:') + key,
          orderId: key,
          kind: 'DEMO_' + state.toUpperCase(),
          detail: JSON.stringify(result),
        },
      });
    });
  }
  confirm(id: string, cents: number) {
    return this.transition(id, 'paid', cents);
  }
  cancel(id: string) {
    return this.transition(id, 'cancelled');
  }
  refund(id: string) {
    return this.transition(id, 'refunded');
  }
}
