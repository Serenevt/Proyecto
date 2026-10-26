import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createGateway } from '../server/gateway.js';
import { kioskRoute } from '../server/policy.js';

const env = { FUELFLOW_PUBLIC_ORIGIN: 'https://fuel.example', BACKEND_ORIGIN: 'https://backend.example', KIOSK_GATEWAY_SECRET: randomBytes(32).toString('hex') };
const token = 's'.repeat(43), csrf = 'c'.repeat(43), stationId = '11111111-1111-4111-8111-111111111111';
async function invoke(url, { method = 'GET', body, headers = {}, fetcher = async () => Response.json([]) } = {}) {
  const req = Readable.from([]);
  Object.assign(req, { method, url, body, headers: { 'x-fuelflow-request': '1', 'sec-fetch-site': 'same-origin', origin: env.FUELFLOW_PUBLIC_ORIGIN, 'content-type': 'application/json', cookie: '__Host-primax-kiosk=' + token, 'x-csrf-token': csrf, ...headers } });
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(value) { this.body = JSON.parse(value); } };
  await createGateway({ env, fetcher })(req, res);
  return res;
}
function backend(calls, special) {
  return async (url, options) => {
    const path = new URL(url).pathname, body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, options, body });
    const h = options.headers;
    const expected = createHmac('sha256', env.KIOSK_GATEWAY_SECRET).update(JSON.stringify([options.method, path, h['x-kiosk-time'], body, h['x-kiosk-session'], h['x-csrf-token'], h['x-terminal-session'], h.authorization])).digest('hex');
    assert.equal(h['x-kiosk-signature'], expected);
    assert.equal(h.cookie, undefined); assert.equal(h['x-kiosk-key'], undefined);
    const override = special?.(path, body); if (override) return override;
    if (path === '/api/v1/kiosk/session') return Response.json({ authenticated: true, csrfToken: csrf, stationId });
    if (path.endsWith('/authorize')) return Response.json({ allowed: true, stationId });
    return Response.json([{ id: 'fixture' }]);
  };
}
test('requires same-origin requests, session and CSRF; never calls backend for rejected inputs', async () => {
  for (const headers of [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'same-site' }, { 'x-fuelflow-request': '' }, { cookie: '' }, { 'x-csrf-token': '' }]) {
    let calls = 0; const res = await invoke('/api/v1/authorizations', { method: 'POST', body: {}, headers, fetcher: async () => { calls++; } });
    assert([401, 403].includes(res.statusCode)); assert.equal(calls, 0);
  }
});
test('denies admin routes, unexpected methods, queries and arbitrary destinations', async () => {
  for (const [method, url] of [['GET', '/api/v1/admin/dashboard'], ['DELETE', '/api/v1/fuels'], ['GET', '/api/v1/fuels?target=https://evil.example'], ['GET', '/api/v1/authorizations'], ['GET', '/api/v1/fuels%2finventory']]) {
    let calls = 0; const res = await invoke(url, { method, fetcher: async () => { calls++; } });
    assert.equal(res.statusCode, 403); assert.equal(calls, 0);
  }
});
test('validates resource permission with NestJS before forwarding the signed operation', async () => {
  const calls = []; const body = { stationId, operationId: '33333333-3333-4333-8333-333333333333' };
  const res = await invoke('/api/v1/authorizations', { method: 'POST', body, fetcher: backend(calls) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.map(c => c.path), ['/api/v1/kiosk/session/authorize', '/api/v1/authorizations']);
  assert.deepEqual(calls[0].body, { method: 'POST', path: '/api/v1/authorizations', body });
  assert.deepEqual(calls[1].body, body);
});
test('rejects a client-selected station and never executes a denied resource operation', async () => {
  const calls = []; const res = await invoke('/api/v1/transactions', { method: 'POST', body: { stationId: 'foreign-station' }, fetcher: backend(calls) });
  assert.equal(res.statusCode, 403); assert.equal(calls.length, 1);
  const denied = []; const result = await invoke('/api/v1/transactions/33333333-3333-4333-8333-333333333333', { fetcher: backend(denied, p => p.endsWith('/authorize') ? Response.json({ message: 'Forbidden' }, { status: 403 }) : null) });
  assert.equal(result.statusCode, 403); assert.equal(denied.length, 1);
});
test('session tokens stay in host-only secure cookies and are stripped from JSON', async () => {
  const calls = [];
  const response = await invoke('/api/kiosk/session/login', { method: 'POST', body: { username: 'fictional', password: 'fictional' }, fetcher: backend(calls, () => Response.json({ authenticated: true, token, ttl: 1800, csrfToken: csrf, stationId, internalCredential: 'fixture-not-for-browser' })) });
  assert.equal(response.body.token, undefined); assert.equal(response.body.ttl, undefined);
  assert.equal(response.body.internalCredential, undefined);
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=1800']) assert(response.headers['set-cookie'].includes(attribute));
  assert(!response.headers['set-cookie'].includes('Domain='));
});
test('logout clears the cookie only after shared revocation succeeds', async () => {
  const success = await invoke('/api/kiosk/session/logout', { method: 'POST', body: {}, fetcher: backend([], () => Response.json({ authenticated: false })) });
  assert(success.headers['set-cookie'].includes('Max-Age=0'));
  const failure = await invoke('/api/kiosk/session/logout', { method: 'POST', body: {}, fetcher: async () => { throw Error('fictional upstream failure'); } });
  assert.equal(failure.statusCode, 503); assert.equal(failure.headers['set-cookie'], undefined);
});
test('proxy fails closed on backend/storage errors and expired sessions', async () => {
  const res = await invoke('/api/v1/fuels', { fetcher: backend([], () => Response.json({ message: 'Sesión vencida' }, { status: 401 })) });
  assert.equal(res.statusCode, 401);
});
test('route policy is identical in the independent backend and gateway packages', () => {
  const backendSource = readFileSync(new URL('../../Backend/src/kiosk/policy.ts', import.meta.url), 'utf8');
  const executable = backendSource.slice(backendSource.indexOf('export function')).replace('export ', '').replace(/: (string|boolean)/g, '');
  const backendPolicy = runInNewContext('(' + executable + ')');
  const id = '33333333-3333-4333-8333-333333333333';
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'])
    for (const path of ['health', 'fuels', 'stations', 'fuels/inventory', 'vehicles/ABC-123', 'authorizations', 'transactions', 'plate-recognition', 'online-orders', 'admin/dashboard', 'admin/check-plate', 'memberships/me', ...['authorizations', 'transactions', 'online-orders', 'payments'].flatMap(resource => ['', '/progress', '/release', '/intervention', '/demo-confirm', '/cancel', '/refund', '?extra=1'].map(suffix => resource + '/' + id + suffix))])
      assert.equal(kioskRoute(method, '/api/v1/' + path), backendPolicy(method, '/api/v1/' + path), method + ' ' + path);
  assert(kioskRoute('POST', '/api/v1/authorizations'));
});
test('pairs through signed supervisor request and keeps technical credential out of JSON', async () => {
  const id = '33333333-3333-4333-8333-333333333333';
  const secret = 'a'.repeat(64), calls = [];
  const result = await invoke(`/api/v1/supervisor/terminals/${id}/pair`, {
    method: 'POST', body: {}, headers: { authorization: 'Bearer supervisor.jwt.token' },
    fetcher: backend(calls, () => Response.json({ token: secret, terminalId: id, expiresAt: '2030-01-01T00:00:00Z' })),
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.token, undefined);
  assert.equal(calls[0].options.headers.authorization, 'Bearer supervisor.jwt.token');
  assert(result.headers['set-cookie'][0].includes('HttpOnly'));
  assert(result.headers['set-cookie'][0].includes(secret));
});
test('terminal writes require technical cookie and matching CSRF without supervisor JWT', async () => {
  const id = '33333333-3333-4333-8333-333333333333';
  const technical = 'b'.repeat(64), technicalCsrf = 't'.repeat(43);
  const cookie = `__Host-primax-terminal=${technical}; __Host-primax-terminal-csrf=${technicalCsrf}`;
  const denied = await invoke('/api/v1/terminal/operations', { method: 'POST', body: { operationId: id },
    headers: { cookie, 'x-csrf-token': 'wrong' }, fetcher: async () => { throw Error('must not call backend'); } });
  assert.equal(denied.statusCode, 403);
  const calls = [];
  const accepted = await invoke('/api/v1/terminal/operations', { method: 'POST', body: { operationId: id },
    headers: { cookie, 'x-csrf-token': technicalCsrf }, fetcher: backend(calls) });
  assert.equal(accepted.statusCode, 200);
  assert.equal(calls[0].options.headers['x-terminal-session'], technical);
  assert.equal(calls[0].options.headers.authorization, '');
});
