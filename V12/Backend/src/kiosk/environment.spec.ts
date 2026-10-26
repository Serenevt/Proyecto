import { validateEnvironment } from '../config/environment';
import { hashSync } from 'bcryptjs';
const base = () => ({
  DATABASE_URL: 'postgresql://test:test@localhost/demo?sslmode=require',
  JWT_SECRET: 'j'.repeat(48),
  KIOSK_API_KEY: 'k'.repeat(48),
  APP_MODE: 'academic',
  PAYMENT_ENV: 'demo',
  DEMO_WALLET_ENABLED: 'true',
  DATABASE_PURPOSE: 'academic-demo',
  CORS_ORIGINS: 'https://fuel.example,https://prime.example',
  PLATE_RECOGNITION_ENABLED: 'false',
  PASSWORD_RESET_DELIVERY: 'disabled',
  KIOSK_GATEWAY_SECRET: 'g'.repeat(48),
  KIOSK_REDIS_REST_TOKEN: 'r'.repeat(48),
  KIOSK_REDIS_REST_URL: 'https://redis.example',
  KIOSK_SESSION_NAMESPACE: 'academic-test',
  KIOSK_STATION_ID: '11111111-1111-4111-8111-111111111111',
  KIOSK_OPERATOR_USER: 'operator-test',
  KIOSK_OPERATOR_PASSWORD_HASH: hashSync('fixture-password', 12),
});
describe('public academic configuration fails closed', () => {
  it('prevents the local demo profile from using a remote database', () => {
    expect(() => validateEnvironment({ ...base(), APP_MODE: 'local', DATABASE_URL: 'postgresql://test:test@remote.example/demo' })).toThrow('Local profile cannot connect');
  });
  const env = base();
  it('accepts isolated simulated configuration without Culqi, SMTP or OCR', () => {
    expect(validateEnvironment(env).PORT).toBe(3000);
  });
  for (const [key, value] of Object.entries({
    CULQI_SECRET_KEY: 'fictional-key',
    PAYMENT_ENV: 'production',
    DATABASE_PURPOSE: 'production',
    SHOW_DEMO_ADMIN_CREDENTIALS: 'true',
    CORS_ORIGINS: 'http://localhost:5180',
    KIOSK_GATEWAY_SECRET: '',
    KIOSK_REDIS_REST_URL: 'http://redis.example',
    KIOSK_OPERATOR_PASSWORD_HASH: '',
    KIOSK_STATION_ID: 'arbitrary',
  }))
    it(`rejects invalid ${key}`, () =>
      expect(() => validateEnvironment({ ...env, [key]: value })).toThrow());
  it('rejects local mode on Vercel and invalid database URLs without exposing their input', () => {
    expect(() =>
      validateEnvironment({ ...env, APP_MODE: 'local', VERCEL: '1' }),
    ).toThrow();
    expect(() =>
      validateEnvironment({
        ...env,
        DATABASE_URL: 'fictional-sensitive-input',
      }),
    ).toThrow('Invalid DATABASE_URL (value withheld)');
  });
});
