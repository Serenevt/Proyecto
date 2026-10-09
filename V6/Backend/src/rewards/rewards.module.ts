import { Module } from '@nestjs/common';
import { PointsPolicyService } from './points-policy.service';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';
import { RewardsRepository } from './rewards.repository';
@Module({
  controllers: [RewardsController],
  providers: [RewardsService, RewardsRepository, PointsPolicyService],
  exports: [PointsPolicyService],
})
export class RewardsModule {}
