import { validateEnvironment } from './environment';

const base = {
  DATABASE_URL: 'postgresql://staging.example.test/app?sslmode=require',
  JWT_SECRET: 'j'.repeat(32),
  KIOSK_API_KEY: 'k'.repeat(32),
  CORS_ORIGINS: 'https://prime-staging.example.test',
};
const staging = {
  ...base,
  APP_MODE: 'staging',
  PAYMENT_ENV: 'demo',
  DEMO_WALLET_ENABLED: 'true',
  SHOW_DEMO_ADMIN_CREDENTIALS: 'false',
  CULQI_SECRET_KEY: '',
  PAYMENT_WEBHOOK_SECRET: '',
};

describe('staging environment boundary', () => {
  it('accepts only the explicitly configured demo mode', () => {
    expect(validateEnvironment(staging)).toMatchObject({ APP_MODE: 'staging' });
    for (const patch of [
      { PAYMENT_ENV: 'sandbox' },
      { PAYMENT_ENV: 'production' },
      { DEMO_WALLET_ENABLED: 'false' },
    ]) expect(() => validateEnvironment({ ...staging, ...patch })).toThrow();
  });

  it.each([
    { CULQI_SECRET_KEY: 'sk_live_forbidden' },
    { CULQI_SECRET_KEY: 'sk_test_forbidden' },
    { PAYMENT_WEBHOOK_SECRET: 'forbidden' },
    { SHOW_DEMO_ADMIN_CREDENTIALS: 'true' },
    { PASSWORD_RESET_DELIVERY: 'mailpit' },
    { CORS_ORIGINS: 'http://prime-staging.example.test' },
    { CORS_ORIGINS: 'https://prime-staging.example.test/path' },
    { CORS_ORIGINS: '' },
  ])('rejects unsafe staging configuration %p', (patch) => {
    expect(() => validateEnvironment({ ...staging, ...patch })).toThrow();
  });

  it('preserves local/demo and production configuration', () => {
    expect(validateEnvironment({
      ...base,
      APP_MODE: 'local',
      PAYMENT_ENV: 'demo',
      DEMO_WALLET_ENABLED: 'true',
    })).toMatchObject({ APP_MODE: 'local' });
    expect(validateEnvironment({
      ...base,
      APP_MODE: 'production',
      PAYMENT_ENV: 'production',
      DEMO_WALLET_ENABLED: 'false',
      CULQI_SECRET_KEY: 'sk_live_fixture',
      PAYMENT_WEBHOOK_SECRET: 'w'.repeat(32),
      PASSWORD_RESET_DELIVERY: 'smtp',
      SMTP_HOST: 'smtp.example.test',
      SMTP_FROM: 'test@example.test',
      PLATE_RECOGNITION_URL: 'https://ocr.example.test',
    })).toMatchObject({ APP_MODE: 'production' });
  });
});
