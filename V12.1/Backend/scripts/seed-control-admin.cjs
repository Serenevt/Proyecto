// Explicit first-login bootstrap for the isolated V12.1 local DEMO database.
const { PrismaClient } = require('@prisma/client');
const { compare, hash } = require('bcryptjs');
const { assertLocalDatabase } = require('./database-safety.cjs');

async function main() {
  if (process.env.APP_MODE !== 'local' || process.env.PAYMENT_ENV !== 'demo' || process.env.DEMO_CONTROL_ADMIN_ENABLED !== 'true' || process.env.DATABASE_PURPOSE !== 'local-v12.1-demo')
    throw new Error('Control admin seed requires the isolated local V12.1 DEMO profile');
  assertLocalDatabase();
  const email = String(process.env.DEMO_CONTROL_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.DEMO_CONTROL_ADMIN_PASSWORD || '');
  if (!/^[^@\s]+@primax\.local$/.test(email) || password.length < 16 || Buffer.byteLength(password) > 72 || password.includes('REPLACE_'))
    throw new Error('Set a local @primax.local admin email and 16-72 byte demo password');
  const db = new PrismaClient();
  try {
    const user = await db.user.findUnique({ where: { email }, include: { permissionGrants: { where: { permission: 'SYSTEM_ADMIN', revokedAt: null } } } });
    if (user) {
      if (!user.active || user.permissionGrants.length !== 1 || !(await compare(password, user.passwordHash)))
        throw new Error('The configured demo admin already exists without the expected active global grant; no changes made');
      return;
    }
    const passwordHash = await hash(password, 12);
    await db.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email, name: 'Primax Control DEMO', passwordHash } });
      await tx.userPermissionGrant.create({ data: { userId: created.id, permission: 'SYSTEM_ADMIN', reason: 'Bootstrap explícito de base local DEMO V12.1' } });
    });
    console.log('Primax Control DEMO administrator bootstrapped.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Control demo seed failed');
  process.exitCode = 1;
});
