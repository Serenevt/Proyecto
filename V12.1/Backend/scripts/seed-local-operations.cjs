// Creates one repeatable terminal and supervisor fixture for a local DEMO only.
const { PrismaClient } = require('@prisma/client');
const { compare, hash } = require('bcryptjs');
const { assertLocalDatabase } = require('./database-safety.cjs');

async function main() {
  if (process.env.APP_MODE !== 'local' || process.env.PAYMENT_ENV !== 'demo' || process.env.DEMO_OPERATIONS_ENABLED !== 'true' || process.env.DATABASE_PURPOSE !== 'local-v12.1-demo')
    throw new Error('Operational demo seed requires the isolated local V12.1 DEMO profile');
  assertLocalDatabase();
  const email = String(process.env.DEMO_SUPERVISOR_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.DEMO_SUPERVISOR_PASSWORD || '');
  if (!/^[^@\s]+@primax\.local$/.test(email) || password.length < 12 || Buffer.byteLength(password) > 72 || password.includes('REPLACE_'))
    throw new Error('Set a local @primax.local supervisor email and 12-72 byte demo password');
  const db = new PrismaClient();
  try {
    const station = await db.station.findUnique({ where: { code: 'PRIMAX-SUR' } });
    if (!station?.active) throw new Error('The local DEMO station PRIMAX-SUR must be provisioned by the base seed');
    let user = await db.user.findUnique({ where: { email } });
    const created = !user;
    if (user && (!user.active || !(await compare(password, user.passwordHash))))
      throw new Error('The configured supervisor already exists with a different password or inactive account; no changes made');
    if (!user) user = await db.user.create({ data: { email, name: 'Supervisor Primax DEMO', passwordHash: await hash(password, 12) } });

    const existingAssignment = await db.supervisorStationAssignment.findFirst({ where: { userId: user.id, stationId: station.id, endedAt: null } });
    if (!existingAssignment && !created)
      throw new Error('The configured supervisor exists without the expected active assignment; no changes made');
    if (!existingAssignment) await db.supervisorStationAssignment.create({ data: { userId: user.id, stationId: station.id, reason: 'Asignación inicial local DEMO V12.1' } });

    const [pump, terminal] = await Promise.all([
      db.pump.upsert({ where: { stationId_code: { stationId: station.id, code: '03' } }, update: {}, create: { stationId: station.id, code: '03', name: 'Surtidor DEMO 03' } }),
      db.terminal.upsert({ where: { stationId_code: { stationId: station.id, code: 'PRIMAX-SUR-T01' } }, update: {}, create: { stationId: station.id, code: 'PRIMAX-SUR-T01' } }),
    ]);
    const assignment = await db.terminalPumpAssignment.findFirst({ where: { stationId: station.id, terminalId: terminal.id, pumpId: pump.id, endedAt: null } });
    if (!assignment) await db.terminalPumpAssignment.create({ data: { stationId: station.id, terminalId: terminal.id, pumpId: pump.id } });
    console.log('Local DEMO supervisor, station and terminal fixtures are ready.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Local operations seed failed');
  process.exitCode = 1;
});
