import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class RewardsRepository {
  constructor(private readonly db: PrismaService) {}
  atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.atomic(work);
  }
  membership(userId: string, tx: Prisma.TransactionClient) {
    return tx.membership.findUnique({
      where: { userId },
      include: { user: { select: { active: true } } },
    });
  }
  byOperation(operationId: string, tx: Prisma.TransactionClient) {
    return tx.redemption.findUnique({
      where: { operationId },
      include: { benefit: true },
    });
  }
  benefit(id: string, tx: Prisma.TransactionClient) {
    return tx.benefit.findUnique({ where: { id } });
  }
  async balance(membershipId: string, tx: Prisma.TransactionClient) {
    return (
      (
        await tx.rewardMovement.aggregate({
          where: { membershipId },
          _sum: { points: true },
        })
      )._sum.points ?? 0
    );
  }
  create(
    data: Prisma.RedemptionUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.redemption.create({ data, include: { benefit: true } });
  }
}
