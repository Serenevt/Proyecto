// One-time bootstrap for a new, empty V12.1 academic Neon database.
const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');

function assertTarget(env) {
  if (env.APP_MODE !== 'academic' || env.PAYMENT_ENV !== 'demo' ||
      env.DATABASE_PURPOSE !== 'academic-demo' || env.STAGING_SEED_CONFIRM !== 'primax-v12-1-staging')
    throw new Error('Academic staging seed requires explicit isolated staging confirmation');
  let pooled, direct;
  try {
    pooled = new URL(env.DATABASE_URL);
    direct = new URL(env.DATABASE_URL_UNPOOLED);
  } catch {
    throw new Error('Both Neon database URLs are required');
  }
  if (!pooled.hostname.endsWith('.neon.tech') || !direct.hostname.endsWith('.neon.tech') ||
      pooled.hostname.replace('-pooler.', '.') !== direct.hostname ||
      pooled.pathname !== direct.pathname || pooled.username !== direct.username ||
      pooled.searchParams.get('sslmode') !== 'require' || direct.searchParams.get('sslmode') !== 'require')
    throw new Error('Pooled and direct URLs must target the same TLS Neon database');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.KIOSK_STATION_ID || ''))
    throw new Error('KIOSK_STATION_ID must be a UUID');
  const users = [
    ['STAGING_ADMIN_EMAIL', 'STAGING_ADMIN_PASSWORD'],
    ['STAGING_SUPERVISOR_EMAIL', 'STAGING_SUPERVISOR_PASSWORD'],
    ['STAGING_PRIME_EMAIL', 'STAGING_PRIME_PASSWORD'],
  ];
  for (const [emailKey, passwordKey] of users) {
    const email = env[emailKey] || '';
    const password = env[passwordKey] || '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 16 ||
        Buffer.byteLength(password) > 72 || password.includes('REPLACE_'))
      throw new Error(`${emailKey} and a private 16-72 byte ${passwordKey} are required`);
  }
  if (new Set(users.map(([key]) => env[key].toLowerCase())).size !== users.length)
    throw new Error('Staging users must have distinct emails');
}

async function main() {
  assertTarget(process.env);
  const db = new PrismaClient();
  try {
    const [migrations, stationCount, userCount, fuelCount] = await Promise.all([
      db.$queryRaw`SELECT COUNT(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      db.station.count(), db.user.count(), db.fuel.count(),
    ]);
    if (migrations[0].count !== 26 || stationCount || userCount || fuelCount)
      throw new Error('Expected all 26 migrations and an empty application database; no changes made');
    const passwords = await Promise.all([
      hash(process.env.STAGING_ADMIN_PASSWORD, 12),
      hash(process.env.STAGING_SUPERVISOR_PASSWORD, 12),
      hash(process.env.STAGING_PRIME_PASSWORD, 12),
    ]);
    await db.$transaction(async (tx) => {
      const station = await tx.station.create({ data: {
        id: process.env.KIOSK_STATION_ID.toLowerCase(), code: 'PRIMAX-SUR',
        name: 'Primax Sur', address: 'Lima, Perú (estación académica)',
      } });
      for (const [code, name, pricePerGallon] of [
        ['REGULAR', 'Regular', '21.30'],
        ['PREMIUM', 'Premium', '23.50'],
        ['DIESEL', 'Diésel', '26.20'],
      ]) {
        const fuel = await tx.fuel.create({ data: { code, name, pricePerGallon } });
        await tx.fuelInventory.create({ data: { stationId: station.id, fuelId: fuel.id, liters: '5000' } });
      }
      const pump = await tx.pump.create({ data: { stationId: station.id, code: '03', name: 'Surtidor 03' } });
      const terminal = await tx.terminal.create({ data: { stationId: station.id, code: 'PRIMAX-SUR-T01' } });
      await tx.terminalPumpAssignment.create({ data: { stationId: station.id, terminalId: terminal.id, pumpId: pump.id } });
      const admin = await tx.user.create({ data: {
        email: process.env.STAGING_ADMIN_EMAIL.toLowerCase(), name: 'Administrador académico', passwordHash: passwords[0],
      } });
      await tx.userPermissionGrant.create({ data: {
        userId: admin.id, permission: 'SYSTEM_ADMIN', reason: 'Bootstrap V12.1 staging académico',
      } });
      const supervisor = await tx.user.create({ data: {
        email: process.env.STAGING_SUPERVISOR_EMAIL.toLowerCase(), name: 'Supervisor académico', passwordHash: passwords[1],
      } });
      await tx.supervisorStationAssignment.create({ data: {
        userId: supervisor.id, stationId: station.id, reason: 'Bootstrap V12.1 staging académico',
      } });
      const prime = await tx.user.create({ data: {
        email: process.env.STAGING_PRIME_EMAIL.toLowerCase(), name: 'Cliente académico', passwordHash: passwords[2],
      } });
      const membership = await tx.membership.create({ data: { number: 'PRIM-001', userId: prime.id, dni: '12345678' } });
      await tx.$executeRaw`UPDATE "MembershipNumberCounter" SET "value" = GREATEST("value", 1) WHERE "id" = 1`;
      await tx.vehicle.create({ data: { plate: 'ABC-123', label: 'Vehículo académico', membershipId: membership.id } });
    });
    console.log('Academic staging bootstrap complete: one station, pump, terminal, three fuels and users.');
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Academic staging seed failed');
    process.exitCode = 1;
  });

module.exports = { assertTarget };
