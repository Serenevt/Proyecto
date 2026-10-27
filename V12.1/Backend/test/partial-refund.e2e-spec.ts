import '../src/config/load-env';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { setupApp } from '../src/setup-app';

describe('Fase 1B-2: resultado posterior del reembolso parcial', () => {
  const original = process.env.DATABASE_URL!;
  const schema = 'e2e_partial_refund_' + randomUUID().replaceAll('-', '');
  const kioskKey = process.env.KIOSK_API_KEY!;
  let db: PrismaClient;
  let app: INestApplication;
  let adminToken: string;
  let stationId: string;
  let fuelId: string;

  const post = (route: string, body: object) =>
    request(app.getHttpServer()).post('/api/v1/' + route).send(body);
  const result = (paymentId: string, body: object) =>
    post(`payments/${paymentId}/partial-refund`, body).auth(adminToken, {
      type: 'bearer',
    });
  const status = (paymentId: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/payments/${paymentId}/partial-refund`)
      .auth(adminToken, { type: 'bearer' });
  const report = (
    outcome: 'CONFIRMED' | 'REJECTED' | 'AMBIGUOUS',
    eventId = randomUUID(),
  ) => ({ eventId, outcome, amount: '40.00', reference: `local-evidence-${eventId}` });

  async function closePrepaid(delivered = '20.00', gallons = '1.000') {
    const operationId = randomUUID();
    const body = {
      operationId,
      stationId,
      fuelId,
      plate: 'NEW-123',
      amount: '60.00',
      unitPrice: '20.00',
      mode: 'PREPAGO',
      paymentMethod: 'TARJETA',
    };
    const authorization = (
      await post('authorizations', body).set('x-kiosk-key', kioskKey).expect(201)
    ).body.authorization;
    const paymentId = (
      await db.fuelAuthorization.findUniqueOrThrow({
        where: { id: authorization.id },
      })
    ).paymentId!;
    // Academic fixture: the closing service observes a captured external
    // payment, without calling any real provider or creating a refund.
    await db.payment.update({ where: { id: paymentId }, data: { provider: 'CULQI' } });
    await post(`authorizations/${authorization.id}/progress`, {
      amount: delivered,
      gallons,
    })
      .set('x-kiosk-key', kioskKey)
      .expect(200);
    const transaction = (
      await post('transactions', {
        ...body,
        authorizationId: authorization.id,
        amount: delivered,
        gallons,
      })
        .set('x-kiosk-key', kioskKey)
        .expect(201)
    ).body.transaction;
    const reservation = await db.inventoryReservation.findUniqueOrThrow({
      where: { operationId },
    });
    const inventory = await db.fuelInventory.findUniqueOrThrow({
      where: { stationId_fuelId: { stationId, fuelId } },
    });
    const releaseCount = await db.inventoryMovement.count({
      where: { reservationId: reservation.id, kind: 'RELEASE' },
    });
    return { operationId, paymentId, transaction, reservation, inventory, releaseCount };
  }

  async function expectPhysicalUnchanged(fixture: Awaited<ReturnType<typeof closePrepaid>>) {
    const current = await db.fuelInventory.findUniqueOrThrow({
      where: { stationId_fuelId: { stationId, fuelId } },
    });
    expect(current.liters.eq(fixture.inventory.liters)).toBe(true);
    expect(current.reservedLiters.eq(fixture.inventory.reservedLiters)).toBe(true);
    expect(await db.inventoryMovement.count({
      where: { reservationId: fixture.reservation.id, kind: 'RELEASE' },
    })).toBe(fixture.releaseCount);
    expect(await db.transaction.count({ where: { operationId: fixture.operationId } })).toBe(1);
    expect((await db.inventoryReservation.findUniqueOrThrow({
      where: { operationId: fixture.operationId },
    })).status).toBe('CLOSED');
  }

  beforeAll(async () => {
    if (new URL(original).pathname !== '/primax_v11_1')
      throw Error('Se requiere PostgreSQL local de prueba');
    const url = new URL(original);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      env: process.env,
      stdio: 'pipe',
    });
    db = new PrismaClient();
    const { AppModule } = await import('../src/app.module');
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile())
      .createNestApplication();
    app.useLogger(['error']);
    setupApp(app);
    await app.init();
    const config = app.get(ConfigService);
    config.set('APP_MODE', 'local');
    config.set('SHOW_DEMO_ADMIN_CREDENTIALS', 'true');
    config.set('DEMO_ADMIN_USER', 'refund-test-admin');
    config.set('DEMO_ADMIN_PASSWORD', 'RefundTestOnly123!');
    adminToken = (await post('admin/login', {
      username: 'refund-test-admin',
      password: 'RefundTestOnly123!',
    }).expect(201)).body.accessToken;
    stationId = (await db.station.create({
      data: { code: 'RFND', name: 'Refund fixture', address: 'Local' },
    })).id;
    fuelId = (await db.fuel.create({
      data: { code: 'RFND', name: 'Refund fuel', pricePerGallon: '20.00' },
    })).id;
    await db.fuelInventory.create({ data: { stationId, fuelId, liters: '1000.000000' } });
  }, 90000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    process.env.DATABASE_URL = original;
    process.env.DATABASE_URL_UNPOOLED = original;
    console.log('Partial refund evidence schema:', schema);
  });

  it('pending → confirmed; replay, lost response and stale ambiguous event preserve physical state', async () => {
    const fixture = await closePrepaid();
    expect(fixture.transaction.status).toBe('PAYMENT_PENDING');
    expect(fixture.reservation.status).toBe('CLOSED');
    expect(fixture.releaseCount).toBe(1);
    expect((await status(fixture.paymentId).expect(200)).body.outcome).toBe('PENDING');
    const confirmed = report('CONFIRMED');
    const first = await result(fixture.paymentId, confirmed).expect(201);
    expect(first.body).toMatchObject({ outcome: 'CONFIRMED', transactionStatus: 'PAID', refundedAmount: '40.00', replayed: false });
    // The first response can be lost: a GET and the same POST recover it.
    expect((await status(fixture.paymentId).expect(200)).body.outcome).toBe('CONFIRMED');
    expect((await result(fixture.paymentId, confirmed).expect(201)).body.replayed).toBe(true);
    expect((await result(fixture.paymentId, report('CONFIRMED')).expect(201)).body.replayed).toBe(true);
    expect((await result(fixture.paymentId, report('AMBIGUOUS')).expect(201)).body).toMatchObject({ outcome: 'CONFIRMED', ignored: true });
    await result(fixture.paymentId, report('REJECTED')).expect(409);
    expect(await db.paymentEvent.count({ where: { eventKey: `partial-refund-result:${fixture.paymentId}` } })).toBe(1);
    await expectPhysicalUnchanged(fixture);
  });

  it('pending → rejected; repeats are stable and a later confirmation conflicts', async () => {
    const fixture = await closePrepaid();
    const rejected = report('REJECTED');
    expect((await result(fixture.paymentId, rejected).expect(201)).body).toMatchObject({ outcome: 'REJECTED', transactionStatus: 'PAYMENT_PENDING', refundedAmount: '0.00' });
    expect((await result(fixture.paymentId, rejected).expect(201)).body.replayed).toBe(true);
    await result(fixture.paymentId, report('CONFIRMED')).expect(409);
    expect((await status(fixture.paymentId).expect(200)).body.outcome).toBe('REJECTED');
    await expectPhysicalUnchanged(fixture);
  });

  it('pending → ambiguous twice → confirmed, including a duplicate callback', async () => {
    const fixture = await closePrepaid();
    const ambiguous = report('AMBIGUOUS');
    expect((await result(fixture.paymentId, ambiguous).expect(201)).body.outcome).toBe('AMBIGUOUS');
    expect((await result(fixture.paymentId, ambiguous).expect(201)).body.replayed).toBe(true);
    expect((await status(fixture.paymentId).expect(200)).body.transactionStatus).toBe('PAYMENT_PENDING');
    const confirmed = report('CONFIRMED');
    expect((await result(fixture.paymentId, confirmed).expect(201)).body.outcome).toBe('CONFIRMED');
    expect((await result(fixture.paymentId, confirmed).expect(201)).body.replayed).toBe(true);
    await expectPhysicalUnchanged(fixture);
  });

  it('pending → ambiguous → rejected keeps financial review and released inventory', async () => {
    const fixture = await closePrepaid();
    await result(fixture.paymentId, report('AMBIGUOUS')).expect(201);
    expect((await result(fixture.paymentId, report('REJECTED')).expect(201)).body).toMatchObject({ outcome: 'REJECTED', transactionStatus: 'PAYMENT_PENDING' });
    await expectPhysicalUnchanged(fixture);
  });

  it('event identity, amount and access controls reject incompatible reports', async () => {
    const fixture = await closePrepaid();
    const first = report('AMBIGUOUS');
    await post(`payments/${fixture.paymentId}/partial-refund`, first).expect(401);
    await post(`payments/${fixture.paymentId}/partial-refund`, first)
      .set('x-kiosk-key', kioskKey).expect(401);
    await result(fixture.paymentId, { ...first, amount: '39.99' }).expect(409);
    await result(fixture.paymentId, first).expect(201);
    await result(fixture.paymentId, { ...first, outcome: 'CONFIRMED' }).expect(409);
    await expectPhysicalUnchanged(fixture);
  });

  it('parallel final reports produce one result and one refunded amount', async () => {
    const fixture = await closePrepaid();
    const response = await Promise.all([
      result(fixture.paymentId, report('CONFIRMED')),
      result(fixture.paymentId, report('CONFIRMED')),
    ]);
    expect(response.map((item) => item.status)).toEqual([201, 201]);
    expect(await db.paymentEvent.count({ where: { eventKey: `partial-refund-result:${fixture.paymentId}` } })).toBe(1);
    expect((await db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } })).refundedAmount.toFixed(2)).toBe('40.00');
    await expectPhysicalUnchanged(fixture);
  });

  it('normal prepaid close and postpaid payment remain outside partial refund reporting', async () => {
    const full = await closePrepaid('60.00', '3.000');
    expect(full.transaction.status).toBe('PAID');
    await status(full.paymentId).expect(409);
    await result(full.paymentId, report('CONFIRMED')).expect(409);
    const postpaid = await db.transaction.create({
      data: {
        operationId: randomUUID(), requestHash: 'b'.repeat(64), plate: 'NEW-123',
        stationId, fuelId, amount: '20.00', unitPrice: '20.00', pointsRate: '0.1111',
        pointsEarned: 0, mode: 'POSTPAGO', status: 'PAID',
        payment: { create: { amount: '20.00', method: 'SALDO_PRIME', status: 'CAPTURED' } },
      }, include: { payment: true },
    });
    await status(postpaid.payment!.id).expect(409);
    await result(postpaid.payment!.id, report('CONFIRMED')).expect(409);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: postpaid.id } })).status).toBe('PAID');
  });
});
