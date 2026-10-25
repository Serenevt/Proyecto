import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { transactionInclude } from './transaction.model';
@Injectable()
export class TransactionsRepository {
  constructor(private readonly db: PrismaService) {}
  atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.atomic(work);
  }
  byOperation(operationId: string, tx: Prisma.TransactionClient) {
    return tx.transaction.findUnique({
      where: { operationId },
      include: transactionInclude,
    });
  }
  byId(id: string) {
    return this.db.transaction.findUnique({
      where: { id },
      include: transactionInclude,
    });
  }
  vehicle(plate: string, tx: Prisma.TransactionClient) {
    return tx.vehicle.findUnique({
      where: { plate },
      include: {
        membership: { include: { user: { select: { active: true } } } },
      },
    });
  }
  station(id: string, tx: Prisma.TransactionClient) {
    return tx.station.findUnique({ where: { id } });
  }
  fuel(id: string, tx: Prisma.TransactionClient) {
    return tx.fuel.findUnique({ where: { id } });
  }
  create(
    data: Prisma.TransactionUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.transaction.create({ data, include: transactionInclude });
  }
}
