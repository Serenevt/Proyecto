import { JwtService } from '@nestjs/jwt';
import '../src/config/load-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { setupApp } from '../src/setup-app';

describe('V9: dinero y documentos en PostgreSQL (esquema preservado)', () => {
  let app: INestApplication, db: PrismaClient;
  let memberId: string,
    token: string,
    plate: string,
    number: string,
    fuelId: string,
    stationId: string;
  let counter = 0;
  const original = process.env.DATABASE_URL!;
  const schema = 'e2e_v9_' + randomUUID().replaceAll('-', '');
  const key = process.env.KIOSK_API_KEY!;
  beforeAll(async () => {
    const url = new URL(original);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.PRIME_DEBT_LIMIT = '200';
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
    fuelId = (await db.fuel.findUniqueOrThrow({ where: { code: 'PREMIUM' } }))
      .id;
    stationId = (
      await db.station.findUniqueOrThrow({ where: { code: 'PRIMAX-SUR' } })
    ).id;
  }, 90000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    process.env.DATABASE_URL = original;
    console.log('V9 evidence schema preserved:', schema);
  });
  beforeEach(async () => {
    counter++;
    const demo = await db.user.findUniqueOrThrow({
      where: { email: 'demo@primaxprime.pe' },
    });
    const user =
      counter === 1
        ? demo
        : await db.user.create({
            data: {
              email: `v9-${counter}@example.test`,
              name: 'Diego',
              passwordHash: demo.passwordHash,
            },
          });
    number = counter === 1 ? 'PRIME-0001' : `PRIME-V9-${counter}`;
    plate =
      counter === 1 ? 'ABC-123' : `V${String(counter).padStart(2, '0')}-123`;
    const member = await db.membership.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        number,
        dni: '12345678',
        ruc: '20123456789',
        businessName: 'Empresa Demo SAC',
      },
    });
    memberId = member.id;
    await db.vehicle.upsert({
      where: { plate },
      update: {},
      create: { plate, label: 'Demo sintética', membershipId: memberId },
    });
    token = await app.get(JwtService).signAsync({ sub: user.id });
  });
  const setBalance = (balance: string) =>
    db.membership.update({ where: { id: memberId }, data: { balance } });
  const balance = async () =>
    (
      await db.membership.findUniqueOrThrow({ where: { id: memberId } })
    ).balance.toFixed(2);
  const reserve = (
    amount: string,
    allowDebt = false,
    operationId = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .post('/api/v1/authorizations')
      .set('x-kiosk-key', key)
      .send({
        operationId,
        plate,
        membershipCode: number,
        amount,
        stationId,
        fuelId,
        allowDebt,
      });
  const buy = (authorizationId: string, amount: string, extra = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('x-kiosk-key', key)
      .send({
        operationId: randomUUID(),
        plate,
        membershipCode: number,
        amount,
        stationId,
        fuelId,
        mode: 'POSTPAGO',
        paymentMethod: 'SALDO_PRIME',
        authorizationId,
        ...extra,
      });
  const recharge = (amount: string, operationId = randomUUID()) =>
    request(app.getHttpServer())
      .post('/api/v1/memberships/me/recharges')
      .auth(token, { type: 'bearer' })
      .send({ operationId, amount });
  const me = () =>
    request(app.getHttpServer())
      .get('/api/v1/memberships/me')
      .auth(token, { type: 'bearer' });
  const profile = (data: object) =>
    request(app.getHttpServer())
      .patch('/api/v1/memberships/me/profile')
      .auth(token, { type: 'bearer' })
      .send(data);
  async function debt(amount = '12.60', cash = '5.00') {
    await setBalance(cash);
    const res = await reserve(amount, true).expect(201);
    return (await buy(res.body.authorization.id, amount).expect(201)).body
      .transaction;
  }
  it('E2E principal: Diego 5 - 12.60 => deuda 7.60; recarga 20 => saldo 12.40', async () => {
    const tx = await debt();
    expect(tx.status).toBe('PAYMENT_PENDING');
    expect(tx.payment.status).toBe('PARTIAL');
    expect(tx.debt.amountPending).toBe('7.6');
    expect(await balance()).toBe('0.00');
    expect((await me()).body.pendingBalance).toBe('7.60');
    await recharge('20').expect(201);
    expect(await balance()).toBe('12.40');
    expect((await me()).body.pendingBalance).toBe('0.00');
    const saved = await db.transaction.findUniqueOrThrow({
      where: { id: tx.id },
      include: { debt: true, payment: true },
    });
    expect(saved.status).toBe('PAID');
    expect(saved.payment!.status).toBe('CAPTURED');
    expect(saved.debt!.status).toBe('SETTLED');
    expect(
      await db.walletMovement.count({ where: { debtId: saved.debt!.id } }),
    ).toBe(1);
  });
  it('saldo suficiente conserva PAID/CAPTURED y no crea deuda', async () => {
    const tx = await debt('12.60', '20');
    expect(await balance()).toBe('7.40');
    expect(tx.debt).toBeNull();
    expect(tx.status).toBe('PAID');
    expect(tx.payment.status).toBe('CAPTURED');
  });
  it('insuficiente sin consentimiento: rechazo sin movimientos', async () => {
    await setBalance('5');
    const res = await reserve('12.60').expect(400);
    expect(res.body.canRegisterDebt).toBe(true);
    expect(res.body.amountPending).toBe('7.60');
    expect(await balance()).toBe('5.00');
  });
  it('saldo cero: Payment PENDING, no saldo negativo', async () => {
    const tx = await debt('12.60', '0');
    expect(tx.payment.status).toBe('PENDING');
    expect(await balance()).toBe('0.00');
  });
  it('límite exacto permitido', async () => {
    expect((await debt('200', '0')).debt.amountPending).toBe('200');
  });
  it('sobre límite rechazado', async () => {
    const res = await reserve('200.01', true).expect(400);
    expect(res.body.code).toBe('DEBT_LIMIT');
  });
  it('deuda existente cuenta para el límite', async () => {
    await debt('190', '0');
    await reserve('11', true).expect(400);
  });
  it('reservas de crédito concurrentes no exceden límite', async () => {
    const results = await Promise.all([
      reserve('150', true),
      reserve('150', true),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
  });
  it('liberar crédito devuelve solo el efectivo reservado', async () => {
    await setBalance('5');
    const res = await reserve('12.60', true).expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/authorizations/${res.body.authorization.id}/release`)
      .set('x-kiosk-key', key)
      .expect(200);
    expect(await balance()).toBe('5.00');
    expect((await me()).body.pendingBalance).toBe('0.00');
  });
  it('consumo menor que efectivo reservado no genera deuda', async () => {
    await setBalance('5');
    const res = await reserve('12.60', true).expect(201);
    const tx = await buy(res.body.authorization.id, '3').expect(201);
    expect(tx.body.transaction.debt).toBeNull();
    expect(await balance()).toBe('2.00');
  });
  it.each([
    ['3', '4.60', '0.00', 'PARTIAL'],
    ['7.60', '0.00', '0.00', 'CAPTURED'],
    ['20', '0.00', '12.40', 'CAPTURED'],
  ])(
    'recarga %s liquida correctamente',
    async (amount, pending, available, status) => {
      const tx = await debt();
      await recharge(amount).expect(201);
      expect(await balance()).toBe(available);
      expect((await me()).body.pendingBalance).toBe(pending);
      expect(
        (
          await db.payment.findUniqueOrThrow({
            where: { transactionId: tx.id },
          })
        ).status,
      ).toBe(status);
    },
  );
  it('recarga sin deuda', async () => {
    await recharge('20').expect(201);
    expect(await balance()).toBe('20.00');
  });
  it('FIFO entre varias deudas y ledger por aplicación', async () => {
    const first = await debt('10', '0');
    const second = await debt('20', '0');
    await recharge('15').expect(201);
    const rows = await db.membershipDebt.findMany({
      where: { membershipId: memberId },
    });
    expect(rows.find((d) => d.transactionId === first.id)!.status).toBe(
      'SETTLED',
    );
    expect(
      rows.find((d) => d.transactionId === second.id)!.amountPending.toFixed(2),
    ).toBe('15.00');
    expect(
      await db.walletMovement.count({
        where: { membershipId: memberId, kind: 'DEBT_SETTLEMENT' },
      }),
    ).toBe(2);
  });
  it('recarga concurrente idempotente', async () => {
    await debt();
    const id = randomUUID();
    const res = await Promise.all([recharge('20', id), recharge('20', id)]);
    expect(res.map((r) => r.status)).toEqual([201, 201]);
    expect(await balance()).toBe('12.40');
  });
  it('UUID recarga con otro importe se rechaza', async () => {
    const id = randomUUID();
    await recharge('20', id).expect(201);
    await recharge('21', id).expect(409);
  });
  it('compra concurrente idempotente: una deuda', async () => {
    const res = await reserve('12.60', true).expect(201);
    const operationId = randomUUID();
    const results = await Promise.all([
      buy(res.body.authorization.id, '12.60', { operationId }),
      buy(res.body.authorization.id, '12.60', { operationId }),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body.transaction.id).toBe(results[1].body.transaction.id);
    expect(
      await db.membershipDebt.count({ where: { membershipId: memberId } }),
    ).toBe(1);
  });
  it.each([
    { dni: '12345678' },
    { ruc: '20123456789' },
    { businessName: ' <b>Demo</b> SAC ' },
  ])('perfil válido %j', async (value) => {
    await profile(value).expect(200);
  });
  it.each([
    { dni: '1234567' },
    { dni: 'abcdefgh' },
    { ruc: '1234567890' },
    { ruc: 'abcdefghijk' },
    { businessName: 'x'.repeat(161) },
    { balance: '9999' },
  ])('perfil inválido %j', async (value) => {
    await profile(value).expect(400);
  });
  it('perfil requiere JWT', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/memberships/me/profile')
      .send({ dni: '12345678' })
      .expect(401);
  });
  it.each(['BOLETA', 'FACTURA'])(
    'snapshot %s permanece tras editar perfil',
    async (receiptType) => {
      const tx = await debt('12.60', '20');
      const res = await reserve('1', false).expect(201);
      const saved = (
        await buy(res.body.authorization.id, '1', { receiptType }).expect(201)
      ).body.transaction;
      await profile({
        dni: '87654321',
        ruc: '20987654321',
        businessName: 'Otra Demo',
      }).expect(200);
      const historical = await db.transaction.findUniqueOrThrow({
        where: { id: saved.id },
      });
      if (receiptType === 'BOLETA')
        expect(historical.receiptDni).toBe('12345678');
      else {
        expect(historical.receiptRuc).toBe('20123456789');
        expect(historical.receiptBusinessName).toBe('Empresa Demo SAC');
      }
      expect(tx.status).toBe('PAID');
    },
  );
  it('comprobante manual y guardado explícito del perfil', async () => {
    const res = await reserve('1', true).expect(201);
    await buy(res.body.authorization.id, '1', {
      receiptDni: '87654321',
      saveReceiptProfile: true,
    }).expect(201);
    expect((await me()).body.dni).toBe('87654321');
  });
});
