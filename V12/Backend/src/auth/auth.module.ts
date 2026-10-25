import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module';
import { AccessGuard } from './access.guard';
import { PasswordResetService } from './password-reset.service';
import { RecoveryDelivery } from './recovery-delivery';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AdminController } from './admin.controller';
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '1h',
          issuer: 'primax-v6',
          audience: 'primax-prime',
          algorithm: 'HS256',
        },
        verifyOptions: {
          issuer: 'primax-v6',
          audience: 'primax-prime',
          algorithms: ['HS256'],
        },
      }),
    }),
  ],
  controllers: [AuthController, AdminController],
  providers: [
    AuthService,
    PasswordResetService,
    RecoveryDelivery,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AuthModule {}
