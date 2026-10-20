import '../src/config/load-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { compare } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { setupApp } from '../src/setup-app';

describe('Registration and vehicles: real PostgreSQL', () => {
  let app: INestApplication, db: PrismaClient;
  const original = process.env.DATABASE_URL!;
  const schema = 'e2e_register_' + randomUUID().replaceAll('-', '');
  const password = 'RegistrationTest123!';
  const body = () => ({
    name: 'Nueva Cuenta',
    email: `${randomUUID()}@example.test`,
    password,
  });
  const register = (data = body()) =>
    request(app.getHttpServer()).post('/api/v1/auth/register').send(data);
  const member = (token: string) =>
    request(app.getHttpServer())
      .get('/api/v1/memberships/me')
      .auth(token, { type: 'bearer' });
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
  }, 90000);
  beforeEach(() =>
    app.get<ThrottlerStorageService>(ThrottlerStorage).storage.clear(),
  );
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    process.env.DATABASE_URL = original;
    console.log('Registration evidence schema preserved:', schema);
  });

  it('registers User, ACTIVE Membership, zero balance, no vehicle; JWT reads membership without hashes', async () => {
    const data = body();
    const result = await register(data).expect(201);
    const stored = await db.user.findUniqueOrThrow({
      where: { email: data.email },
      include: { membership: { include: { vehicles: true } } },
    });
    expect(stored.name).toBe(data.name);
    expect(stored.passwordHash).not.toBe(password);
    expect(await compare(password, stored.passwordHash)).toBe(true);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(stored.membership?.status).toBe('ACTIVE');
    expect(stored.membership?.balance.toFixed(2)).toBe('0.00');
    expect(stored.membership?.vehicles).toEqual([]);
    expect(result.body.user).toEqual({
      id: stored.id,
      name: data.name,
      email: data.email,
    });
    const profile = await member(result.body.accessToken).expect(200);
    expect(profile.body.number).toBe(stored.membership?.number);
    expect(JSON.stringify([result.body, profile.body])).not.toMatch(
      /password|passwordHash/,
    );
  });
  it('normalizes email and rejects duplicate concurrently DB-side', async () => {
    const data = body();
    const results = await Promise.all([
      register(data),
      register({ ...data, email: ' ' + data.email.toUpperCase() + ' ' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.user.count({ where: { email: data.email } })).toBe(1);
  });
  it.each([
    ['email', 'invalid'],
    ['password', 'short'],
    ['password', '          '],
    ['password', '😀'.repeat(25)],
    ['dni', '1234567'],
    ['dni', '123456789'],
    ['ruc', '1234567890'],
    ['ruc', 'abcdefghijk'],
    ['name', '<b></b>'],
    ['businessName', 'x'.repeat(161)],
    ['membershipId', randomUUID()],
  ])('rejects invalid %s (%s) without creating user', async (field, value) => {
    const data = { ...body(), [field]: value };
    await register(data).expect(400);
    expect(await db.user.count({ where: { email: data.email } })).toBe(0);
  });
  it.each([
    { dni: '12345678' },
    { ruc: '20123456789', businessName: ' <b>Empresa</b>\u0001 ' },
  ])('persists optional fiscal profile %j', async (fields) => {
    const data = { ...body(), ...fields };
    const res = await register(data).expect(201);
    const profile = (await member(res.body.accessToken).expect(200)).body;
    expect(profile.dni).toBe(fields.dni ?? null);
    expect(profile.ruc).toBe(fields.ruc ?? null);
    if (fields.businessName) expect(profile.businessName).toBe('Empresa');
  });
  it('generates distinct membership numbers and supports later login', async () => {
    const data = [body(), body()];
    const results = await Promise.all(data.map((d) => register(d).expect(201)));
    const profiles = await Promise.all(
      results.map((r) => member(r.body.accessToken).expect(200)),
    );
    expect(profiles[0].body.number).not.toBe(profiles[1].body.number);
    expect(profiles[0].body.number).toMatch(/^PRIME-[A-F0-9]{24}$/);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: data[0].email, password })
      .expect(200);
    expect(login.body.user.id).toBe(results[0].body.user.id);
    await member(login.body.accessToken).expect(200);
  });
  it('rolls back User when Membership insertion fails in PostgreSQL', async () => {
    const data = { ...body(), dni: '99999999' };
    await db.$executeRawUnsafe(
      'ALTER TABLE "Membership" ADD CONSTRAINT registration_failure_fixture CHECK (dni IS DISTINCT FROM \'99999999\')',
    );
    try {
      await register(data).expect(500);
      expect(await db.user.count({ where: { email: data.email } })).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE "Membership" DROP CONSTRAINT registration_failure_fixture',
      );
    }
  });
  it('persists across independent Prisma connections', async () => {
    const data = body();
    await register(data).expect(201);
    const other = new PrismaClient();
    try {
      const user = await other.user.findUniqueOrThrow({
        where: { email: data.email },
        include: { membership: true },
      });
      expect(user.membership?.status).toBe('ACTIVE');
    } finally {
      await other.$disconnect();
    }
  });
  it('links vehicle to authenticated membership, retries once, rejects another owner and spoofed membership', async () => {
    const a = (await register().expect(201)).body,
      b = (await register().expect(201)).body;
    const add = (token: string, extra = {}) =>
      request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .auth(token, { type: 'bearer' })
        .send({ plate: 'NEW123', label: 'Mi auto', ...extra });
    const [first, replay] = await Promise.all([
      add(a.accessToken),
      add(a.accessToken),
    ]);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(first.body.id).toBe(replay.body.id);
    await add(b.accessToken).expect(409);
    await add(a.accessToken, { membershipId: randomUUID() }).expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/vehicles')
      .send({ plate: 'NEW-456', label: 'Auto' })
      .expect(401);
    expect((await member(a.accessToken)).body.vehicles).toHaveLength(1);
    expect((await member(b.accessToken)).body.vehicles).toHaveLength(0);
  });
  it('enforces register rate limit', async () => {
    for (let i = 0; i < 5; i++)
      await register({ ...body(), password: 'bad' }).expect(400);
    await register().expect(429);
  });
});
