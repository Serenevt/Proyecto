import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import { hashSync } from 'bcryptjs';
import { Request } from 'express';
import { KioskService } from './kiosk.service';
import { KioskStore } from './redis-store';
import { PrismaService } from '../prisma/prisma.service';
import { kioskRoute } from './policy';

const stationId = '11111111-1111-4111-8111-111111111111';
const otherStation = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const key = randomBytes(32).toString('hex');
const password = 'fictional-operator-password';
const configValues = {
  APP_MODE: 'academic',
  KIOSK_GATEWAY_SECRET: key,
  KIOSK_STATION_ID: stationId,
  KIOSK_OPERATOR_USER: 'fixture-operator',
  KIOSK_OPERATOR_PASSWORD_HASH: hashSync(password, 12),
  KIOSK_SESSION_NAMESPACE: 'unit-test',
  KIOSK_SESSION_VERSION: '1',
};
// Test double only. Production uses Redis REST exclusively.
class SharedTestStore {
  data = new Map<string, string>();
  counts = new Map<string, number>();
  key(s: string) {
    return 'unit:' + s;
  }
  async command(command: string, ...args: (string | number)[]) {
    const k = String(args[0]);
    if (command === 'GET') return this.data.get(k) ?? null;
    if (command === 'DEL') return Number(this.data.delete(k));
    if (command === 'SET') {
      if (args.includes('NX') && this.data.has(k)) return null;
      this.data.set(k, String(args[1]));
      return 'OK';
    }
    throw Error('Unexpected command');
  }
  async limit(scope: string, max: number) {
    const n = (this.counts.get(scope) || 0) + 1;
    this.counts.set(scope, n);
    return n <= max;
  }
}
function request(
  path: string,
  method = 'GET',
  body: unknown = null,
  token = '',
  csrf = '',
  timestamp = String(Date.now()),
) {
  const headers: Record<string, string> = {
    'x-kiosk-time': timestamp,
    'x-kiosk-session': token,
    'x-csrf-token': csrf,
  };
  headers['x-kiosk-signature'] = createHmac('sha256', key)
    .update(
      JSON.stringify([method, path, timestamp, body, token, csrf, '', '']),
    )
    .digest('hex');
  return {
    method,
    originalUrl: path,
    body,
    header: (name: string) => headers[name],
  } as unknown as Request;
}
function fixture() {
  const store = new SharedTestStore();
  const db = {
    station: {
      findUnique: jest.fn().mockResolvedValue({ id: stationId, active: true }),
    },
    fuelAuthorization: { findUnique: jest.fn().mockResolvedValue(null) },
    transaction: { findUnique: jest.fn().mockResolvedValue(null) },
    onlineOrder: { findUnique: jest.fn().mockResolvedValue(null) },
    payment: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const config = new ConfigService({ ...configValues });
  const instance = () =>
    new KioskService(
      config,
      store as unknown as KioskStore,
      db as unknown as PrismaService,
    );
  const a = instance(),
    b = instance();
  async function login() {
    const pre = (await a.status(request('/api/v1/kiosk/session'))) as {
      token: string;
      csrfToken: string;
    };
    return a.login(
      request(
        '/api/v1/kiosk/session/login',
        'POST',
        null,
        pre.token!,
        pre.csrfToken,
      ),
      { username: 'fixture-operator', password },
    );
  }
  return { a, b, store, db, config, login };
}
describe('operator security across independent function instances', () => {
  it('cannot use a plate check to claim an existing payment operation', async () => {
    const { a, login, db } = fixture();
    const session = await login();
    db.onlineOrder.findUnique.mockResolvedValue({ id, operationId: id });
    await a.authorize(
      request(
        '/api/v1/admin/check-plate',
        'POST',
        { operationId: id },
        session.token,
        session.csrfToken,
      ),
    );
    await expect(
      a.authorize(
        request(
          '/api/v1/authorizations',
          'POST',
          { stationId, operationId: id },
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow();
  });
  it('rejects attaching a payment whose persisted station belongs to another terminal', async () => {
    const { a, login, db } = fixture();
    const session = await login();
    db.payment.findUnique.mockResolvedValue({
      authorization: { stationId: otherStation },
    });
    await expect(
      a.authorize(
        request(
          '/api/v1/authorizations',
          'POST',
          { stationId, operationId: id },
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow('estación');
  });
  it('requires gateway proof, rejects modified body/path/session and stale signatures', () => {
    const { a } = fixture();
    for (const field of ['body', 'originalUrl', 'method']) {
      const req = request('/api/v1/fuels');
      Object.assign(req, {
        [field]: field === 'body' ? { changed: true } : 'changed',
      });
      expect(() => a.verifyGateway(req)).toThrow();
    }
    expect(() =>
      a.verifyGateway(
        request(
          '/api/v1/fuels',
          'GET',
          null,
          '',
          '',
          String(Date.now() - 31000),
        ),
      ),
    ).toThrow();
  });
  it('rotates preauth, shares authenticated sessions, checks CSRF and revokes on logout', async () => {
    const { a, b, login } = fixture();
    const session = await login();
    expect(
      (await b.session(session.token, session.csrfToken)).authenticated,
    ).toBe(true);
    await expect(b.session(session.token, 'wrong-csrf')).rejects.toThrow();
    await a.logout(
      request(
        '/api/v1/kiosk/session/logout',
        'POST',
        {},
        session.token,
        session.csrfToken,
      ),
    );
    await expect(b.session(session.token)).rejects.toThrow();
  });
  it('revokes sessions on credential version change and absolute expiry', async () => {
    const { a, b, login, config } = fixture();
    const session = await login();
    config.set('KIOSK_SESSION_VERSION', '2');
    await expect(b.session(session.token)).rejects.toThrow();
    config.set('KIOSK_SESSION_VERSION', '1');
    const now = jest.spyOn(Date, 'now').mockReturnValue(session.expiresAt + 1);
    try {
      await expect(a.session(session.token)).rejects.toThrow();
    } finally {
      now.mockRestore();
    }
  });
  it('shares login limits even when a client changes its claimed username', async () => {
    const { a, b } = fixture();
    const pre = (await a.status(request('/api/v1/kiosk/session'))) as {
      token: string;
      csrfToken: string;
    };
    for (let n = 0; n < 5; n++)
      await expect(
        a.login(
          request(
            '/api/v1/kiosk/session/login',
            'POST',
            null,
            pre.token!,
            pre.csrfToken,
          ),
          { username: String(n), password: 'wrong' },
        ),
      ).rejects.toThrow('Credenciales');
    await expect(
      b.login(
        request(
          '/api/v1/kiosk/session/login',
          'POST',
          null,
          pre.token!,
          pre.csrfToken,
        ),
        { username: 'fixture-operator', password },
      ),
    ).rejects.toThrow('Demasiados intentos');
  });
  it('checks station and referenced authorization before any purchase can execute', async () => {
    const { a, login, db } = fixture();
    const session = await login();
    const body = { stationId: otherStation, operationId: id };
    await expect(
      a.authorize(
        request(
          '/api/v1/transactions',
          'POST',
          body,
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow('estación');
    body.stationId = stationId;
    db.fuelAuthorization.findUnique.mockResolvedValue({
      stationId: otherStation,
    });
    await expect(
      a.authorize(
        request(
          '/api/v1/transactions',
          'POST',
          { ...body, authorizationId: id },
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow('estación');
  });
  it('denies access to existing online orders without a trusted operation binding', async () => {
    const { a, login, db } = fixture();
    const session = await login();
    db.onlineOrder.findUnique.mockResolvedValue({ id, operationId: id });
    await expect(
      a.authorize(
        request(
          '/api/v1/online-orders/' + id,
          'GET',
          null,
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow();
    const body = {
      operationId: id,
      authorization: { operationId: id, stationId },
    };
    await expect(
      a.authorize(
        request(
          '/api/v1/online-orders',
          'POST',
          body,
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow();
  });
  it('rechecks resource station and denies admin/member/bulk endpoints', async () => {
    const { a, login, db } = fixture();
    const session = await login();
    db.transaction.findUnique.mockResolvedValue({ stationId: otherStation });
    await expect(
      a.authorize(
        request(
          '/api/v1/transactions/' + id,
          'GET',
          null,
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow();
    for (const path of [
      '/api/v1/admin/dashboard',
      '/api/v1/memberships/me',
      '/api/v1/authorizations',
    ])
      expect(kioskRoute('GET', path)).toBe(false);
  });
  it('fails closed when shared storage is unavailable', async () => {
    const { a, store, login } = fixture();
    const session = await login();
    store.command = jest.fn().mockRejectedValue(Error('offline'));
    await expect(a.session(session.token)).rejects.toThrow();
  });
});
