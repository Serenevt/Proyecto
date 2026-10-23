import { ProfileDto } from './profile.dto';
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
  async updateProfile(userId: string, dto: ProfileDto) {
    await this.forUser(userId);
    await this.repo.updateProfile(userId, dto);
    return this.me(userId);
  }
  async me(userId: string) {
    const membership = await this.forUser(userId);
    const balance = await this.repo.balance(membership.id);
    // El saldo viene de PostgreSQL, no del dispositivo: es la fuente de verdad
    // que usa el postpago en el terminal.
    const reserved = await this.repo.reserved(membership.id);
    return {
      ...membership,
      pendingBalance: (await this.repo.pending(membership.id)).toFixed(2),
      balance: membership.balance.toFixed(2),
      reserved: reserved.toFixed(2),
      // La reserva ya se descontó de balance: es el dinero libre.
      available: membership.balance.toFixed(2),
      total: membership.balance.plus(reserved).toFixed(2),
      points: balance._sum.points ?? 0,
    };
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
