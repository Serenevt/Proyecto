import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RedeemDto } from './redeem.dto';
import { RewardsRepository } from './rewards.repository';
@Injectable()
export class RewardsService {
  constructor(private readonly repo: RewardsRepository) {}
  redeem(userId: string, dto: RedeemDto) {
    return this.repo.atomic(async (tx) => {
      const membership = await this.repo.membership(userId, tx);
      if (!membership) throw new NotFoundException('Membresía no encontrada');
      const previous = await this.repo.byOperation(dto.operationId, tx);
      if (previous) {
        if (
          previous.membershipId !== membership.id ||
          previous.benefitId !== dto.benefitId
        )
          throw new ConflictException('operationId ya usado con otros datos');
        return { redemption: previous, replayed: true };
      }
      if (membership.status !== 'ACTIVE' || !membership.user.active)
        throw new BadRequestException('Membresía inactiva');
      const benefit = await this.repo.benefit(dto.benefitId, tx);
      if (!benefit?.active)
        throw new NotFoundException('Beneficio no disponible');
      const balance = await this.repo.balance(membership.id, tx);
      if (balance < benefit.pointsCost)
        throw new BadRequestException('Puntos insuficientes');
      const redemption = await this.repo.create(
        {
          operationId: dto.operationId,
          membershipId: membership.id,
          benefitId: benefit.id,
          pointsSpent: benefit.pointsCost,
          rewardMovement: {
            create: {
              membershipId: membership.id,
              points: -benefit.pointsCost,
              kind: 'REDEEM',
            },
          },
        },
        tx,
      );
      return { redemption, replayed: false };
    });
  }
}
