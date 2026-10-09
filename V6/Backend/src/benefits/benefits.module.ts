import { Module } from '@nestjs/common';
import { BenefitsController } from './benefits.controller';
import { BenefitsService } from './benefits.service';
import { BenefitsRepository } from './benefits.repository';
@Module({
  controllers: [BenefitsController],
  providers: [BenefitsService, BenefitsRepository],
})
export class BenefitsModule {}
