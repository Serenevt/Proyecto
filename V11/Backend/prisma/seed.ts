import '../src/config/load-env';
import { PrismaClient } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
const prisma = new PrismaClient();
const DEMO_EMAIL = 'demo@primaxprime.pe';
async function seed() {
  const password = process.env.DEMO_PASSWORD;
  if (
    !password ||
    password.includes('REPLACE_') ||
    password.length < 8 ||
    Buffer.byteLength(password) > 72
  )
    throw new Error('Set DEMO_PASSWORD (8-72 bytes)');
  const passwordHash = await hash(password, 12);
  // Detecta si la cuenta demo ya existía con otra contraseña.
  //
  // El seed nunca sobrescribe credenciales: si DEMO_PASSWORD cambia en .env
  // después del primer arranque, el hash guardado deja de coincidir y el login
  // responde 401 sin explicación. Aquí solo se AVISA y se ofrece la orden
  // explícita para resincronizar. No se modifica ninguna fila por sorpresa y
  // jamás se tocan usuarios reales: esto solo aplica a la cuenta demo, que es
  // la única que este seed crea.
  const existing = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true, passwordHash: true },
  });
  const demoDrift = existing
    ? !(await compare(password, existing.passwordHash))
    : false;
  // RESYNC_DEMO_PASSWORD=1 es la única vía para reescribir el hash, y solo
  // afecta a la cuenta de demostración.
  const resync = process.env.RESYNC_DEMO_PASSWORD === '1';
  if (existing && demoDrift && !resync)
    console.warn(
      'Seed: la contraseña de la cuenta demo NO coincide con DEMO_PASSWORD. ' +
        'El login devolverá 401. No se modificó ninguna fila. ' +
        'Para resincronizar solo esa cuenta: RESYNC_DEMO_PASSWORD=1 npm run prisma:seed',
    );
  if (existing && demoDrift && resync) {
    await prisma.user.update({
      where: { email: DEMO_EMAIL },
      data: { passwordHash },
    });
    if (process.env.APP_MODE === 'local') {
    for (const station of await prisma.station.findMany())
      for (const fuel of await prisma.fuel.findMany())
        await prisma.fuelInventory.upsert({
          where: { stationId_fuelId: { stationId: station.id, fuelId: fuel.id } },
          update: {}, // Never replenish existing stock on restart.
          create: { stationId: station.id, fuelId: fuel.id, liters: 5000 },
        });
  }
  console.log(
      'Seed: hash de la cuenta demo resincronizado con DEMO_PASSWORD.',
    );
  }
  await prisma.$transaction(async (tx) => {
    // Empty updates preserve existing credentials, balances and user edits on reruns.
    const user = await tx.user.upsert({
      where: { email: DEMO_EMAIL },
      update: {},
      create: { email: DEMO_EMAIL, name: 'Diego', passwordHash },
    });
    const membership = await tx.membership.upsert({
      where: { number: 'PRIME-0001' },
      update: {},
      create: {
        number: 'PRIME-0001',
        userId: user.id,
        dni: '12345678',
        ruc: '20123456789',
        businessName: 'Transportes Demo Ficticios SAC',
      },
    });
    for (const [plate, label, membershipId] of [
      ['ABC-123', 'Mi auto', membership.id],
      ['DEF-456', 'Auto familiar', membership.id],
      ['XYZ-999', 'Vehículo sin membresía', null],
    ] as const) {
      await tx.vehicle.upsert({
        where: { plate },
        update: {},
        create: { plate, label, membershipId },
      });
    }
    await tx.station.upsert({
      where: { code: 'PRIMAX-SUR' },
      update: {},
      create: {
        code: 'PRIMAX-SUR',
        name: 'Primax Sur',
        address: 'Lima, Perú (estación demo)',
      },
    });
    for (const [code, name, pricePerGallon] of [
      ['REGULAR', 'Regular', '21.30'],
      ['PREMIUM', 'Premium', '23.50'],
      ['DIESEL', 'Diésel', '26.20'],
    ]) {
      await tx.fuel.upsert({
        where: { code },
        update: {},
        create: { code, name, pricePerGallon },
      });
    }
    for (const benefit of [
      {
        code: 'fuel',
        title: 'Más kilómetros, menos gasto',
        description: 'Ahorra S/ 0.30 por galón en tu próxima visita.',
        category: 'COMBUSTIBLE',
        pointsCost: 500,
      },
      {
        code: 'coffee',
        title: 'Un café va por nuestra cuenta',
        description: 'Café americano en tiendas Listo! participantes.',
        category: 'TU PAUSA FAVORITA',
        pointsCost: 400,
      },
      {
        code: 'wash',
        title: 'Tu auto, como nuevo',
        description: '20% de descuento en lavado de auto.',
        category: 'CUIDAMOS TU AUTO',
        pointsCost: 700,
      },
    ])
      await tx.benefit.upsert({
        where: { code: benefit.code },
        update: {},
        create: benefit,
      });
  });
  if (process.env.APP_MODE === 'local') {
    for (const station of await prisma.station.findMany())
      for (const fuel of await prisma.fuel.findMany())
        await prisma.fuelInventory.upsert({
          where: { stationId_fuelId: { stationId: station.id, fuelId: fuel.id } },
          update: {}, // Never replenish existing stock on restart.
          create: { stationId: station.id, fuelId: fuel.id, liters: 5000 },
        });
  }
  console.log(
    'Seed OK: Diego / PRIME-0001 / ABC-123; catálogos listos. Sin saldos artificiales.' +
      (existing && !demoDrift ? ' Contraseña demo verificada.' : ''),
  );
}
seed()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
