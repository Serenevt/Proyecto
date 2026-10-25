import '../src/config/load-env';
import { recordedPurchase } from './recorded-purchase';
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
  process.env.KEEP_E2E_SCHEMA = '1';
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
    recordedPurchase(app, key, db, body);
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
    process.env.SOLES_PER_POINT = '9';
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
    // Keep one server open across concurrent Supertest requests; temporary
    // per-request listeners can close while another retry is connecting.
    await app.listen(0, '127.0.0.1');
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
  beforeEach(async () => {
    // Garantiza un token válido antes de cada caso; la caché evita
    // re-loguearse en cada test.
    await autenticar();
  });
  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$disconnect();
    if (
      process.env.KEEP_E2E_SCHEMA !== '1' &&
      originalUrl &&
      /^e2e_[a-f0-9]{32}$/.test(schema)
    ) {
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
    if (process.env.KEEP_E2E_SCHEMA === '1')
      console.log('Preserved E2E schema:', schema);
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
    expect(res.body.pointsEarned).toBe(11);
    expect(res.body.transaction.amount).toBe('100.00');
    expect(res.body.transaction.membership).toMatchObject({
      number: 'PRIME-0001',
      name: 'Diego',
    });
    const history = await getMember('memberships/me/transactions').expect(200);
    expect(history.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: transactionId, pointsEarned: 11 }),
      ]),
    );
    const member = await getMember('memberships/me').expect(200);
    expect(member.body.points).toBe(11);
    const movements = await getMember('memberships/me/rewards').expect(200);
    expect(movements.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ transactionId, points: 11, kind: 'EARN' }),
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
    expect(rows[0].rewardMovement?.points).toBe(1);
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
  it('prepago libre conserva placa y combustible inexistente no produce escrituras parciales', async () => {
    const count = await db.transaction.count();
    const guest = await buy(purchase({ plate: 'ZZZ-111' })).expect(201);
    expect(guest.body.transaction).toMatchObject({
      plate: 'ZZZ-111',
      vehicle: null,
      membership: null,
      pointsEarned: 0,
    });
    const invalidFuel = purchase({ fuelId: randomUUID() });
    await request(app.getHttpServer())
      .post('/api/v1/authorizations')
      .set('x-kiosk-key', key)
      .send(invalidFuel)
      .expect(404);
    expect(
      await db.payment.count({
        where: { operationId: invalidFuel.operationId as string },
      }),
    ).toBe(0);
    expect(await db.transaction.count()).toBe(count + 1);
  });
  it('rollback del cierre conserva el pago previo si falla el movimiento en PostgreSQL', async () => {
    // Force a real DB constraint failure after starting nested writes, then verify rollback.
    await db.$executeRawUnsafe(
      'ALTER TABLE "RewardMovement" ADD CONSTRAINT "e2e_force_failure" CHECK (points <> 17)',
    );
    const body = purchase({ amount: '153.00' }); // 17 points under the S/9 rule
    const paymentsBefore = await db.payment.count();
    try {
      await buy(body).expect(500);
      expect(
        await db.transaction.count({
          where: { operationId: body.operationId as string },
        }),
      ).toBe(0);
      expect(await db.payment.count()).toBe(paymentsBefore + 1);
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
      purchase({
        plate: 'XYZ-999',
        mode: 'POSTPAGO',
        paymentMethod: 'SALDO_PRIME',
      }),
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
    // 11 + 1 + 388 = 400; exactly one coffee can be redeemed.
    await buy(purchase({ amount: '3492.00' })).expect(201);
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
  // ---------- Postpago con saldo Primax Prime ----------

  // El token dura 3600 s y la suite tarda más: se renueva cuando está por
  // caducar. Sin esto los tests tardíos reciben 401 sin relación con el caso.
  let tokenIssuedAt = 0;
  const autenticar = async () => {
    if (tokenIssuedAt && Date.now() - tokenIssuedAt < 3_000_000) return;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'demo@primaxprime.pe',
        password: process.env.DEMO_PASSWORD,
      })
      .expect(200);
    token = res.body.accessToken as string;
    tokenIssuedAt = Date.now();
  };

  const reserve = (overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/authorizations')
      .set('x-kiosk-key', key)
      .send({
        operationId: randomUUID(),
        plate: 'ABC-123',
        amount: '200.00',
        membershipCode: 'PRIME-0001',
        stationId,
        fuelId,
        receiptType: 'BOLETA',
        ...overrides,
      });
  const recharge = (amount: string) =>
    request(app.getHttpServer())
      .post('/api/v1/memberships/me/recharges')
      .auth(token, { type: 'bearer' })
      .send({ operationId: randomUUID(), amount });
  const balanceOf = async () => {
    await autenticar();
    return (await db.membership.findUniqueOrThrow({ where: { id: memberId } }))
      .balance;
  };

  it('la recarga acredita saldo real y queda en el libro mayor', async () => {
    const before = await balanceOf();
    const res = await recharge('300.00').expect(201);
    expect(res.body.movement.kind).toBe('RECHARGE');
    expect((await balanceOf()).toFixed(2)).toBe(before.plus(300).toFixed(2));
    const wallet = await getMember('memberships/me/wallet').expect(200);
    expect(wallet.body.movements[0].kind).toBe('RECHARGE');
  });

  it('reintento de recarga con el mismo UUID no acredita dos veces', async () => {
    const operationId = randomUUID();
    const before = await balanceOf();
    const body = { operationId, amount: '50.00' };
    await request(app.getHttpServer())
      .post('/api/v1/memberships/me/recharges')
      .auth(token, { type: 'bearer' })
      .send(body)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/api/v1/memberships/me/recharges')
      .auth(token, { type: 'bearer' })
      .send(body)
      .expect(201);
    expect(replay.body.replayed).toBe(true);
    expect((await balanceOf()).toFixed(2)).toBe(before.plus(50).toFixed(2));
  });

  it('reserva postpago descuenta el saldo y lo deja comprometido', async () => {
    const before = await balanceOf();
    const res = await reserve().expect(201);
    expect(res.body.authorization.reservedAmount).toBe('200.00');
    expect(res.body.authorization.status).toBe('RESERVED');
    expect((await balanceOf()).toFixed(2)).toBe(before.minus(200).toFixed(2));
    expect(
      await db.walletMovement.count({
        where: { authorizationId: res.body.authorization.id, kind: 'RESERVE' },
      }),
    ).toBe(1);
  });

  it('RECHUZA reserva con código de membresía de otro vehículo', async () => {
    const before = await balanceOf();
    await reserve({ membershipCode: 'PX-004821' }).expect(400);
    await reserve({ plate: 'XYZ-999' }).expect(400);
    expect((await balanceOf()).toFixed(2)).toBe(before.toFixed(2));
  });

  it('RECHUZA reserva sin saldo suficiente y no compromete nada', async () => {
    const before = await balanceOf();
    // Ningún recharge dejó saldo para 999999.00, así que debe rechazarse.
    await reserve({ amount: '999999.00' }).expect(400);
    expect((await balanceOf()).toFixed(2)).toBe(before.toFixed(2));
    expect(
      await db.fuelAuthorization.count({
        where: { operationId: '00000000-0000-4000-8000-000000000000' },
      }),
    ).toBe(0);
  });

  it('postpago consume lo real y libera el excedente de la reserva', async () => {
    await recharge('1000.00').expect(201);
    const auth = await reserve({ amount: '300.00' }).expect(201);
    const reserved = auth.body.authorization as { id: string };
    const afterReserve = await balanceOf();
    // PREMIUM 23.50: 9.390 gal x 23.50 = 220.67 (dentro de los 300 reservados)
    const res = await buy({
      operationId: randomUUID(),
      plate: 'ABC-123',
      amount: '220.67',
      gallons: '9.390',
      stationId,
      fuelId,
      mode: 'POSTPAGO',
      paymentMethod: 'SALDO_PRIME',
      authorizationId: reserved.id,
      membershipCode: 'PRIME-0001',
      receiptType: 'BOLETA',
    }).expect(201);
    expect(res.body.transaction.amount).toBe('220.67');
    // Se devuelven 300.00 - 220.67 = 79.33
    expect((await balanceOf()).toFixed(2)).toBe(
      afterReserve.plus(79.33).toFixed(2),
    );
    const settled = await db.fuelAuthorization.findUniqueOrThrow({
      where: { id: reserved.id },
    });
    expect(settled.status).toBe('SETTLED');
    expect(settled.consumedAmount?.toFixed(2)).toBe('220.67');
    expect(settled.releasedAmount.toFixed(2)).toBe('79.33');
  });

  it('postpago que consume menos de lo reservado devuelve el excedente', async () => {
    await recharge('1000.00').expect(201);
    const auth = await reserve({ amount: '200.00' }).expect(201);
    const reserved = auth.body.authorization as { id: string };
    const afterReserve = await balanceOf();
    // 4.000 gal x 23.50 = 94.00; de 200.00 reservados se devuelven 106.00
    await buy({
      operationId: randomUUID(),
      plate: 'ABC-123',
      amount: '94.00',
      gallons: '4.000',
      stationId,
      fuelId,
      mode: 'POSTPAGO',
      paymentMethod: 'SALDO_PRIME',
      authorizationId: reserved.id,
      membershipCode: 'PRIME-0001',
      receiptType: 'BOLETA',
    }).expect(201);
    expect((await balanceOf()).toFixed(2)).toBe(
      afterReserve.plus(106).toFixed(2),
    );
    const settled = await db.fuelAuthorization.findUniqueOrThrow({
      where: { id: reserved.id },
    });
    expect(settled.releasedAmount.toFixed(2)).toBe('106.00');
  });

  it('postpago sin autorización previa se rechaza', async () => {
    await buy({
      operationId: randomUUID(),
      plate: 'ABC-123',
      amount: '50.00',
      stationId,
      fuelId,
      mode: 'POSTPAGO',
      paymentMethod: 'SALDO_PRIME',
      receiptType: 'BOLETA',
    }).expect(400);
  });

  it('liberar una reserva devuelve el importe y evita el doble cobro', async () => {
    const auth = await reserve({ amount: '120.00' }).expect(201);
    const reserved = auth.body.authorization as { id: string };
    const afterReserve = await balanceOf();
    const released = await request(app.getHttpServer())
      .post(`/api/v1/authorizations/${reserved.id}/release`)
      .set('x-kiosk-key', key)
      .expect(200);
    expect(released.body.status).toBe('RELEASED');
    expect((await balanceOf()).toFixed(2)).toBe(
      afterReserve.plus(120).toFixed(2),
    );
    await request(app.getHttpServer())
      .post(`/api/v1/authorizations/${reserved.id}/release`)
      .set('x-kiosk-key', key)
      .expect(409);
  });

  it('PREPAGO con medio externo nunca altera el saldo', async () => {
    const before = await balanceOf();
    for (const paymentMethod of ['EFECTIVO', 'TARJETA'])
      await buy(purchase({ paymentMethod })).expect(201);
    for (const paymentMethod of ['YAPE', 'PLIN'])
      await buy(purchase({ paymentMethod })).expect(400);
    expect((await balanceOf()).toFixed(2)).toBe(before.toFixed(2));
  });

  it('PREPAGO con SALDO_PRIME se rechaza: no se cobra a la membresía', async () => {
    await buy(purchase({ paymentMethod: 'SALDO_PRIME' })).expect(400);
  });

  it('rechaza importe que no corresponde al volumen despachado', async () => {
    // PREMIUM 23.50: 9.390 gal x 23.50 = 220.665 -> 220.67
    await buy(purchase({ amount: '500.00', gallons: '9.390' })).expect(400);
    await buy(purchase({ amount: '220.67', gallons: '9.390' })).expect(201);
  });

  it('rechaza código de membresía incoherente con la placa', async () => {
    await buy(
      purchase({ membershipCode: 'PX-004821', paymentMethod: 'TARJETA' }),
    ).expect(400);
  });

  it('Detener cobra solo lo consumido y libera el excedente', async () => {
    await recharge('1000.00').expect(201);
    const auth = await reserve({ amount: '100.00' }).expect(201);
    const reserved = auth.body.authorization as { id: string };
    const afterReserve = await balanceOf();

    // El cliente detiene el abastecimiento con S/ 43.50 consumidos.
    await request(app.getHttpServer())
      .post(`/api/v1/authorizations/${reserved.id}/progress`)
      .set('x-kiosk-key', key)
      .send({ amount: '43.50', gallons: '1.851' })
      .expect(200);

    await buy({
      operationId: randomUUID(),
      plate: 'ABC-123',
      // PREMIUM 23.50: 1.851 gal x 23.50 = 43.4985 -> 43.50
      amount: '43.50',
      gallons: '1.851',
      stationId,
      fuelId,
      mode: 'POSTPAGO',
      paymentMethod: 'SALDO_PRIME',
      authorizationId: reserved.id,
      membershipCode: 'PRIME-0001',
      receiptType: 'BOLETA',
      outcome: 'MANUAL',
    }).expect(201);

    // Se devuelven 100.00 - 43.50 = 56.50
    expect((await balanceOf()).toFixed(2)).toBe(
      afterReserve.plus(56.5).toFixed(2),
    );
    const settled = await db.fuelAuthorization.findUniqueOrThrow({
      where: { id: reserved.id },
    });
    expect(settled.status).toBe('SETTLED');
    expect(settled.consumedAmount?.toFixed(2)).toBe('43.50');
    expect(settled.releasedAmount.toFixed(2)).toBe('56.50');
    expect(settled.outcome).toBe('MANUAL');
    // Una sola transacción por el consumo confirmado.
    expect(
      await db.transaction.count({ where: { authorizationId: reserved.id } }),
    ).toBe(1);
  });

  it('el avance nunca supera el importe reservado', async () => {
    const auth = await reserve({ amount: '80.00' }).expect(201);
    const reserved = auth.body.authorization as { id: string };
    await request(app.getHttpServer())
      .post(`/api/v1/authorizations/${reserved.id}/progress`)
      .set('x-kiosk-key', key)
      .send({ amount: '80.01', gallons: '3.400' })
      .expect(400);
    const intact = await db.fuelAuthorization.findUniqueOrThrow({
      where: { id: reserved.id },
    });
    expect(intact.dispensedAmount.toFixed(2)).toBe('0.00');
    await request(app.getHttpServer())
      .post(`/api/v1/authorizations/${reserved.id}/release`)
      .set('x-kiosk-key', key)
      .expect(200);
  });

  it('Detener antes de despachar libera la reserva íntegra', async () => {
    await recharge('500.00').expect(201);
    const before = await balanceOf();
    const auth = await reserve({ amount: '60.00' }).expect(201);
    const reserved = auth.body.authorization as { id: string };
    expect((await balanceOf()).toFixed(2)).toBe(before.minus(60).toFixed(2));
    await request(app.getHttpServer())
      .post(`/api/v1/authorizations/${reserved.id}/release`)
      .set('x-kiosk-key', key)
      .expect(200);
    expect((await balanceOf()).toFixed(2)).toBe(before.toFixed(2));
    expect(
      await db.transaction.count({ where: { authorizationId: reserved.id } }),
    ).toBe(0);
  });

  it('rechaza confirmar un consumo por encima de lo reservado', async () => {
    await recharge('500.00').expect(201);
    const auth = await reserve({ amount: '30.00' }).expect(201);
    const reserved = auth.body.authorization as { id: string };
    const before = await balanceOf();
    await buy({
      operationId: randomUUID(),
      plate: 'ABC-123',
      amount: '30.01',
      stationId,
      fuelId,
      mode: 'POSTPAGO',
      paymentMethod: 'SALDO_PRIME',
      authorizationId: reserved.id,
      membershipCode: 'PRIME-0001',
      receiptType: 'BOLETA',
    }).expect(400);
    // El saldo no se altera: la reserva sigue viva para poder cerrarla bien.
    expect((await balanceOf()).toFixed(2)).toBe(before.toFixed(2));
    expect(
      await db.transaction.count({ where: { authorizationId: reserved.id } }),
    ).toBe(0);
  });

  it('no liquida la misma reserva dos veces', async () => {
    await recharge('500.00').expect(201);
    const auth = await reserve({ amount: '40.00' }).expect(201);
    const reserved = auth.body.authorization as { id: string };
    const body = {
      operationId: randomUUID(),
      plate: 'ABC-123',
      amount: '20.00',
      stationId,
      fuelId,
      mode: 'POSTPAGO',
      paymentMethod: 'SALDO_PRIME',
      authorizationId: reserved.id,
      membershipCode: 'PRIME-0001',
      receiptType: 'BOLETA',
    };
    await buy(body).expect(201);
    await buy({ ...body, operationId: randomUUID() }).expect(409);
    expect(
      await db.transaction.count({ where: { authorizationId: reserved.id } }),
    ).toBe(1);
  });

  it('el saldo de la membresía separa disponible, retenido y total', async () => {
    await recharge('800.00').expect(201);
    const wallet = await getMember('memberships/me/wallet').expect(200);
    // La reserva se descuenta de balance al autorizarse, así que available
    // ES el dinero libre y nunca puede quedar negativo.
    expect(Number(wallet.body.available)).toBe(Number(wallet.body.balance));
    expect(Number(wallet.body.available)).toBeGreaterThanOrEqual(0);
    expect(Number(wallet.body.total)).toBe(
      Number(wallet.body.balance) + Number(wallet.body.reserved),
    );
    const member = await getMember('memberships/me').expect(200);
    expect(Number(member.body.available)).toBe(Number(wallet.body.available));
    expect(Number(member.body.reserved)).toBe(Number(wallet.body.reserved));
  });

  it('con una reserva abierta el disponible baja y el total se mantiene', async () => {
    await recharge('500.00').expect(201);
    const before = await getMember('memberships/me/wallet').expect(200);
    const auth = await reserve({ amount: '120.00' }).expect(201);
    const reserved = auth.body.authorization as { id: string };
    const during = await getMember('memberships/me/wallet').expect(200);
    // El saldo total no cambia al reservar: solo se compromete.
    expect(Number(during.body.total)).toBe(Number(before.body.total));
    // El disponible baja exactamente lo reservado.
    expect(Number(during.body.available)).toBe(
      Number(before.body.available) - 120,
    );
    expect(Number(during.body.reserved)).toBeGreaterThanOrEqual(120);
    expect(Number(during.body.available)).toBeGreaterThanOrEqual(0);

    await request(app.getHttpServer())
      .post(`/api/v1/authorizations/${reserved.id}/release`)
      .set('x-kiosk-key', key)
      .expect(200);
    const after = await getMember('memberships/me/wallet').expect(200);
    expect(Number(after.body.available)).toBe(Number(before.body.available));
  });

  it('las reservas antiguas se listan sin liberarlas', async () => {
    await recharge('300.00').expect(201);
    const auth = await reserve({ amount: '25.00' }).expect(201);
    const before = await balanceOf();
    const pending = await request(app.getHttpServer())
      .get('/api/v1/authorizations?olderThanMinutes=100000')
      .set('x-kiosk-key', key)
      .expect(200);
    expect(Array.isArray(pending.body)).toBe(true);
    // Listar no libera nada.
    expect((await balanceOf()).toFixed(2)).toBe(before.toFixed(2));
    await request(app.getHttpServer())
      .post(
        `/api/v1/authorizations/${(auth.body.authorization as { id: string }).id}/release`,
      )
      .set('x-kiosk-key', key)
      .expect(200);
  });

  it('recargar con la autorización ya liquidada recupera el comprobante sin cobrar dos veces', async () => {
    await recharge('500.00').expect(201);
    const auth = await reserve({ amount: '60.00' }).expect(201);
    const reserved = auth.body.authorization as { id: string };
    // Mismo operationId y mismo cuerpo: es un reenvío idempotente.
    const operationId = randomUUID();
    const confirmacion = {
      operationId,
      plate: 'ABC-123',
      amount: '25.00',
      gallons: '1.064',
      stationId,
      fuelId,
      mode: 'POSTPAGO',
      paymentMethod: 'SALDO_PRIME',
      authorizationId: reserved.id,
      membershipCode: 'PRIME-0001',
      receiptType: 'BOLETA',
      outcome: 'MANUAL',
    };

    // Primera confirmación: el backend cobra 25 y libera los 35 de excedente.
    await buy({ ...confirmacion }).expect(201);
    const trasPrimerCobro = await balanceOf();

    // El terminal se quedó sin respuesta (recarga de página) y reenvía el
    // MISMO operationId: el backend devuelve la compra original, no cobra otra vez.
    const replay = await buy({ ...confirmacion }).expect(201);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.transaction.amount).toBe('25.00');

    // Una sola transacción y el saldo no se movió con el reenvío.
    expect(
      await db.transaction.count({ where: { authorizationId: reserved.id } }),
    ).toBe(1);
    expect((await balanceOf()).toFixed(2)).toBe(trasPrimerCobro.toFixed(2));
  });

  it('recargar con la reserva liberada no reenvía y permite una operación nueva', async () => {
    await recharge('500.00').expect(201);
    const before = await balanceOf();
    const auth = await reserve({ amount: '40.00' }).expect(201);
    const reserved = auth.body.authorization as { id: string };
    await request(app.getHttpServer())
      .post(`/api/v1/authorizations/${reserved.id}/release`)
      .set('x-kiosk-key', key)
      .expect(200);

    // Reenviar contra una reserva liberada da 409, no un cobro.
    await buy({
      operationId: randomUUID(),
      plate: 'ABC-123',
      amount: '10.00',
      stationId,
      fuelId,
      mode: 'POSTPAGO',
      paymentMethod: 'SALDO_PRIME',
      authorizationId: reserved.id,
      membershipCode: 'PRIME-0001',
      receiptType: 'BOLETA',
    }).expect(409);
    expect(
      await db.transaction.count({ where: { authorizationId: reserved.id } }),
    ).toBe(0);
    expect((await balanceOf()).toFixed(2)).toBe(before.toFixed(2));

    // Y una operación nueva con otra reserva sí funciona.
    const fresh = await reserve({ amount: '30.00' }).expect(201);
    const freshId = fresh.body.authorization as { id: string };
    await buy({
      operationId: randomUUID(),
      plate: 'ABC-123',
      amount: '12.00',
      gallons: '0.511',
      stationId,
      fuelId,
      mode: 'POSTPAGO',
      paymentMethod: 'SALDO_PRIME',
      authorizationId: freshId.id,
      membershipCode: 'PRIME-0001',
      receiptType: 'BOLETA',
      outcome: 'MANUAL',
    }).expect(201);
    expect(
      await db.transaction.count({ where: { authorizationId: freshId.id } }),
    ).toBe(1);
  });

  it('el avance no cobra: solo la confirmación registra la transacción', async () => {
    await recharge('500.00').expect(201);
    const auth = await reserve({ amount: '50.00' }).expect(201);
    const reserved = auth.body.authorization as { id: string };
    const before = await balanceOf();
    for (const amount of ['10.00', '20.00', '30.00'])
      await request(app.getHttpServer())
        .post(`/api/v1/authorizations/${reserved.id}/progress`)
        .set('x-kiosk-key', key)
        .send({ amount, gallons: (Number(amount) / 23.5).toFixed(3) })
        .expect(200);
    // Los avances no crean transacción ni mueven saldo.
    expect(
      await db.transaction.count({ where: { authorizationId: reserved.id } }),
    ).toBe(0);
    expect((await balanceOf()).toFixed(2)).toBe(before.toFixed(2));
    await request(app.getHttpServer())
      .post(`/api/v1/authorizations/${reserved.id}/release`)
      .set('x-kiosk-key', key)
      .expect(400);
  });

  it('CORS solo permite orígenes configurados y Helmet añade cabeceras', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/fuels')
      .set('Origin', process.env.CORS_ORIGINS!.split(',')[0])
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      process.env.CORS_ORIGINS!.split(',')[0],
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
  it.each([
    ['8.99', 0],
    ['9.00', 1],
    ['17.99', 1],
    ['18.00', 2],
    ['89.99', 9],
    ['90.00', 10],
    ['100.00', 11],
  ])(
    'V10: S/%s persists %i points and an exact divisor',
    async (amount, points) => {
      const before = await getMember('memberships/me');
      const result = await buy(purchase({ amount })).expect(201);
      const row = await db.transaction.findUniqueOrThrow({
        where: { id: result.body.transaction.id },
        include: { rewardMovement: true },
      });
      expect(row.pointsEarned).toBe(points);
      expect(row.solesPerPoint?.toString()).toBe('9');
      expect(row.rewardMovement?.points ?? 0).toBe(points);
      expect((await getMember('memberships/me')).body.points).toBe(
        before.body.points + Number(points),
      );
    },
  );
  it('V10: concurrent purchase and retry award exactly ten points once', async () => {
    const before = await getMember('memberships/me');
    const body = purchase({ amount: '90.00' });
    const results = await Promise.all([buy(body), buy(body)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body.transaction.id).toBe(results[1].body.transaction.id);
    expect((await buy(body).expect(201)).body.replayed).toBe(true);
    expect(
      await db.rewardMovement.count({
        where: { transactionId: results[0].body.transaction.id },
      }),
    ).toBe(1);
    expect((await getMember('memberships/me')).body.points).toBe(
      before.body.points + 10,
    );
  });
});
