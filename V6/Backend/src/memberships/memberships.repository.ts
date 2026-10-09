import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/pagination.dto';
import { transactionInclude } from '../transactions/transaction.model';
@Injectable()
export class MembershipsRepository {
  constructor(private readonly db: PrismaService) {}
  findForUser(userId: string) {
    return this.db.membership.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true, email: true } },
        vehicles: true,
      },
    });
  }
  balance(membershipId: string) {
    return this.db.rewardMovement.aggregate({
      where: { membershipId },
      _sum: { points: true },
    });
  }
  transactions(membershipId: string, query: PaginationDto) {
    return this.db.transaction.findMany({
      where: { membershipId },
      include: transactionInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      skip: (query.page - 1) * query.limit,
    });
  }
  rewards(membershipId: string, query: PaginationDto) {
    return this.db.rewardMovement.findMany({
      where: { membershipId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      skip: (query.page - 1) * query.limit,
    });
  }
  redemptions(membershipId: string, query: PaginationDto) {
    return this.db.redemption.findMany({
      where: { membershipId },
      include: { benefit: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      skip: (query.page - 1) * query.limit,
    });
  }
}
