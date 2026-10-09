import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationDto } from '../common/pagination.dto';
import { MembershipsRepository } from './memberships.repository';
import { transactionResponse } from '../transactions/transaction.model';
@Injectable()
export class MembershipsService {
  constructor(private readonly repo: MembershipsRepository) {}
  async forUser(userId: string) {
    const membership = await this.repo.findForUser(userId);
    if (!membership) throw new NotFoundException('Membresía no encontrada');
    return membership;
  }
  async me(userId: string) {
    const membership = await this.forUser(userId);
    const balance = await this.repo.balance(membership.id);
    return { ...membership, points: balance._sum.points ?? 0 };
  }
  async transactions(userId: string, query: PaginationDto) {
    return (
      await this.repo.transactions((await this.forUser(userId)).id, query)
    ).map(transactionResponse);
  }
  async rewards(userId: string, query: PaginationDto) {
    return this.repo.rewards((await this.forUser(userId)).id, query);
  }
  async redemptions(userId: string, query: PaginationDto) {
    return this.repo.redemptions((await this.forUser(userId)).id, query);
  }
}
