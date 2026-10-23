import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WalletMovementKind } from '@prisma/client';
import { pendingDebt, settleDebts } from './debt';
import { RechargeDto } from './recharge.dto';
import { WalletRepository } from './wallet.repository';

@Injectable()
export class WalletService {
  constructor(private readonly repo: WalletRepository) {}

  /**
   * Recarga de saldo. Solo disponible para miembros autenticados (JWT) sobre su
   * propia membresía. En este prototipo es una acreditación DEMO: no invoca
   * ninguna pasarela de pago. El libro mayor registra el movimiento para que el
   * saldo de PostgreSQL sea la única fuente de verdad.
   */
  async recharge(userId: string, dto: RechargeDto) {
    if (process.env.APP_MODE === 'production')
      throw new BadRequestException('La recarga simulada no est? disponible en producci?n');
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0))
      throw new BadRequestException('El monto de recarga debe ser positivo');
    return this.repo.atomic(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { userId },
        include: { user: { select: { active: true } } },
      });
      if (!membership) throw new NotFoundException('Membresía no encontrada');
      if (membership.status !== 'ACTIVE' || !membership.user.active)
        throw new BadRequestException('Membresía inactiva');

      // Reintento con el mismo operationId devuelve la recarga original.
      const previous = await this.repo.byOperation(
        dto.operationId,
        WalletMovementKind.RECHARGE,
        tx,
      );
      if (previous) {
        if (
          previous.membershipId !== membership.id ||
          !previous.amount.eq(amount)
        )
          throw new ConflictException('operationId ya usado con otros datos');
        return { movement: previous, replayed: true };
      }

      // Bloqueo de fila: evita que dos recargas simultáneas se sobrescriban.
      await this.repo.lockMembership(membership.id, tx);
      const fresh = await tx.membership.findUnique({
        where: { id: membership.id },
      });
      if (!fresh) throw new NotFoundException('Membresía no encontrada');

      const balance = fresh.balance.add(amount);
      if (balance.gt(new Prisma.Decimal('9999999.99')))
        throw new BadRequestException('El saldo supera el máximo permitido');
      await this.repo.setBalance(membership.id, balance, tx);
      const movement = await this.repo.movement(
        {
          membershipId: membership.id,
          kind: WalletMovementKind.RECHARGE,
          amount,
          balanceAfter: balance,
          operationId: dto.operationId,
          note: 'Recarga de saldo Primax Prime (DEMO, sin cobro real)',
        },
        tx,
      );
      const settled = await settleDebts(
        tx,
        membership.id,
        dto.operationId,
        amount,
        balance,
      );
      await this.repo.setBalance(membership.id, settled.balance, tx);
      return {
        movement,
        balance: settled.balance.toFixed(2),
        debtPaid: settled.applied.toFixed(2),
        pendingBalance: (await pendingDebt(tx, membership.id)).toFixed(2),
        replayed: false,
      };
    });
  }

  /**
   * Libro mayor del saldo, para el historial de FrontEnd_2.
   *
   * La reserva se DESCUENTA de `Membership.balance` al autorizarse, así que
   * `balance` ya es el dinero libre: es exactamente lo que se puede comprometer
   * ahora. Por eso available y balance coinciden, y el saldo real del socio
   * (lo que le pertenece,.retirado o no) es la suma de ambos.
   *
   *   balance / available = saldo libre (reservas ya descontadas)
   *   reserved            = importe comprometido en reservas abiertas
   *   total               = balance + reserved = saldo real del socio
   */
  async history(userId: string) {
    const membership = await this.repo.atomic(async (tx) => {
      const found = await tx.membership.findUnique({ where: { userId } });
      if (!found) throw new NotFoundException('Membresía no encontrada');
      return found;
    });
    const movements = await this.repo.list(membership.id, this.repo.client());
    const reserved = await this.repo.reserved(
      membership.id,
      this.repo.client(),
    );
    return {
      pendingBalance: (
        await pendingDebt(this.repo.client(), membership.id)
      ).toFixed(2),
      balance: membership.balance.toFixed(2),
      reserved: reserved.toFixed(2),
      // La reserva ya salió de balance: es el dinero que se puede usar.
      available: membership.balance.toFixed(2),
      total: membership.balance.plus(reserved).toFixed(2),
      movements: movements.map((m) => ({
        id: m.id,
        kind: m.kind,
        amount: m.amount.toFixed(2),
        balanceAfter: m.balanceAfter.toFixed(2),
        transactionId: m.transactionId,
        note: m.note,
        createdAt: m.createdAt,
      })),
    };
  }
}
