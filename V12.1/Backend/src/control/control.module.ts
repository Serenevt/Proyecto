import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RecoveryDelivery } from '../auth/recovery-delivery';
import { ControlController } from './control.controller';
import { ControlService } from './control.service';
import { InventoryModule } from '../inventory/inventory.module';
import { ControlOperationsController } from './control-operations.controller';
import { ControlOperationsService } from './control-operations.service';

@Module({
  imports: [
    InventoryModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          issuer: 'primax-v6',
          audience: 'primax-prime',
          algorithm: 'HS256' as const,
        },
        verifyOptions: {
          issuer: 'primax-v6',
          audience: 'primax-prime',
          algorithms: ['HS256'] as const,
        },
      }),
    }),
  ],
  controllers: [ControlController, ControlOperationsController],
  providers: [ControlService, ControlOperationsService, RecoveryDelivery],
})
export class ControlModule {}
