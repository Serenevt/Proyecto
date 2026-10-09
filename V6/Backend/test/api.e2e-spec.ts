import '../src/config/load-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { setupApp } from '../src/setup-app';

describe('API con PostgreSQL real (esquema aislado)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let token: string;
  let fuelId: string;
  let stationId: string;
  let benefitId: string;
  let transactionId: string;
  let mainOperation: string;
  let memberId: string;
  const schema = `e2e_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL;
  const key = process.env.KIOSK_API_KEY!;
  const run = (entry: string, args: string[]) =>
    execFileSync(process.execPath, [require.resolve(entry), ...args], {
      env: process.env,
      stdio: 'pipe',
      timeout: 60000,
    });
  const purchase = (overrides: Record<string, unknown> = {}) => ({
    operationId: randomUUID(),
    plate: 'ABC-123',
    amount: '100.00',
    stationId,
    fuelId,
    mode: 'PREPAGO',
    paymentMethod: 'TARJETA',
    ...overrides,
  });
  const buy = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('x-kiosk-key', key)
      .send(body);
  const getMember = (path: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/${path}`)
      .auth(token, { type: 'bearer' });
  beforeAll(async () => {
    if (!originalUrl)
      throw new Error('DATABASE_URL required; start PostgreSQL first');
    const url = new URL(originalUrl);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.POINTS_PER_SOL = '1';
    run('prisma/build/index.js', ['migrate', 'deploy']);
    run('ts-node/dist/bin.js', ['prisma/seed.ts']);
    db = new PrismaClient();
    // Import after selecting the temporary schema; ConfigModule reads environment on import.
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(['error', 'warn']);
    setupApp(app);
    await app.init();
    fuelId = (await db.fuel.findUniqueOrThrow({ where: { code: 'PREMIUM' } }))
      .id;
    stationId = (
      await db.station.findUniqueOrThrow({ where: { code: 'PRIMAX-SUR' } })
    ).id;
    benefitId = (
      await db.benefit.findUniqueOrThrow({ where: { code: 'coffee' } })
    ).id;
    memberId = (
      await db.membership.findUniqueOrThrow({ where: { number: 'PRIME-0001' } })
    ).id;
  }, 90000);
  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$disconnect();
    if (originalUrl && /^e2e_[a-f0-9]{32}$/.test(schema)) {
      const cleanup = new PrismaClient({
        datasources: { db: { url: originalUrl } },
      });
      try {
        await cleanup.$executeRawUnsafe(
          `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
        );
      } finally {
        await cleanup.$disconnect();
      }
    }
    process.env.DATABASE_URL = originalUrl;
  });

  it('health verifica conexión real', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });
  it('Swagger UI y OpenAPI exponen el contrato', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
    const res = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(res.body.paths['/api/v1/transactions'].post).toBeDefined();
    expect(
      res.body.components.schemas.CreateTransactionDto.properties.amount.type,
    ).toBe('string');
  });
  it('seed reproducible no duplica filas ni reinicia saldos', async () => {
    run('ts-node/dist/bin.js', ['prisma/seed.ts']);
    expect(await db.user.count()).toBe(1);
    expect(await db.vehicle.count()).toBe(3);
    expect(await db.benefit.count()).toBe(3);
    expect(await db.rewardMovement.count()).toBe(0);
    const user = await db.user.findFirstOrThrow();
    expect(user.passwordHash).not.toBe(process.env.DEMO_PASSWORD);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });
  it('login incorrecto retorna 401 sin stack', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'demo@primaxprime.pe', password: 'incorrecta' })
      .expect(401);
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body.statusCode).toBe(401);
  });
  it('login demo emite JWT válido y no expone hash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'demo@primaxprime.pe',
        password: process.env.DEMO_PASSWORD,
      })
      .expect(200);
    token = res.body.accessToken as string;
    expect(token.split('.')).toHaveLength(3);
    expect(res.body.user.name).toBe('Diego');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });
  it('protege historial y creación de compras', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/memberships/me')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .auth(token, { type: 'bearer' })
      .send(purchase())
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/memberships/me')
      .auth('invalid', { type: 'bearer' })
      .expect(401);
  });
  it('consulta y normaliza placa con alcance de socio', async () => {
    const res = await getMember('vehicles/abc123').expect(200);
    expect(res.body.plate).toBe('ABC-123');
    expect(res.body.membership.number).toBe('PRIME-0001');
    await getMember('vehicles/XYZ-999').expect(404);
    await getMember('vehicles/invalid').expect(400);
    const vehicles = await getMember('vehicles').expect(200);
    expect(vehicles.body).toHaveLength(2);
  });
  it('ABC-123 → S/100 → +100 → historial de PRIME-0001', async () => {
    const body = purchase();
    mainOperation = body.operationId as string;
    const res = await buy(body).expect(201);
    transactionId = res.body.transaction.id as string;
    expect(res.body.pointsEarned).toBe(100);
    expect(res.body.transaction.amount).toBe('100.00');
    expect(res.body.transaction.membership).toMatchObject({
      number: 'PRIME-0001',
      name: 'Diego',
    });
    const history = await getMember('memberships/me/transactions').expect(200);
    expect(history.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: transactionId, pointsEarned: 100 }),
      ]),
    );
    const member = await getMember('memberships/me').expect(200);
    expect(member.body.points).toBe(100);
    const movements = await getMember('memberships/me/rewards').expect(200);
    expect(movements.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ transactionId, points: 100, kind: 'EARN' }),
      ]),
    );
    expect(await db.payment.count({ where: { transactionId } })).toBe(1);
  });
  it('reintentos simultáneos no duplican compra, pago ni puntos', async () => {
    const body = purchase({ operationId: mainOperation });
    const results = await Promise.all([buy(body), buy(body)]);
    expect(results.map((res) => res.status)).toEqual([201, 201]);
    expect(results.every((res) => res.body.replayed === true)).toBe(true);
    expect(
      await db.transaction.count({ where: { operationId: mainOperation } }),
    ).toBe(1);
    expect(await db.rewardMovement.count({ where: { transactionId } })).toBe(1);
  });
  it('dos solicitudes nuevas simultáneas con mismo UUID crean una sola compra', async () => {
    const body = purchase({ amount: '10.00' });
    const results = await Promise.all([buy(body), buy(body)]);
    expect(results.map((res) => res.status)).toEqual([201, 201]);
    expect(results.map((res) => res.body.replayed).sort()).toEqual([
      false,
      true,
    ]);
    const rows = await db.transaction.findMany({
      where: { operationId: body.operationId as string },
      include: { rewardMovement: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].rewardMovement?.points).toBe(10);
  });
  it('UUID reutilizado con otro monto devuelve 409', async () => {
    await buy(purchase({ operationId: mainOperation, amount: '99.00' })).expect(
      409,
    );
  });
  it.each(['0', '-1', '1.001', 100, '1000000'])(
    'rechaza monto inválido %s sin efectos',
    async (amount) => {
      const body = purchase({ amount });
      await buy(body).expect(400);
      expect(
        await db.transaction.count({
          where: { operationId: body.operationId as string },
        }),
      ).toBe(0);
    },
  );
  it('rechaza estado arbitrario y campos adicionales', async () => {
    await buy(purchase({ status: 'PAID', pointsEarned: 9999 })).expect(400);
    await buy(purchase({ paymentMethod: 'INVALID' })).expect(400);
    await buy(purchase({ receiptType: null })).expect(400);
    await buy(purchase({ gallons: null })).expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'invalid', password: 'x' })
      .expect(400);
  });
  it('vehículo desconocido y combustible inexistente no producen escrituras parciales', async () => {
    const count = await db.transaction.count();
    await buy(purchase({ plate: 'ZZZ-111' })).expect(404);
    await buy(purchase({ fuelId: randomUUID() })).expect(404);
    expect(await db.transaction.count()).toBe(count);
  });
  it('rollback de compra y pago si falla el movimiento en PostgreSQL', async () => {
    // Force a real DB constraint failure after starting nested writes, then verify rollback.
    await db.$executeRawUnsafe(
      'ALTER TABLE "RewardMovement" ADD CONSTRAINT "e2e_force_failure" CHECK (points <> 17)',
    );
    const body = purchase({ amount: '17.00' });
    const paymentsBefore = await db.payment.count();
    try {
      await buy(body).expect(500);
      expect(
        await db.transaction.count({
          where: { operationId: body.operationId as string },
        }),
      ).toBe(0);
      expect(await db.payment.count()).toBe(paymentsBefore);
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE "RewardMovement" DROP CONSTRAINT "e2e_force_failure"',
      );
    }
  });
  it('prepago sin membresía registra pago con cero puntos; postpago se rechaza', async () => {
    const res = await buy(purchase({ plate: 'XYZ-999' })).expect(201);
    expect(res.body.pointsEarned).toBe(0);
    expect(res.body.transaction.membership).toBeNull();
    expect(
      await db.rewardMovement.count({
        where: { transactionId: res.body.transaction.id as string },
      }),
    ).toBe(0);
    await buy(
      purchase({ plate: 'XYZ-999', mode: 'POSTPAGO', paymentMethod: 'PEAJE' }),
    ).expect(400);
    await getMember(`transactions/${res.body.transaction.id as string}`).expect(
      404,
    );
  });
  it('canje insuficiente no crea cupón ni débito', async () => {
    const operationId = randomUUID();
    await request(app.getHttpServer())
      .post('/api/v1/rewards/redeem')
      .auth(token, { type: 'bearer' })
      .send({ operationId, benefitId })
      .expect(400);
    expect(await db.redemption.count({ where: { operationId } })).toBe(0);
  });
  it('dos canjes concurrentes no gastan dos veces el saldo disponible', async () => {
    // 110 + 290 = 400; exactly one coffee can be redeemed.
    await buy(purchase({ amount: '290.00' })).expect(201);
    const redeem = () =>
      request(app.getHttpServer())
        .post('/api/v1/rewards/redeem')
        .auth(token, { type: 'bearer' })
        .send({ operationId: randomUUID(), benefitId });
    const results = await Promise.all([redeem(), redeem()]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 400]);
    const sum = await db.rewardMovement.aggregate({
      where: { membershipId: memberId },
      _sum: { points: true },
    });
    expect(sum._sum.points).toBe(0);
    expect(await db.redemption.count()).toBe(1);
  });
  it('reintentar canje devuelve cupón previo sin nuevo débito', async () => {
    const previous = await db.redemption.findFirstOrThrow();
    const res = await request(app.getHttpServer())
      .post('/api/v1/rewards/redeem')
      .auth(token, { type: 'bearer' })
      .send({ operationId: previous.operationId, benefitId })
      .expect(201);
    expect(res.body.replayed).toBe(true);
    expect(
      await db.rewardMovement.count({ where: { redemptionId: previous.id } }),
    ).toBe(1);
    const history = await getMember('memberships/me/redemptions').expect(200);
    expect(history.body).toHaveLength(1);
  });
  it('CORS solo permite orígenes configurados y Helmet añade cabeceras', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/fuels')
      .set('Origin', 'http://localhost:8081')
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:8081',
    );
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    const denied = await request(app.getHttpServer())
      .get('/api/v1/fuels')
      .set('Origin', 'https://untrusted.example')
      .expect(200);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('otro socio no puede consultar la compra, placa ni puntos de Diego', async () => {
    const demo = await db.user.findFirstOrThrow();
    const other = await db.user.create({
      data: {
        email: 'other@example.test',
        name: 'Otro socio',
        passwordHash: demo.passwordHash,
        membership: { create: { number: 'PRIME-TEST-2' } },
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: other.email, password: process.env.DEMO_PASSWORD })
      .expect(200);
    const otherToken = login.body.accessToken as string;
    await request(app.getHttpServer())
      .get(`/api/v1/transactions/${transactionId}`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/vehicles/ABC-123')
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    const history = await request(app.getHttpServer())
      .get('/api/v1/memberships/me/transactions')
      .auth(otherToken, { type: 'bearer' })
      .expect(200);
    expect(history.body).toEqual([]);
    const member = await request(app.getHttpServer())
      .get('/api/v1/memberships/me')
      .auth(otherToken, { type: 'bearer' })
      .expect(200);
    expect(member.body.points).toBe(0);
  });
});
