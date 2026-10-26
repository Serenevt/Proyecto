import '../src/config/load-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { setupApp } from '../src/setup-app';
import { PaymentsService } from '../src/payments/payments.service';
import { recordedPurchase } from './recorded-purchase';

describe('Guest prepayment in PostgreSQL', () => {
  let app: INestApplication,
    db: PrismaClient,
    stationId: string,
    fuelId: string;
  const original = process.env.DATABASE_URL!;
  const schema = 'e2e_guest_' + randomUUID().replaceAll('-', '');
  const key = process.env.KIOSK_API_KEY!;
  beforeAll(async () => {
    const url = new URL(original);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString(); process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
    for (const [entry, args] of [
      ['prisma/build/index.js', ['migrate', 'deploy']],
      ['ts-node/dist/bin.js', ['prisma/seed.ts']],
    ] as const)
      execFileSync(process.execPath, [require.resolve(entry), ...args], {
        env: process.env,
        stdio: 'pipe',
      });
    db = new PrismaClient();
    const { AppModule } = await import('../src/app.module');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    app.useLogger(['error']);
    setupApp(app);
    await app.init();
    stationId = (
      await db.station.findUniqueOrThrow({ where: { code: 'PRIMAX-SUR' } })
    ).id;
    fuelId = (await db.fuel.findUniqueOrThrow({ where: { code: 'PREMIUM' } }))
      .id;
  }, 90000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    process.env.DATABASE_URL = original; process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
    console.log('Guest evidence schema:', schema);
  });
  afterEach(() => jest.restoreAllMocks());
  const body = (plate = 'NEW-123') => ({
    operationId: randomUUID(),
    plate,
    stationId,
    fuelId,
    amount: '100.00',
    mode: 'PREPAGO',
    paymentMethod: 'TARJETA',
  });
  const authorize = (data: object) =>
    request(app.getHttpServer())
      .post('/api/v1/authorizations')
      .set('x-kiosk-key', key)
      .send(data);
  const counts = async () =>
    Promise.all([db.user.count(), db.membership.count(), db.vehicle.count()]);
  it('known plate links its membership, keeps points and one reward movement', async () => {
    const tx = (
      await recordedPurchase(app, key, db, body('ABC-123')).expect(201)
    ).body.transaction;
    expect(tx.plate).toBe('ABC-123');
    expect(tx.vehicle.plate).toBe('ABC-123');
    expect(tx.membership.number).toBe('PRIME-0001');
    expect(tx.pointsEarned).toBe(11);
    expect(
      await db.rewardMovement.count({ where: { transactionId: tx.id } }),
    ).toBe(1);
  });
  it('manual unknown plate is normalized, saved and creates no account, vehicle or points', async () => {
    const before = await counts();
    const tx = (
      await recordedPurchase(app, key, db, body(' new123 ')).expect(201)
    ).body.transaction;
    expect(tx).toMatchObject({
      plate: 'NEW-123',
      vehicle: null,
      membership: null,
      pointsEarned: 0,
      status: 'PAID',
    });
    expect(await counts()).toEqual(before);
    expect(
      await db.rewardMovement.count({ where: { transactionId: tx.id } }),
    ).toBe(0);
    const saved = await db.transaction.findUniqueOrThrow({
      where: { id: tx.id },
      include: { authorization: true },
    });
    expect(saved.plate).toBe('NEW-123');
    expect(saved.vehicleId).toBeNull();
    expect(saved.authorization?.plate).toBe('NEW-123');
  });
  it('unknown plate authorization and closure are idempotent under concurrent retries', async () => {
    const data = body('NEW-124');
    const [a, b] = await Promise.all([authorize(data), authorize(data)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.authorization.id).toBe(b.body.authorization.id);
    const purchase = { ...data, authorizationId: a.body.authorization.id };
    const [x, y] = await Promise.all([
      recordedPurchase(app, key, db, purchase),
      recordedPurchase(app, key, db, purchase),
    ]);
    expect([x.status, y.status]).toEqual([201, 201]);
    expect(x.body.transaction.id).toBe(y.body.transaction.id);
    expect(
      await db.payment.count({ where: { operationId: data.operationId } }),
    ).toBe(1);
    expect(
      await db.transaction.count({ where: { operationId: data.operationId } }),
    ).toBe(1);
  });
  it.each(['', 'BAD', 'ABC-12', 'ABC-1234'])(
    'rejects invalid plate %j before charging',
    async (plate) => {
      const data = body(plate);
      await authorize(data).expect(400);
      expect(
        await db.payment.count({ where: { operationId: data.operationId } }),
      ).toBe(0);
    },
  );
  it.each(['PENDING', 'REJECTED'] as const)(
    '%s payment never creates a fuel authorization even for unknown plates',
    async (status) => {
      jest
        .spyOn(app.get(PaymentsService), 'authorize')
        .mockImplementation(
          (amount, method) =>
            ({
              amount,
              method,
              status,
              provider: 'DEMO',
            }) as unknown as ReturnType<PaymentsService['authorize']>,
        );
      const data = body('NEW-125');
      await authorize(data).expect(409);
      expect(
        await db.fuelAuthorization.count({
          where: { operationId: data.operationId },
        }),
      ).toBe(0);
      expect(
        await db.transaction.count({
          where: { operationId: data.operationId },
        }),
      ).toBe(0);
    },
  );
  it('unknown plate still cannot use POSTPAGO', async () => {
    await authorize({
      ...body('NEW-126'),
      mode: 'POSTPAGO',
      membershipCode: 'PRIME-0001',
      paymentMethod: undefined,
    }).expect(404);
  });
  it('cannot substitute a different unknown plate during closure', async () => {
    const data = body('NEW-127');
    const a = await authorize(data).expect(201);
    await recordedPurchase(app, key, db, {
      ...data,
      plate: 'NEW-128',
      authorizationId: a.body.authorization.id,
    }).expect(400);
    expect(
      await db.transaction.count({ where: { operationId: data.operationId } }),
    ).toBe(0);
  });
  it('registration during dispensing cannot retroactively grant membership points', async () => {
    const data = body('NEW-129');
    const a = await authorize(data).expect(201);
    const member = await db.membership.findUniqueOrThrow({
      where: { number: 'PRIME-0001' },
    });
    await db.vehicle.create({
      data: {
        plate: data.plate,
        label: 'Registered after authorization',
        membershipId: member.id,
      },
    });
    const tx = (
      await recordedPurchase(app, key, db, {
        ...data,
        authorizationId: a.body.authorization.id,
      }).expect(201)
    ).body.transaction;
    expect(tx).toMatchObject({
      plate: data.plate,
      vehicle: null,
      membership: null,
      pointsEarned: 0,
    });
  });
});
