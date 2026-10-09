import '../src/config/load-env';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
const prisma = new PrismaClient();
async function seed() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8 || Buffer.byteLength(password) > 72)
    throw new Error('Set DEMO_PASSWORD (8-72 bytes)');
  const passwordHash = await hash(password, 12);
  await prisma.$transaction(async (tx) => {
    // Empty updates preserve existing credentials, balances and user edits on reruns.
    const user = await tx.user.upsert({
      where: { email: 'demo@primaxprime.pe' },
      update: {},
      create: { email: 'demo@primaxprime.pe', name: 'Diego', passwordHash },
    });
    const membership = await tx.membership.upsert({
      where: { number: 'PRIME-0001' },
      update: {},
      create: { number: 'PRIME-0001', userId: user.id },
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
  console.log(
    'Seed OK: Diego / PRIME-0001 / ABC-123; catálogos listos. Sin saldos artificiales.',
  );
}
seed()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
