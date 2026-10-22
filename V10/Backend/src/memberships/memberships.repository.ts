import { ProfileDto, assertIdentity } from './profile.dto';
import { pendingDebt } from '../wallet/debt';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/pagination.dto';
import { transactionInclude } from '../transactions/transaction.model';
@Injectable()
export class MembershipsRepository {
  constructor(private readonly db: PrismaService) {}
  pending(membershipId: string) {
    return pendingDebt(this.db, membershipId);
  }
  updateProfile(userId: string, data: ProfileDto) {
    return this.db.atomic(async (tx) => {
      const current = await tx.membership.findUniqueOrThrow({
        where: { userId },
      });
      assertIdentity({
        dni: data.dni === undefined ? current.dni : data.dni,
        passport:
          data.passport === undefined ? current.passport : data.passport,
      });
      return tx.membership.update({ where: { userId }, data });
    });
  }
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
  /** Saldo comprometido en reservas vigentes (RESERVED o DISPENSING). */
  async reserved(membershipId: string) {
    const rows = await this.db.fuelAuthorization.findMany({
      where: { membershipId, status: { in: ['RESERVED', 'DISPENSING'] } },
      select: { reservedAmount: true },
    });
    return rows.reduce(
      (total, row) => total.add(row.reservedAmount),
      new Prisma.Decimal(0),
    );
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
