const test = require('node:test');
const assert = require('node:assert/strict');
const { assertTarget } = require('./seed-academic-staging.cjs');

const valid = {
  APP_MODE: 'academic', PAYMENT_ENV: 'demo', DATABASE_PURPOSE: 'academic-demo',
  STAGING_SEED_CONFIRM: 'primax-v12-1-staging',
  DATABASE_URL: 'postgresql://user:private@ep-test-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
  DATABASE_URL_UNPOOLED: 'postgresql://user:private@ep-test.us-east-1.aws.neon.tech/neondb?sslmode=require',
  KIOSK_STATION_ID: '11111111-1111-4111-8111-111111111111',
  STAGING_ADMIN_EMAIL: 'admin@example.test', STAGING_ADMIN_PASSWORD: 'example-private-admin-password',
  STAGING_SUPERVISOR_EMAIL: 'supervisor@example.test', STAGING_SUPERVISOR_PASSWORD: 'example-private-supervisor-password',
  STAGING_PRIME_EMAIL: 'prime@example.test', STAGING_PRIME_PASSWORD: 'example-private-prime-password',
};

test('academic seed accepts only the confirmed isolated Neon target', () => {
  assert.doesNotThrow(() => assertTarget(valid));
  for (const patch of [
    { STAGING_SEED_CONFIRM: '' },
    { APP_MODE: 'production' },
    { DATABASE_URL_UNPOOLED: valid.DATABASE_URL_UNPOOLED.replace('ep-test.', 'ep-other.') },
    { DATABASE_URL: valid.DATABASE_URL.replace('sslmode=require', 'sslmode=disable') },
    { STAGING_SUPERVISOR_EMAIL: valid.STAGING_ADMIN_EMAIL },
  ]) assert.throws(() => assertTarget({ ...valid, ...patch }));
});
