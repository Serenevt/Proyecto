'use strict';

const { Prisma, PrismaClient } = require('@prisma/client');
const { URL } = require('node:url');

const station = {
  code: 'STAGING-DEMO-01',
  name: 'Estación ficticia de staging',
  address: 'Ubicación ficticia, Lima, Perú',
  active: true,
};
const fuels = [
  { code: 'REGULAR', name: 'Regular', pricePerGallon: '21.30', active: true },
  { code: 'PREMIUM', name: 'Premium', pricePerGallon: '23.50', active: true },
  { code: 'DIESEL', name: 'Diésel', pricePerGallon: '26.20', active: true },
];
const benefits = [
  {
    code: 'fuel',
    title: 'Más kilómetros, menos gasto',
    description:
      'Descuento ficticio de S/ 0.30 por galón. Sin validez comercial.',
    category: 'COMBUSTIBLE',
    pointsCost: 500,
    active: true,
  },
  {
    code: 'coffee',
    title: 'Un café va por nuestra cuenta',
    description: 'Café ficticio de demostración. Sin validez comercial.',
    category: 'TU PAUSA FAVORITA',
    pointsCost: 400,
    active: true,
  },
  {
    code: 'wash',
    title: 'Tu auto, como nuevo',
    description: 'Lavado ficticio de demostración. Sin validez comercial.',
    category: 'CUIDAMOS TU AUTO',
    pointsCost: 700,
    active: true,
  },
];

function guard(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function assertTarget(env) {
  if (
    env.APP_MODE !== 'staging' ||
    env.PAYMENT_ENV !== 'demo' ||
    env.DEMO_WALLET_ENABLED !== 'true' ||
    env.VERCEL_ENV !== 'production' ||
    env.STAGING_CATALOG_SEED_CONFIRM !== 'primax-v12-db-staging'
  )
    guard('STAGING_CONFIRMATION_REQUIRED');
  if (env.CULQI_SECRET_KEY || env.PAYMENT_WEBHOOK_SECRET)
    guard('LIVE_PAYMENT_CONFIGURATION_FORBIDDEN');
  if (!env.DATABASE_NEON_PROJECT_ID) guard('NEON_INTEGRATION_REQUIRED');

  let pooled;
  let direct;
  try {
    pooled = new URL(env.DATABASE_URL);
    direct = new URL(env.DATABASE_URL_UNPOOLED);
  } catch {
    guard('DATABASE_URLS_REQUIRED');
  }
  if (
    !['postgres:', 'postgresql:'].includes(pooled.protocol) ||
    !['postgres:', 'postgresql:'].includes(direct.protocol) ||
    !pooled.hostname.endsWith('.neon.tech') ||
    !direct.hostname.endsWith('.neon.tech') ||
    !pooled.hostname.includes('.sa-east-1.') ||
    !direct.hostname.includes('.sa-east-1.') ||
    !pooled.hostname.includes('-pooler.') ||
    direct.hostname.includes('-pooler.') ||
    pooled.hostname.replace('-pooler.', '.') !== direct.hostname ||
    pooled.pathname !== direct.pathname ||
    pooled.username !== direct.username ||
    !pooled.password ||
    !direct.password ||
    !['require', 'verify-full'].includes(pooled.searchParams.get('sslmode')) ||
    !['require', 'verify-full'].includes(direct.searchParams.get('sslmode'))
  )
    guard('STAGING_DATABASE_TARGET_MISMATCH');
  return direct.toString();
}

function matches(existing, expected) {
  if (!existing) return true;
  return Object.entries(expected).every(([key, value]) =>
    key === 'pricePerGallon'
      ? new Prisma.Decimal(existing[key]).equals(value)
      : String(existing[key]) === String(value),
  );
}

async function loadCatalogs(prisma) {
  return prisma.$transaction(
    async (tx) => {
      const currentStation = await tx.station.findUnique({
        where: { code: station.code },
      });
      if (!matches(currentStation, station)) guard('EXISTING_STATION_CONFLICT');
      for (const fuel of fuels) {
        const current = await tx.fuel.findUnique({
          where: { code: fuel.code },
        });
        if (!matches(current, fuel)) guard('EXISTING_FUEL_CONFLICT');
      }
      for (const benefit of benefits) {
        const current = await tx.benefit.findUnique({
          where: { code: benefit.code },
        });
        if (!matches(current, benefit)) guard('EXISTING_BENEFIT_CONFLICT');
      }

      const createdStations = await tx.station.createMany({
        data: [station],
        skipDuplicates: true,
      });
      const createdFuels = await tx.fuel.createMany({
        data: fuels,
        skipDuplicates: true,
      });
      const createdBenefits = await tx.benefit.createMany({
        data: benefits,
        skipDuplicates: true,
      });
      const savedStation = await tx.station.findUniqueOrThrow({
        where: { code: station.code },
      });
      const savedFuels = await tx.fuel.findMany({
        where: { code: { in: fuels.map((fuel) => fuel.code) } },
      });
      if (savedFuels.length !== fuels.length) guard('FUEL_CATALOG_INCOMPLETE');
      const createdInventory = await tx.fuelInventory.createMany({
        data: savedFuels.map((fuel) => ({
          stationId: savedStation.id,
          fuelId: fuel.id,
          liters: '5000',
        })),
        skipDuplicates: true,
      });
      return {
        stations: createdStations.count,
        fuels: createdFuels.count,
        benefits: createdBenefits.count,
        inventory: createdInventory.count,
      };
    },
    { timeout: 20000 },
  );
}

async function main() {
  const directUrl = assertTarget(process.env);
  const prisma = new PrismaClient({ datasources: { db: { url: directUrl } } });
  try {
    const created = await loadCatalogs(prisma);
    console.log('Staging catalogs loaded:', JSON.stringify(created));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const code =
      error && /^[A-Z_]+$/.test(error.code)
        ? error.code
        : error?.name || 'UNKNOWN_ERROR';
    console.error('Staging catalog load failed:', code);
    process.exitCode = 1;
  });
}

module.exports = {
  assertTarget,
  loadCatalogs,
  catalog: { station, fuels, benefits },
};
