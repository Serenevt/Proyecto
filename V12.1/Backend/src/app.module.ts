import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnvironment } from './config/environment';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MembershipsModule } from './memberships/memberships.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { StationsModule } from './stations/stations.module';
import { FuelsModule } from './fuels/fuels.module';
import { TransactionsModule } from './transactions/transactions.module';
import { WalletModule } from './wallet/wallet.module';
import { BenefitsModule } from './benefits/benefits.module';
import { HealthModule } from './health/health.module';
import { AlertsModule } from './alerts/alerts.module';
import { OperationsModule } from './operations/operations.module';
import { InventoryModule } from './inventory/inventory.module';
import { ControlModule } from './control/control.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    // Signed gateway requests are independently authenticated and throttled in Redis.
    // A forged signature is rejected by AccessGuard/KioskService, never treated as a member request.
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
        skipIf: (context) =>
          Boolean(
            context.switchToHttp().getRequest().headers['x-kiosk-signature'],
          ),
      },
    ]),
    AlertsModule,
    AuthModule,
    MembershipsModule,
    VehiclesModule,
    StationsModule,
    FuelsModule,
    TransactionsModule,
    WalletModule,
    BenefitsModule,
    HealthModule,
    OperationsModule,
    InventoryModule,
    ControlModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
