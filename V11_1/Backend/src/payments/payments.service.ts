import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma, PurchaseMode } from '@prisma/client';

/** Medios de pago externos. El prepago solo admite estos. */
export const EXTERNAL_METHODS: readonly PaymentMethod[] = [
  PaymentMethod.EFECTIVO,
  PaymentMethod.TARJETA,
  PaymentMethod.YAPE,
  PaymentMethod.PLIN,
];

@Injectable()
export class PaymentsService {
  /** Simulation is limited to cash/card and legacy wallet bookkeeping.
   * Online Yape/Plin payments are created and reconciled by OnlineOrdersService.
   */
  authorize(amount: Prisma.Decimal, method: PaymentMethod, mode: PurchaseMode) {
    if (['YAPE', 'PLIN'].includes(method))
      throw new BadRequestException('El pago requiere una orden confirmada por el proveedor');
    if (mode === PurchaseMode.PREPAGO) {
      if (!EXTERNAL_METHODS.includes(method))
        throw new BadRequestException(
          'El prepago requiere efectivo, tarjeta, Yape o Plin',
        );
    } else if (method !== PaymentMethod.SALDO_PRIME) {
      throw new BadRequestException(
        'El postpago requiere cargo al saldo Primax Prime',
      );
    }
    return {
      amount,
      method,
      status: 'CAPTURED' as const,
      provider: 'DEMO',
    };
  }
}
