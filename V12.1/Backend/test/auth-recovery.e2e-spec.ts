import '../src/config/load-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { compare } from 'bcryptjs';
import request from 'supertest';
import { setupApp } from '../src/setup-app';
import { RecoveryDelivery } from '../src/auth/recovery-delivery';

describe('Single authentication and password recovery: PostgreSQL', () => {
  let app: INestApplication,
    db: PrismaClient,
    email: string,
    userId: string,
    jwt: string,
    code: string;
  const original = process.env.DATABASE_URL!,
    schema = 'e2e_recovery_' + randomUUID().replaceAll('-', '');
  const password = 'OriginalPassword123!',
    nextPassword = 'ReplacementPassword456!';
  const delivery = {
    mode: 'demo',
    send: jest.fn(async (_email: string, value: string) => {
      code = value;
    }),
  };
  beforeAll(async () => {
    const url = new URL(original);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString(); process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: process.env, stdio: 'pipe' },
    );
    db = new PrismaClient();
    const { AppModule } = await import('../src/app.module');
    app = (
      await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(RecoveryDelivery)
        .useValue(delivery)
        .compile()
    ).createNestApplication();
    app.useLogger(['error']);
    setupApp(app);
    await app.init();
  }, 90000);
  beforeEach(async () => {
    const throttle = app.get<ThrottlerStorageService>(ThrottlerStorage);
    throttle.onApplicationShutdown();
    throttle.storage.clear();
    delivery.send.mockClear();
    delivery.mode = 'demo';
    code = '';
    email = randomUUID() + '@example.test';
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ passport: randomUUID().replaceAll('-','').slice(0,12).toUpperCase(), email, name: 'Recovery fixture', password })
      .expect(201);
    userId = res.body.user.id;
    jwt = res.body.accessToken;
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    process.env.DATABASE_URL = original; process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
    console.log('Recovery evidence schema:', schema);
  });
  const post = (route: string, data: object) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/' + route)
      .send(data);
  const forgot = () => post('forgot-password', { email });
  const verify = (value = code) =>
    post('verify-reset-code', { email, code: value });
  const reset = (resetToken: string, value = nextPassword) =>
    post('reset-password', { resetToken, password: value });
  const profile = () =>
    request(app.getHttpServer())
      .get('/api/v1/memberships/me')
      .auth(jwt, { type: 'bearer' });
  const row = () => db.passwordReset.findUniqueOrThrow({ where: { userId } });
  async function grant() {
    await forgot().expect(200);
    return (await verify().expect(200)).body.resetToken as string;
  }
  it('email identifier and legacy email payload use the same existing account', async () => {
    for (const data of [{ identifier: email.toUpperCase() }, { email }]) {
      const res = await post('login', { ...data, password }).expect(200);
      expect(res.body.user.id).toBe(userId);
      expect(JSON.stringify(res.body)).not.toMatch(
        /passwordHash|authVersion|resetToken|codeHash/,
      );
    }
  });
  it('DNI login resolves the unique membership owner, not RUC or passport', async () => {
    await db.membership.update({
      where: { userId },
      data: { passport: null, dni: '71000001', ruc: '25000000001' },
    });
    const res = await post('login', {
      identifier: '71000001',
      password,
    }).expect(200);
    expect(res.body.user.id).toBe(userId);
    await post('login', { identifier: '25000000001', password }).expect(400);
  });
  it('unknown identifier and wrong password have the same generic 401', async () => {
    const a = await post('login', { identifier: '00000000', password }).expect(
      401,
    );
    const b = await post('login', {
      identifier: email,
      password: 'incorrect',
    }).expect(401);
    expect(a.body.message).toBe(b.body.message);
  });
  it('forgot reports missing account but never exposes code/token', async () => {
    const a = await forgot().expect(200);
    const b = await post('forgot-password', {
      email: 'missing@example.test',
    }).expect(400);
    expect(b.body.message).toBe('No existe una cuenta registrada con este correo.');
    expect(Object.keys(a.body).sort()).toEqual(['delivery', 'message']);
    expect(delivery.send).toHaveBeenCalledTimes(1);
    const stored = await row();
    expect(stored.codeHash).toHaveLength(64);
    expect(stored.codeHash).not.toContain(code);
    expect(stored.tokenHash).toBeNull();
  });
  it('disabled delivery does not issue a hidden usable recovery code', async () => {
    delivery.mode = 'disabled';
    await forgot().expect(400);
    expect(delivery.send).not.toHaveBeenCalled();
    expect(await db.passwordReset.count({ where: { userId } })).toBe(0);
  });
  it('account cooldown does not allow repeated delivery or token replacement', async () => {
    await forgot().expect(200);
    const before = await row();
    await forgot().expect(200);
    expect(await row()).toEqual(before);
    expect(delivery.send).toHaveBeenCalledTimes(1);
  });
  it('valid code grants one hashed token; password changes and previous JWT/password stop working', async () => {
    await profile().expect(200);
    const token = await grant();
    expect((await row()).tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    await verify().expect(400);
    await reset(token).expect(200);
    await post('login', { identifier: email, password: nextPassword }).expect(
      200,
    );
    await post('login', { email, password }).expect(401);
    await profile().expect(401);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await compare(nextPassword, user.passwordHash)).toBe(true);
    expect(user.authVersion).toBe(1);
    expect((await row()).usedAt).not.toBeNull();
    expect((await row()).tokenHash).toBeNull();
  });
  it('incorrect code increments persisted attempts and cannot reset password', async () => {
    await forgot().expect(200);
    await verify(code === '00000000' ? '11111111' : '00000000').expect(400);
    expect((await row()).attempts).toBe(1);
    expect((await row()).verifiedAt).toBeNull();
    await reset('a'.repeat(43)).expect(400);
  });
  it('expired code is rejected', async () => {
    await forgot().expect(200);
    await db.passwordReset.update({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await verify().expect(400);
  });
  it('SMTP failure invalidates the issued code and reports delivery failure', async () => {
    delivery.send.mockRejectedValueOnce(new Error('SMTP unavailable'));
    await forgot().expect(503);
    expect((await row()).usedAt).not.toBeNull();
    await verify('12345678').expect(400);
  });
  it('five wrong attempts permanently invalidate this code', async () => {
    await forgot().expect(200);
    const wrong = code === '00000000' ? '11111111' : '00000000';
    for (let i = 0; i < 5; i++) await verify(wrong).expect(400);
    await verify().expect(400);
    expect((await row()).attempts).toBe(5);
  });
  it('concurrent code verification has only one winner', async () => {
    await forgot().expect(200);
    const results = await Promise.all([verify(), verify()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });
  it('reset token is single-use even across concurrent resets', async () => {
    const token = await grant();
    const results = await Promise.all([reset(token), reset(token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    await reset(token).expect(400);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } })).authVersion,
    ).toBe(1);
  });
  it('expired verified token cannot change password', async () => {
    const token = await grant();
    await db.passwordReset.update({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await reset(token).expect(400);
  });
  it('new request after cooldown invalidates an older verified token', async () => {
    const old = await grant();
    await db.passwordReset.update({
      where: { userId },
      data: { createdAt: new Date(Date.now() - 61000) },
    });
    await forgot().expect(200);
    await reset(old).expect(400);
    await verify().expect(200);
  });
  it.each(['short', '          ', 'a'.repeat(73)])(
    'new password follows registration rules: %j',
    async (invalid) => {
      const token = await grant();
      await reset(token, invalid).expect(400);
      await reset(token).expect(200);
    },
  );
  it('forgot-password is rate limited per IP even for missing accounts', async () => {
    for (let i = 0; i < 5; i++)
      await post('forgot-password', { email: 'unknown@example.test' }).expect(
        400,
      );
    await forgot().expect(429);
  });
});
