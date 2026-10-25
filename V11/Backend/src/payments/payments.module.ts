import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CulqiProvider, PAYMENT_PROVIDER } from './payment-provider';
import { PaymentLifecycleController, PaymentLifecycleService } from './payment-lifecycle';
import { PaymentWebhookController } from './webhook';
import { OnlineOrdersController, OnlineOrdersService } from './online-orders';
@Module({ controllers:[OnlineOrdersController,PaymentWebhookController,PaymentLifecycleController],providers: [PaymentsService,CulqiProvider,{provide:PAYMENT_PROVIDER,useExisting:CulqiProvider},OnlineOrdersService,PaymentLifecycleService], exports: [PaymentsService] })
export class PaymentsModule {}
