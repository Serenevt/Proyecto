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
  const register = (data: Record<string, unknown> = body()) =>
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

  it.each([
    [1, 'PRIM001'],
    [2, 'PRIM002'],
    [999, 'PRIM999'],
    [1000, 'PRIM001A'],
    [1998, 'PRIM999A'],
    [1999, 'PRIM001B'],
  ])('persists sequential ordinal %s as %s', async (ordinal, expected) => {
    await db.$executeRaw`UPDATE "MembershipNumberCounter" SET "value" = ${BigInt(Number(ordinal) - 1)} WHERE "id" = 1`;
    const result = await register().expect(201);
    expect(
      (await member(result.body.accessToken).expect(200)).body.number,
    ).toBe(expected);
  });
  it('preserves historical codes and skips an occupied sequential code', async () => {
    const historic = await db.user.create({
      data: {
        name: 'Historical',
        email: body().email,
        passwordHash: 'fixture',
        membership: { create: { number: 'PRIME-HISTORICAL' } },
      },
      include: { membership: true },
    });
    const existing = await db.membership.findUniqueOrThrow({
      where: { number: 'PRIM001B' },
    });
    await db.$executeRaw`UPDATE "MembershipNumberCounter" SET "value" = 1998 WHERE "id" = 1`;
    const result = await register().expect(201);
    expect((await member(result.body.accessToken)).body.number).toBe(
      'PRIM002B',
    );
    expect(
      await db.membership.findUnique({ where: { id: existing.id } }),
    ).toEqual(existing);
    expect(
      await db.membership.findUnique({
        where: { id: historic.membership!.id },
      }),
    ).toEqual(historic.membership);
  });
  it('serializes concurrent registrations without duplicates or lost counter increments', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () => register().expect(201)),
    );
    const profiles = await Promise.all(
      results.map((r) => member(r.body.accessToken).expect(200)),
    );
    expect(profiles.map((r) => r.body.number).sort()).toEqual([
      'PRIM003B',
      'PRIM004B',
      'PRIM005B',
      'PRIM006B',
    ]);
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
    expect(profiles[0].body.number).toMatch(/^PRIM[0-9]{3}[A-Z]*$/);
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
  const update = (token: string, data: object) =>
    request(app.getHttpServer())
      .patch('/api/v1/memberships/me/profile')
      .auth(token, { type: 'bearer' })
      .send(data);
  const documents = [
    ['dni', '65000001', 'DNI'],
    ['ruc', '24000000001', 'RUC'],
  ] as const;
  it.each(documents)(
    'rejects duplicate %s with 409 and rolls back user, membership and counter',
    async (field, value, label) => {
      const owner = await register({ ...body(), [field]: value }).expect(201);
      const before = await db.membershipNumberCounter.findUniqueOrThrow({
        where: { id: 1 },
      });
      const original = (await member(owner.body.accessToken)).body;
      const duplicate = { ...body(), [field]: value };
      const response = await register(duplicate).expect(409);
      expect(response.body.message).toBe(
        `Este ${label} ya se encuentra registrado.`,
      );
      expect(
        await db.user.findUnique({ where: { email: duplicate.email } }),
      ).toBeNull();
      expect(await db.membership.count({ where: { [field]: value } })).toBe(1);
      expect(
        await db.membershipNumberCounter.findUnique({ where: { id: 1 } }),
      ).toEqual(before);
      expect((await member(owner.body.accessToken)).body).toEqual(original);
    },
  );
  it('allows multiple explicit null documents and omitted documents', async () => {
    const results = await Promise.all([
      register({ ...body(), dni: null, ruc: null }).expect(201),
      register({ ...body(), dni: null, ruc: null }).expect(201),
      register().expect(201),
    ]);
    for (const result of results)
      expect((await member(result.body.accessToken)).body).toMatchObject({
        dni: null,
        ruc: null,
        passport: null,
      });
  });
  it.each(documents)(
    'PostgreSQL enforces UNIQUE %s even without HTTP',
    async (field, value) => {
      const other = await register().expect(201);
      const own = (await member(other.body.accessToken)).body;
      await expect(
        db.membership.update({
          where: { id: own.id },
          data: { [field]: value },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      expect((await member(other.body.accessToken)).body[field]).toBeNull();
    },
  );
  it.each(documents)(
    'concurrent registrations sharing %s create only one complete account',
    async (field, value, label) => {
      const document = String(BigInt(value) + 1n);
      const inputs = [body(), body()];
      const results = await Promise.all(
        inputs.map((data) => register({ ...data, [field]: document })),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.message).toBe(
        `Este ${label} ya se encuentra registrado.`,
      );
      expect(
        await db.user.count({
          where: { email: { in: inputs.map((d) => d.email) } },
        }),
      ).toBe(1);
      expect(await db.membership.count({ where: { [field]: document } })).toBe(
        1,
      );
    },
  );
  it.each(documents)(
    'owner can save and clear their own %s',
    async (field, value) => {
      const document = String(BigInt(value) + 2n);
      const result = await register({ ...body(), [field]: document }).expect(
        201,
      );
      await update(result.body.accessToken, { [field]: document }).expect(200);
      expect((await member(result.body.accessToken)).body[field]).toBe(
        document,
      );
      await update(result.body.accessToken, { [field]: null }).expect(200);
      expect((await member(result.body.accessToken)).body[field]).toBeNull();
    },
  );
  it.each(documents)(
    'editing another account cannot take occupied %s',
    async (field, value, label) => {
      const result = await register().expect(201);
      const response = await update(result.body.accessToken, {
        [field]: value,
      }).expect(409);
      expect(response.body.message).toBe(
        `Este ${label} ya se encuentra registrado.`,
      );
      expect((await member(result.body.accessToken)).body[field]).toBeNull();
    },
  );
  it.each(documents)(
    'concurrent edits cannot claim the same %s',
    async (field, value, label) => {
      const document = String(BigInt(value) + 3n);
      const users = await Promise.all([
        register().expect(201),
        register().expect(201),
      ]);
      const results = await Promise.all(
        users.map((r) => update(r.body.accessToken, { [field]: document })),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body.message).toBe(
        `Este ${label} ya se encuentra registrado.`,
      );
      expect(await db.membership.count({ where: { [field]: document } })).toBe(
        1,
      );
    },
  );
  it.each([
    ['dni', ''],
    ['dni', '123456789'],
    ['dni', 'abcdefgh'],
    ['ruc', ''],
    ['ruc', '123456789012'],
    ['ruc', 'abcdefghijk'],
  ])('rejects invalid %s on profile edit: %s', async (field, value) => {
    const result = await register().expect(201);
    await update(result.body.accessToken, { [field]: value }).expect(400);
    expect((await member(result.body.accessToken)).body[field]).toBeNull();
  });

  it('foreign user registers with normalized passport and no DNI, then logs in by email', async () => {
    const data = { ...body(), passport: '  ab123456  ' };
    const result = await register(data).expect(201);
    expect((await member(result.body.accessToken)).body).toMatchObject({
      dni: null,
      passport: 'AB123456',
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: data.email, password })
      .expect(200);
  });
  it('duplicate normalized passport returns 409 without orphaned account', async () => {
    const data = { ...body(), passport: ' ab123456 ' };
    const res = await register(data).expect(409);
    expect(res.body.message).toBe('Este pasaporte ya se encuentra registrado.');
    expect(await db.user.count({ where: { email: data.email } })).toBe(0);
  });
  it('concurrent passport registrations have one winner', async () => {
    const inputs = [body(), body()];
    const results = await Promise.all(
      inputs.map((data) => register({ ...data, passport: 'CC987654' })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await db.user.count({
        where: { email: { in: inputs.map((d) => d.email) } },
      }),
    ).toBe(1);
  });
  it.each(['AB-1234', 'A123', 'A'.repeat(21), '<script>'])(
    'rejects invalid passport %s',
    async (passport) => {
      const data = { ...body(), passport };
      await register(data).expect(400);
      expect(await db.user.count({ where: { email: data.email } })).toBe(0);
    },
  );
  it('rejects simultaneous DNI/passport without creating either row', async () => {
    const data = { ...body(), dni: '76543210', passport: 'DD123456' };
    await register(data).expect(400);
    expect(await db.user.count({ where: { email: data.email } })).toBe(0);
  });
  it('passport owner can retain it and switch to DNI atomically, but cannot hold both', async () => {
    const result = await register({ ...body(), passport: 'EE123456' }).expect(
      201,
    );
    await update(result.body.accessToken, { passport: ' ee123456 ' }).expect(
      200,
    );
    await update(result.body.accessToken, { dni: '76543211' }).expect(400);
    await update(result.body.accessToken, {
      dni: '76543211',
      passport: null,
    }).expect(200);
    expect((await member(result.body.accessToken)).body).toMatchObject({
      dni: '76543211',
      passport: null,
    });
  });
  it('profile cannot take another passport and database enforces uniqueness directly', async () => {
    const result = await register().expect(201);
    const res = await update(result.body.accessToken, {
      passport: 'AB123456',
    }).expect(409);
    expect(res.body.message).toBe('Este pasaporte ya se encuentra registrado.');
    const own = (await member(result.body.accessToken)).body;
    await expect(
      db.membership.update({
        where: { id: own.id },
        data: { passport: 'AB123456' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
  it('enforces register rate limit', async () => {
    for (let i = 0; i < 5; i++)
      await register({ ...body(), password: 'bad' }).expect(400);
    await register().expect(429);
  });
});
