// Full Nest routing/guards/pipes with shared test storage and a mocked database.
// No PostgreSQL/Redis server is contacted and no migrations or seeds run.
jest.mock('../config/environment', () => ({
  validateEnvironment: () => ({ PORT: 3000, SOLES_PER_POINT: '9' }),
}));
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { setupApp } from '../setup-app';
import { KioskStore } from './redis-store';

describe('Nest HTTP operator boundary (all persistence mocked)', () => {
  let app: INestApplication;
  const stationId = '11111111-1111-4111-8111-111111111111';
  const foreignId = '22222222-2222-4222-8222-222222222222';
  const secret = randomBytes(32).toString('hex');
  const password = 'fictional-http-fixture';
  const data = new Map<string, string>();
  const store = {
    key: (key: string) => key,
    limit: jest.fn().mockResolvedValue(true),
    command: jest.fn(async (command: string, ...args: (string | number)[]) => {
      const k = String(args[0]);
      if (command === 'SET') {
        if (args.includes('NX') && data.has(k)) return null;
        data.set(k, String(args[1]));
        return 'OK';
      }
      if (command === 'GET') return data.get(k) ?? null;
      if (command === 'DEL') return Number(data.delete(k));
      throw Error('Unexpected test command');
    }),
  };
  const db = {
    station: {
      findUnique: jest.fn().mockResolvedValue({ id: stationId, active: true }),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: stationId }, { id: foreignId }]),
    },
    fuel: { findMany: jest.fn().mockResolvedValue([]) },
    fuelAuthorization: {
      findUnique: jest.fn().mockResolvedValue({ stationId: foreignId }),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
  beforeAll(async () => {
    const config = new ConfigService({
      APP_MODE: 'academic',
      JWT_SECRET: randomBytes(32).toString('hex'),
      KIOSK_API_KEY: 'k'.repeat(48),
      KIOSK_GATEWAY_SECRET: secret,
      KIOSK_STATION_ID: stationId,
      KIOSK_SESSION_VERSION: '1',
      KIOSK_OPERATOR_USER: 'fixture-operator',
      KIOSK_OPERATOR_PASSWORD_HASH: hashSync(password, 12),
      SOLES_PER_POINT: '9',
      CORS_ORIGINS: 'https://prime.example',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(KioskStore)
      .useValue(store)
      .compile();
    app = module.createNestApplication({ bodyParser: false });
    setupApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  function signed(
    method: 'GET' | 'POST',
    path: string,
    body: unknown = null,
    token = '',
    csrf = '',
  ) {
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', secret)
      .update(
        JSON.stringify([method, path, timestamp, body, token, csrf, '', '']),
      )
      .digest('hex');
    const result =
      method === 'GET'
        ? request(app.getHttpServer()).get(path)
        : request(app.getHttpServer()).post(path);
    result
      .set('x-kiosk-time', timestamp)
      .set('x-kiosk-signature', signature)
      .set('x-kiosk-session', token)
      .set('x-csrf-token', csrf);
    if (body !== null) result.send(body);
    return result;
  }
  it('requires proof, validates DTOs and rejects key-only access in the academic profile', async () => {
    await request(app.getHttpServer()).get('/api/v1/kiosk/session').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/authorizations')
      .set('x-kiosk-key', 'k'.repeat(48))
      .send({})
      .expect(401);
    await signed('POST', '/api/v1/kiosk/session/login', {
      username: 'fixture',
      password: 'fixture',
      stationId,
    }).expect(400);
  });
  it('authenticates, restricts public catalog station, blocks foreign resources and revokes', async () => {
    const pre = (await signed('GET', '/api/v1/kiosk/session').expect(200)).body;
    const body = { username: 'fixture-operator', password };
    await signed(
      'POST',
      '/api/v1/kiosk/session/login',
      body,
      pre.token,
      'wrong',
    ).expect(403);
    const session = (
      await signed(
        'POST',
        '/api/v1/kiosk/session/login',
        body,
        pre.token,
        pre.csrfToken,
      ).expect(201)
    ).body;
    await signed('GET', '/api/v1/fuels', null, pre.token, pre.csrfToken).expect(
      401,
    );
    await signed('GET', '/api/v1/fuels', null, session.token, 'wrong').expect(
      403,
    );
    const stations = await signed(
      'GET',
      '/api/v1/stations',
      null,
      session.token,
      session.csrfToken,
    ).expect(200);
    expect(stations.body).toEqual([{ id: stationId }]);
    await signed(
      'GET',
      '/api/v1/authorizations/' + foreignId,
      null,
      session.token,
      session.csrfToken,
    ).expect(403);
    await signed(
      'GET',
      '/api/v1/admin/dashboard',
      null,
      session.token,
      session.csrfToken,
    ).expect(403);
    await signed(
      'POST',
      '/api/v1/kiosk/session/logout',
      {},
      session.token,
      session.csrfToken,
    ).expect(201);
    await signed(
      'GET',
      '/api/v1/fuels',
      null,
      session.token,
      session.csrfToken,
    ).expect(401);
  });
});
