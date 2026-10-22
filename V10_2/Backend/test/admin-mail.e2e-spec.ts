import '../src/config/load-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { setupApp } from '../src/setup-app';
import { recordedPurchase } from './recorded-purchase';

describe('V10 real admin alerts and SMTP Mailpit', () => {
  let app: INestApplication,
    db: PrismaClient,
    admin: string,
    memberToken: string,
    memberId: string,
    email: string,
    number: string,
    fuelId: string,
    stationId: string;
  const original = process.env.DATABASE_URL!;
  const schema = 'e2e_admin_mail_' + randomUUID().replaceAll('-', '');
  const key = process.env.KIOSK_API_KEY!;
  const plate = 'ALT-123';
  const password = 'InitialPassword123!';
  const post = (route: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/' + route)
      .send(body);
  const alerts = () =>
    request(app.getHttpServer())
      .get('/api/v1/admin/alerts')
      .auth(admin, { type: 'bearer' });
  const check = (
    operationId = randomUUID(),
    enteredPlate = 'BAD-123',
    code = number,
  ) =>
    post('admin/check-plate', {
      operationId,
      plate: enteredPlate,
      membershipCode: code,
    }).set('x-kiosk-key', key);
  beforeAll(async () => {
    const url = new URL(original);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: process.env, stdio: 'pipe' },
    );
    db = new PrismaClient();
    const { AppModule } = await import('../src/app.module');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    app.useLogger(['error']);
    setupApp(app);
    await app.init();
    const config = app.get(ConfigService);
    config.set('APP_MODE', 'local');
    config.set('SHOW_DEMO_ADMIN_CREDENTIALS', 'true');
    config.set('DEMO_ADMIN_USER', 'admin-test');
    config.set('DEMO_ADMIN_PASSWORD', 'AdminFixtureOnly123!');
    config.set('PASSWORD_RESET_DELIVERY', 'mailpit');
    config.set('SMTP_FROM', 'no-reply@primax.local');
    admin = (
      await post('admin/login', {
        username: 'admin-test',
        password: 'AdminFixtureOnly123!',
      }).expect(201)
    ).body.accessToken;
    fuelId = (
      await db.fuel.create({
        data: { code: 'TEST', name: 'Fuel test', pricePerGallon: '20' },
      })
    ).id;
    stationId = (
      await db.station.create({
        data: { code: 'TEST', name: 'Station test', address: 'Local' },
      })
    ).id;
  }, 90000);
  beforeEach(async () => {
    app.get<ThrottlerStorageService>(ThrottlerStorage).storage.clear();
    email = randomUUID() + '@example.test';
    const user = (
      await post('auth/register', {
        email,
        password,
        name: 'Diego real fixture',
      }).expect(201)
    ).body;
    memberToken = user.accessToken;
    const membership = await db.membership.findUniqueOrThrow({
      where: { userId: user.user.id },
    });
    memberId = membership.id;
    number = membership.number;
    await db.vehicle.upsert({
      where: { plate },
      create: { plate, label: 'test', membershipId: memberId },
      update: { membershipId: memberId },
    });
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    process.env.DATABASE_URL = original;
    console.log('Admin/mail evidence schema preserved:', schema);
  });
  it('empty dashboard returns no invented alerts', async () => {
    expect((await alerts().expect(200)).body).toEqual([]);
  });
  it('vehicle endpoint returns the current Membership/User name and no password', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/vehicles/' + plate)
      .set('x-kiosk-key', key)
      .expect(200);
    expect(res.body.membership.name).toBe('Diego real fixture');
    expect(JSON.stringify(res.body)).not.toContain('password');
  });
  it('registered vehicle without Membership returns null', async () => {
    await db.vehicle.create({ data: { plate: 'NON-123', label: 'No member' } });
    const res = await request(app.getHttpServer())
      .get('/api/v1/vehicles/NON-123')
      .set('x-kiosk-key', key)
      .expect(200);
    expect(res.body.membership).toBeNull();
  });
  it('admin endpoints deny anonymous, member and kiosk access', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/alerts').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/alerts')
      .set('x-kiosk-key', key)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/alerts')
      .auth(memberToken, { type: 'bearer' })
      .expect(403);
    await post('admin/login', {
      username: 'admin-test',
      password: 'wrong',
    }).expect(401);
  });
  it('demo credentials disappear when disabled and in production mode', async () => {
    const config = app.get(ConfigService);
    const demo = () =>
      request(app.getHttpServer()).get('/api/v1/admin/demo-credentials');
    expect((await demo().expect(200)).body.password).toBe(
      'AdminFixtureOnly123!',
    );
    config.set('SHOW_DEMO_ADMIN_CREDENTIALS', 'false');
    expect((await demo().expect(200)).body).toEqual({ enabled: false });
    config.set('SHOW_DEMO_ADMIN_CREDENTIALS', 'true');
    config.set('APP_MODE', 'production');
    expect((await demo().expect(200)).body).toEqual({ enabled: false });
    config.set('APP_MODE', 'local');
  });
  it('plate mismatch is persisted once across concurrent retries', async () => {
    const operationId = randomUUID();
    await Promise.all([
      check(operationId).expect(201),
      check(operationId).expect(201),
    ]);
    const rows = await db.businessAlert.findMany({ where: { operationId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'PLATE_MISMATCH',
      plate: 'BAD-123',
      expectedPlates: [plate],
      status: 'OPEN',
      membershipId: memberId,
    });
    expect(
      (await alerts().expect(200)).body.some(
        (a: { id: string }) => a.id === rows[0].id,
      ),
    ).toBe(true);
  });
  it('valid plate and unknown code produce no false alerts', async () => {
    const op = randomUUID();
    await check(op, plate).expect(201);
    await check(op, 'BAD-123', 'UNKNOWN').expect(201);
    expect(await db.businessAlert.count({ where: { operationId: op } })).toBe(
      0,
    );
  });
  it('mismatch alert survives rejection of a postpay authorization', async () => {
    const operationId = randomUUID();
    await post('authorizations', {
      operationId,
      plate: 'BAD-123',
      membershipCode: number,
      amount: '10',
      stationId,
      fuelId,
    })
      .set('x-kiosk-key', key)
      .expect(404);
    expect(await db.businessAlert.count({ where: { operationId } })).toBe(1);
    expect(await db.fuelAuthorization.count({ where: { operationId } })).toBe(
      0,
    );
  });
  it('resolve preserves history and repeated checks never reopen an alert', async () => {
    const operationId = randomUUID();
    await check(operationId).expect(201);
    const row = await db.businessAlert.findFirstOrThrow({
      where: { operationId },
    });
    const resolved = (
      await post('admin/alerts/' + row.id + '/resolve', {})
        .auth(admin, { type: 'bearer' })
        .expect(201)
    ).body;
    await check(operationId).expect(201);
    const replay = (
      await post('admin/alerts/' + row.id + '/resolve', {})
        .auth(admin, { type: 'bearer' })
        .expect(201)
    ).body;
    expect(replay.resolvedAt).toBe(resolved.resolvedAt);
    expect(replay.status).toBe('RESOLVED');
    expect(
      (await alerts().expect(200)).body.some(
        (a: { id: string; status: string }) =>
          a.id === row.id && a.status === 'RESOLVED',
      ),
    ).toBe(true);
  });
  it('real debt creates one alert, reflects FIFO settlement and retains reviewed history', async () => {
    const auth = (
      await post('authorizations', {
        operationId: randomUUID(),
        plate,
        membershipCode: number,
        amount: '10',
        stationId,
        fuelId,
        allowDebt: true,
      })
        .set('x-kiosk-key', key)
        .expect(201)
    ).body.authorization;
    const purchase = (
      await recordedPurchase(app, key, db, {
        operationId: randomUUID(),
        plate,
        membershipCode: number,
        amount: '10',
        stationId,
        fuelId,
        mode: 'POSTPAGO',
        paymentMethod: 'SALDO_PRIME',
        authorizationId: auth.id,
      }).expect(201)
    ).body.transaction;
    const list = (await alerts().expect(200)).body;
    const row = list.find(
      (a: { transactionId: string }) => a.transactionId === purchase.id,
    );
    expect(row).toMatchObject({
      type: 'PENDING_BALANCE',
      amountPending: '10',
      userName: 'Diego real fixture',
      plate,
    });
    await Promise.all([alerts().expect(200), alerts().expect(200)]);
    expect(
      await db.businessAlert.count({ where: { transactionId: purchase.id } }),
    ).toBe(1);
    await post('admin/alerts/' + row.id + '/resolve', {})
      .auth(admin, { type: 'bearer' })
      .expect(201);
    await post('memberships/me/recharges', {
      operationId: randomUUID(),
      amount: '20',
    })
      .auth(memberToken, { type: 'bearer' })
      .expect(201);
    const settled = (await alerts().expect(200)).body.find(
      (a: { id: string }) => a.id === row.id,
    );
    expect(settled.amountPending).toBe('0');
    expect(settled.status).toBe('RESOLVED');
  });
  it('postpay closure with a different registered plate generates an authorization mismatch', async () => {
    await db.vehicle.create({
      data: { plate: 'OTH-123', label: 'Second', membershipId: memberId },
    });
    const auth = (
      await post('authorizations', {
        operationId: randomUUID(),
        plate,
        membershipCode: number,
        amount: '10',
        stationId,
        fuelId,
        allowDebt: true,
      })
        .set('x-kiosk-key', key)
        .expect(201)
    ).body.authorization;
    const operationId = randomUUID();
    await post('transactions', {
      operationId,
      plate: 'OTH-123',
      membershipCode: number,
      amount: '10',
      stationId,
      fuelId,
      mode: 'POSTPAGO',
      paymentMethod: 'SALDO_PRIME',
      authorizationId: auth.id,
    })
      .set('x-kiosk-key', key)
      .expect(400);
    expect(
      await db.businessAlert.findFirst({ where: { operationId } }),
    ).toMatchObject({ expectedPlates: [plate], plate: 'OTH-123' });
  });
  it('real SMTP local code changes password, rejects reuse and keeps API generic', async () => {
    const known = await post('auth/forgot-password', { email }).expect(200);
    const unknown = await post('auth/forgot-password', {
      email: randomUUID() + '@example.test',
    }).expect(200);
    expect(known.body).toEqual(unknown.body);
    expect(JSON.stringify(known.body)).not.toMatch(/code|token/i);
    const messages = (await (
      await fetch('http://mailpit:8025/api/v1/messages')
    ).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const message = messages.messages.find((m) =>
      m.To.some((t) => t.Address === email),
    );
    expect(message).toBeDefined();
    const content = (await (
      await fetch('http://mailpit:8025/api/v1/message/' + message!.ID)
    ).json()) as { Text: string };
    const code = content.Text.match(/\b\d{8}\b/)![0];
    const row = await db.passwordReset.findFirstOrThrow({
      where: { user: { email } },
    });
    expect(row.codeHash).not.toContain(code);
    await post('auth/verify-reset-code', {
      email,
      code: code === '00000000' ? '11111111' : '00000000',
    }).expect(400);
    const verified = await post('auth/verify-reset-code', {
      email,
      code,
    }).expect(200);
    await post('auth/verify-reset-code', { email, code }).expect(400);
    const next = 'ChangedPassword456!';
    await post('auth/reset-password', {
      resetToken: verified.body.resetToken,
      password: next,
    }).expect(200);
    await post('auth/reset-password', {
      resetToken: verified.body.resetToken,
      password: next,
    }).expect(400);
    await post('auth/login', { email, password }).expect(401);
    await post('auth/login', { email, password: next }).expect(200);
    expect(
      (await db.passwordReset.findUniqueOrThrow({ where: { id: row.id } }))
        .usedAt,
    ).not.toBeNull();
  });
});
