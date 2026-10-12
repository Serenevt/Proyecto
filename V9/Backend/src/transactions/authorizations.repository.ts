import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthorizationsRepository {
  constructor(private readonly db: PrismaService) {}
  atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.atomic(work);
  }
  byOperation(operationId: string, tx: Prisma.TransactionClient) {
    return tx.fuelAuthorization.findUnique({ where: { operationId } });
  }
  byId(id: string, db: Prisma.TransactionClient | PrismaClient) {
    return db.fuelAuthorization.findUnique({ where: { id } });
  }
  /** Cliente Prisma principal, para lecturas fuera de una transacción. */
  client() {
    return this.db;
  }
  create(
    data: Prisma.FuelAuthorizationUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.fuelAuthorization.create({ data });
  }
  settle(
    id: string,
    data: Prisma.FuelAuthorizationUncheckedUpdateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.fuelAuthorization.update({ where: { id }, data });
  }
  /**
   * Reservas que siguen comprometiendo saldo.
   *
   * Se usa para exponer el saldo retenido y para que el operador revise
   * reservas antiguas: no las libera, solo las lista. Liberarlas es siempre
   * una decisión explícita por id.
   */
  active(membershipId: string, db: Prisma.TransactionClient | PrismaClient) {
    return db.fuelAuthorization.findMany({
      where: { membershipId, status: { in: ['RESERVED', 'DISPENSING'] } },
      select: {
        id: true,
        status: true,
        authorizedAmount: true,
        dispensedAmount: true,
        dispensedGallons: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
  pendingOlderThan(before: Date, db: Prisma.TransactionClient | PrismaClient) {
    return db.fuelAuthorization.findMany({
      where: {
        status: { in: ['RESERVED', 'DISPENSING'] },
        createdAt: { lt: before },
      },
      select: {
        id: true,
        status: true,
        membershipId: true,
        authorizedAmount: true,
        dispensedAmount: true,
        dispensedGallons: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }
}
