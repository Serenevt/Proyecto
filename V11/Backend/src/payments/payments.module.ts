import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CulqiProvider } from './payment-provider';
import { OnlineOrdersController, OnlineOrdersService } from './online-orders';
@Module({ controllers:[OnlineOrdersController],providers: [PaymentsService,CulqiProvider,OnlineOrdersService], exports: [PaymentsService] })
export class PaymentsModule {}
