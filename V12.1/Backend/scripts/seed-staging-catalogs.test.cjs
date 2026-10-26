'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { URL } = require('node:url');
const {
  assertTarget,
  loadCatalogs,
  catalog,
} = require('./seed-staging-catalogs.cjs');

const validEnv = {
  APP_MODE: 'staging',
  PAYMENT_ENV: 'demo',
  DEMO_WALLET_ENABLED: 'true',
  VERCEL_ENV: 'production',
  STAGING_CATALOG_SEED_CONFIRM: 'primax-v12-db-staging',
  DATABASE_NEON_PROJECT_ID: 'fixture-only',
  DATABASE_URL:
    'postgresql://fixture:fixture@ep-fixture-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require',
  DATABASE_URL_UNPOOLED:
    'postgresql://fixture:fixture@ep-fixture.sa-east-1.aws.neon.tech/neondb?sslmode=require',
};

test('accepts only the confirmed São Paulo Neon staging target', () => {
  assert.equal(
    new URL(assertTarget(validEnv)).hostname,
    'ep-fixture.sa-east-1.aws.neon.tech',
  );
  for (const overrides of [
    { APP_MODE: 'local' },
    { APP_MODE: 'production' },
    { PAYMENT_ENV: 'sandbox' },
    { VERCEL_ENV: 'preview' },
    { STAGING_CATALOG_SEED_CONFIRM: '' },
    { DATABASE_NEON_PROJECT_ID: '' },
    { CULQI_SECRET_KEY: 'fixture-only' },
    { DATABASE_URL: validEnv.DATABASE_URL.replace('sa-east-1', 'us-east-1') },
    { DATABASE_URL_UNPOOLED: validEnv.DATABASE_URL },
  ]) {
    assert.throws(() => assertTarget({ ...validEnv, ...overrides }));
  }
});

test('creates only catalogs and inventory, with duplicate preservation', async () => {
  const writes = [];
  const tx = {
    station: {
      findUnique: async () => null,
      findUniqueOrThrow: async () => ({ id: 'station-id' }),
      createMany: async (args) => {
        writes.push(['station', args]);
        return { count: 1 };
      },
    },
    fuel: {
      findUnique: async () => null,
      findMany: async () => [
        { id: 'fuel-1' },
        { id: 'fuel-2' },
        { id: 'fuel-3' },
      ],
      createMany: async (args) => {
        writes.push(['fuel', args]);
        return { count: 3 };
      },
    },
    benefit: {
      findUnique: async () => null,
      createMany: async (args) => {
        writes.push(['benefit', args]);
        return { count: 3 };
      },
    },
    fuelInventory: {
      createMany: async (args) => {
        writes.push(['fuelInventory', args]);
        return { count: 3 };
      },
    },
  };
  const result = await loadCatalogs({ $transaction: (work) => work(tx) });
  assert.deepEqual(result, {
    stations: 1,
    fuels: 3,
    benefits: 3,
    inventory: 3,
  });
  assert.deepEqual(
    writes.map(([model]) => model),
    ['station', 'fuel', 'benefit', 'fuelInventory'],
  );
  assert.ok(writes.every(([, args]) => args.skipDuplicates === true));
  assert.equal(writes[3][1].data.length, 3);
  assert.ok(writes[3][1].data.every((row) => row.liters === '5000'));
});

test('refuses conflicting catalog rows before writing anything', async () => {
  let wrote = false;
  const tx = {
    station: {
      findUnique: async () => ({
        code: 'STAGING-DEMO-01',
        name: 'Different station',
      }),
      createMany: async () => {
        wrote = true;
      },
    },
  };
  await assert.rejects(
    loadCatalogs({ $transaction: (work) => work(tx) }),
    /EXISTING_STATION_CONFLICT/,
  );
  assert.equal(wrote, false);
});

test('a rerun preserves existing catalogs and inventory', async () => {
  const writes = [];
  const existing = {
    station: catalog.station,
    fuels: catalog.fuels.map((fuel) => ({
      ...fuel,
      pricePerGallon: String(Number(fuel.pricePerGallon)),
    })),
    benefits: catalog.benefits,
  };
  const createMany = (model) => async (args) => {
    writes.push([model, args]);
    return { count: 0 };
  };
  const tx = {
    station: {
      findUnique: async () => existing.station,
      findUniqueOrThrow: async () => ({ id: 'station-id' }),
      createMany: createMany('station'),
    },
    fuel: {
      findUnique: async ({ where }) =>
        existing.fuels.find((fuel) => fuel.code === where.code),
      findMany: async () =>
        existing.fuels.map((fuel, index) => ({ ...fuel, id: `fuel-${index}` })),
      createMany: createMany('fuel'),
    },
    benefit: {
      findUnique: async ({ where }) =>
        existing.benefits.find((benefit) => benefit.code === where.code),
      createMany: createMany('benefit'),
    },
    fuelInventory: { createMany: createMany('fuelInventory') },
  };
  assert.deepEqual(await loadCatalogs({ $transaction: (work) => work(tx) }), {
    stations: 0,
    fuels: 0,
    benefits: 0,
    inventory: 0,
  });
  assert.deepEqual(
    writes.map(([model]) => model),
    ['station', 'fuel', 'benefit', 'fuelInventory'],
  );
  assert.ok(writes.every(([, args]) => args.skipDuplicates === true));
});
