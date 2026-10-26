import { DemoWalletProvider } from './demo-provider';
import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CulqiProvider, PAYMENT_PROVIDER } from './payment-provider';
import { PaymentLifecycleController, PaymentLifecycleService } from './payment-lifecycle';
import { PaymentWebhookController } from './webhook';
import { OnlineOrdersController, OnlineOrdersService } from './online-orders';
@Module({ controllers:[OnlineOrdersController,PaymentWebhookController,PaymentLifecycleController],providers: [PaymentsService,CulqiProvider,DemoWalletProvider,{provide:PAYMENT_PROVIDER,inject:[CulqiProvider,DemoWalletProvider],useFactory:(commercial:CulqiProvider,demo:DemoWalletProvider)=>process.env.DEMO_WALLET_ENABLED==='true'?demo:commercial},OnlineOrdersService,PaymentLifecycleService], exports: [PaymentsService] })
export class PaymentsModule {}
