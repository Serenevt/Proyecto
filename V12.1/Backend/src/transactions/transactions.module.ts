import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { RewardsModule } from '../rewards/rewards.module';
import { WalletModule } from '../wallet/wallet.module';
import { AuthorizationsController } from './authorizations.controller';
import { AuthorizationsRepository } from './authorizations.repository';
import { AuthorizationsService } from './authorizations.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';

@Module({
  // RewardsModule aporta PointsPolicyService; WalletModule aporta WalletRepository;
  // PaymentsModule aporta PaymentsService.
  imports: [WalletModule, RewardsModule, PaymentsModule],
  controllers: [TransactionsController, AuthorizationsController],
  providers: [
    TransactionsService,
    TransactionsRepository,
    AuthorizationsService,
    AuthorizationsRepository,
  ],
  exports: [TransactionsService, AuthorizationsService],
})
export class TransactionsModule {}
