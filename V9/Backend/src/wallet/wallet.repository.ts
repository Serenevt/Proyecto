import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { WalletMovementKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletRepository {
  constructor(private readonly db: PrismaService) {}
  atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.atomic(work);
  }
  /**
   * Bloquea la fila de la membresía y devuelve el saldo actual.
   * El bloqueo de fila (SELECT ... FOR UPDATE) serializa reservas concurrentes
   * sobre la misma cuenta, de modo que dos surtidores no puedan gastar el mismo
   * saldo a la vez.
   */
  async lockMembership(membershipId: string, tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<
      { id: string; balance: Prisma.Decimal; status: string }[]
    >(
      Prisma.sql`SELECT id, balance, status FROM "Membership"
                 WHERE id = ${membershipId}::uuid FOR UPDATE`,
    );
    return rows[0] ?? null;
  }
  async setBalance(
    membershipId: string,
    balance: Prisma.Decimal,
    tx: Prisma.TransactionClient,
  ) {
    return tx.membership.update({
      where: { id: membershipId },
      data: { balance },
    });
  }
  movement(
    data: Prisma.WalletMovementUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.walletMovement.create({ data });
  }
  byOperation(
    operationId: string,
    kind: WalletMovementKind,
    tx: Prisma.TransactionClient,
  ) {
    return tx.walletMovement.findUnique({
      where: { operationId_kind: { operationId, kind } },
    });
  }
  list(membershipId: string, db: Prisma.TransactionClient | PrismaClient) {
    return db.walletMovement.findMany({
      where: { membershipId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }
  /** Cliente Prisma principal, para lecturas fuera de una transacción. */
  client() {
    return this.db;
  }
  /** Reservas vigentes: saldo comprometido pero no consumido. */
  async reserved(
    membershipId: string,
    db: Prisma.TransactionClient | PrismaClient,
  ) {
    const rows = await db.fuelAuthorization.findMany({
      where: {
        membershipId,
        mode: 'POSTPAGO',
        status: { in: ['RESERVED', 'DISPENSING', 'INTERVENTION_REQUIRED'] },
      },
      select: { reservedAmount: true },
    });
    return rows.reduce(
      (total, row) => total.add(row.reservedAmount),
      new Prisma.Decimal(0),
    );
  }
}
