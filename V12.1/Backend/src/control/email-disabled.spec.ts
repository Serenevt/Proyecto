import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ServiceUnavailableException } from '@nestjs/common';
import { ControlService } from './control.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecoveryDelivery } from '../auth/recovery-delivery';
import { PasswordResetService } from '../auth/password-reset.service';

describe('email disabled in the academic MVP', () => {
  const db = { user: { findUnique: jest.fn() }, atomic: jest.fn() };
  const delivery = { mode: 'disabled', sendAdminVerification: jest.fn(), send: jest.fn() };
  const config = { get: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('rejects a public Control request before creating a pending account', async () => {
    const service = new ControlService(
      db as unknown as PrismaService,
      {} as JwtService,
      config as unknown as ConfigService,
      delivery as unknown as RecoveryDelivery,
    );
    await expect(service.requestAccess({
      email: 'person@example.test', name: 'Person', password: 'fixture-only', role: 'ENCARGADO',
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.atomic).not.toHaveBeenCalled();
    expect(delivery.sendAdminVerification).not.toHaveBeenCalled();
  });

  it('rejects recovery before querying an account or issuing a code', async () => {
    const service = new PasswordResetService(
      db as unknown as PrismaService,
      config as unknown as ConfigService,
      delivery as unknown as RecoveryDelivery,
    );
    await expect(service.forgot({ email: 'person@example.test' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.atomic).not.toHaveBeenCalled();
    expect(delivery.send).not.toHaveBeenCalled();
  });
});
