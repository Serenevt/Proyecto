import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { RewardsModule } from '../rewards/rewards.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';
@Module({
  imports: [PaymentsModule, RewardsModule],
  controllers: [TransactionsController],
  providers: [TransactionsRepository, TransactionsService],
})
export class TransactionsModule {}
