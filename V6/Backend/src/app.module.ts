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
import { BenefitsModule } from './benefits/benefits.module';
import { HealthModule } from './health/health.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    AuthModule,
    MembershipsModule,
    VehiclesModule,
    StationsModule,
    FuelsModule,
    TransactionsModule,
    BenefitsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
