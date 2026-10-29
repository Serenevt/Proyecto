import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { RecoveryDelivery } from './recovery-delivery';
import { validateEnvironment } from '../config/environment';
import { demoAdminEnabled } from './admin.controller';
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
const base = {
  DATABASE_URL: 'postgresql://test',
  JWT_SECRET: 'x'.repeat(32),
  KIOSK_API_KEY: 'y'.repeat(32),
};
describe('SMTP configuration and local credential boundary', () => {
  beforeEach(() => jest.clearAllMocks());
  it('SMTP sends code through authenticated TLS without exposing it in the response', async () => {
    const sendMail = jest
      .fn()
      .mockResolvedValue({ accepted: ['person@example.test'] });
    (createTransport as jest.Mock).mockReturnValue({ sendMail });
    const delivery = new RecoveryDelivery(
      new ConfigService({
        PASSWORD_RESET_DELIVERY: 'smtp',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_USER: 'fixture',
        SMTP_PASSWORD: 'fixture-only',
        SMTP_FROM: 'no-reply@example.test',
      }),
    );
    expect(
      await delivery.send('person@example.test', '12345678', new Date(0)),
    ).toBeUndefined();
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.test',
        port: 587,
        requireTLS: true,
        secure: false,
        auth: { user: 'fixture', pass: 'fixture-only' },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'person@example.test',
        text: expect.stringContaining('12345678'),
      }),
    );
  });
  it.each(['SMTP_HOST', 'SMTP_FROM'])('SMTP rejects missing %s', (key) => {
    const env: Record<string, unknown> = {
      ...base,
      PASSWORD_RESET_DELIVERY: 'smtp',
      SMTP_HOST: 'smtp.example.test',
      SMTP_FROM: 'test@example.test',
    };
    delete env[key];
    expect(() => validateEnvironment(env)).toThrow();
  });
  it.each(['PASSWORD_RESET_TTL_MINUTES', 'PASSWORD_RESET_MAX_ATTEMPTS'])(
    'rejects invalid recovery configuration %s',
    (key) => {
      expect(() => validateEnvironment({ ...base, [key]: '0' })).toThrow();
    },
  );
  it('demo admin requires explicit local mode and enabled switch', () => {
    for (const env of [
      { APP_MODE: '', SHOW_DEMO_ADMIN_CREDENTIALS: '' },
      { APP_MODE: 'production', SHOW_DEMO_ADMIN_CREDENTIALS: 'true' },
      { APP_MODE: 'local', SHOW_DEMO_ADMIN_CREDENTIALS: 'false' },
    ])
      expect(demoAdminEnabled(new ConfigService(env))).toBe(false);
    expect(
      demoAdminEnabled(
        new ConfigService({
          APP_MODE: 'local',
          SHOW_DEMO_ADMIN_CREDENTIALS: 'true',
        }),
      ),
    ).toBe(true);
  });
  it('production rejects demo credentials and unsupported delivery modes', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_MODE: 'production',
        SHOW_DEMO_ADMIN_CREDENTIALS: 'true',
      }),
    ).toThrow();
    expect(() =>
      validateEnvironment({
        ...base,
        APP_MODE: 'production',
        PASSWORD_RESET_DELIVERY: 'unsupported',
      }),
    ).toThrow();
  });
});
