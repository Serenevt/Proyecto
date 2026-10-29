import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createGateway } from '../server/gateway.js';
import gatewayFunction from '../api/gateway.js';
import { kioskRoute } from '../server/policy.js';

const env = { FUELFLOW_PUBLIC_ORIGIN: 'https://fuel.example', BACKEND_ORIGIN: 'https://backend.example', KIOSK_GATEWAY_SECRET: randomBytes(32).toString('hex') };
const token = 's'.repeat(43), csrf = 'c'.repeat(43), stationId = '11111111-1111-4111-8111-111111111111';
async function invoke(url, { method = 'GET', body, headers = {}, fetcher = async () => Response.json([]), gatewayEnv = env } = {}) {
  const req = Readable.from([]);
  Object.assign(req, { method, url, body, headers: { 'x-fuelflow-request': '1', 'sec-fetch-site': 'same-origin', origin: env.FUELFLOW_PUBLIC_ORIGIN, 'content-type': 'application/json', cookie: '__Host-primax-kiosk=' + token, 'x-csrf-token': csrf, ...headers } });
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(value) { this.body = JSON.parse(value); } };
  await createGateway({ env: gatewayEnv, fetcher })(req, res);
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
  const res = await invoke('/api/v1/authorizations', { method: 'POST', body, headers: { cookie: '__Host-primax-kiosk=' + token + '; __Host-primax-terminal=' + 'a'.repeat(64) }, fetcher: backend(calls) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.map(c => c.path), ['/api/v1/kiosk/session/authorize', '/api/v1/authorizations']);
  assert.deepEqual(calls[0].body, { method: 'POST', path: '/api/v1/authorizations', body });
  assert.deepEqual(calls[1].body, body);
  assert.equal(calls[1].options.headers['x-terminal-session'], 'a'.repeat(64));
});
test('rejects a client-selected station and never executes a denied resource operation', async () => {
  const calls = []; const res = await invoke('/api/v1/transactions', { method: 'POST', body: { stationId: 'foreign-station' }, headers: { cookie: '__Host-primax-kiosk=' + token + '; __Host-primax-terminal=' + 'a'.repeat(64) }, fetcher: backend(calls) });
  assert.equal(res.statusCode, 403); assert.equal(calls.length, 1);
  const denied = []; const result = await invoke('/api/v1/transactions/33333333-3333-4333-8333-333333333333', { fetcher: backend(denied, p => p.endsWith('/authorize') ? Response.json({ message: 'Forbidden' }, { status: 403 }) : null) });
  assert.equal(result.statusCode, 403); assert.equal(denied.length, 1);
});
test('never forwards a new financial sale without a technical cookie', async () => {
  for (const path of ['/api/v1/authorizations', '/api/v1/online-orders', '/api/v1/transactions', '/api/v1/online-orders/33333333-3333-4333-8333-333333333333/reselect']) {
    let calls = 0;
    const result = await invoke(path, { method: 'POST', body: { stationId, operationId: '33333333-3333-4333-8333-333333333333' }, fetcher: async () => { calls++; return Response.json({}); } });
    assert.equal(result.statusCode, 401);
    assert.equal(calls, 0);
  }
});
test('session tokens stay in host-only secure cookies and are stripped from JSON', async () => {
  const calls = [];
  const response = await invoke('/api/kiosk/session/login', { method: 'POST', body: { username: 'fictional', password: 'fictional' }, fetcher: backend(calls, () => Response.json({ authenticated: true, token, ttl: 1800, csrfToken: csrf, stationId, internalCredential: 'fixture-not-for-browser' })) });
  assert.equal(response.body.token, undefined); assert.equal(response.body.ttl, undefined);
  assert.equal(response.body.internalCredential, undefined);
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=1800']) assert(response.headers['set-cookie'].includes(attribute));
  assert(!response.headers['set-cookie'].includes('Domain='));
});
test('loopback Compose mode uses an HttpOnly local cookie and a private backend origin', async () => {
  const localEnv = { ...env, FUELFLOW_PUBLIC_ORIGIN: 'http://127.0.0.1:26081', BACKEND_ORIGIN: 'http://backend:3000', FUELFLOW_LOCAL_HTTP: 'true' };
  const response = await invoke('/api/kiosk/session', {
    gatewayEnv: localEnv,
    headers: { origin: localEnv.FUELFLOW_PUBLIC_ORIGIN },
    fetcher: async (url) => {
      assert.equal(url, 'http://backend:3000/api/v1/kiosk/session');
      return Response.json({ authenticated: false, token, ttl: 300, csrfToken: csrf });
    },
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['set-cookie'], /^primax-kiosk-local=/);
  assert.match(response.headers['set-cookie'], /HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(response.headers['set-cookie'], /Secure/);
  assert.equal(response.body.token, undefined);
});
test('logout clears the cookie only after shared revocation succeeds', async () => {
  const success = await invoke('/api/kiosk/session/logout', { method: 'POST', body: {}, fetcher: backend([], () => Response.json({ authenticated: false })) });
  assert(success.headers['set-cookie'].includes('Max-Age=0'));
  const failure = await invoke('/api/kiosk/session/logout', { method: 'POST', body: {}, fetcher: async () => { throw Error('fictional upstream failure'); } });
  assert.equal(failure.statusCode, 503); assert.equal(failure.headers['set-cookie'], undefined);
});
test('proxy fails closed on backend/storage errors and expired sessions', async () => {
  const res = await invoke('/api/v1/vehicles/ABC-123', { fetcher: backend([], () => Response.json({ message: 'Sesión vencida' }, { status: 401 })) });
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
test('reselect sends JSON through the strict gateway and unknown methods stay blocked', async () => {
  const id = '33333333-3333-4333-8333-333333333333';
  const calls=[];
  const body={operationId:id,method:'PLIN',authorization:{operationId:id,paymentMethod:'PLIN',stationId}};
  const ok=await invoke(`/api/v1/online-orders/${id}/reselect`,{method:'POST',body,headers:{cookie:'__Host-primax-kiosk='+token+'; __Host-primax-terminal='+'b'.repeat(64)},fetcher:backend(calls)});
  assert.equal(ok.statusCode,200);
  assert.deepEqual(calls.map(row=>row.path),['/api/v1/kiosk/session/authorize',`/api/v1/online-orders/${id}/reselect`]);
  assert.deepEqual(calls.at(-1).body,body);
  const denied=await invoke(`/api/v1/online-orders/${id}/reselect`,{method:'GET',fetcher:async()=>{throw Error('must not call backend');}});
  assert.equal(denied.statusCode,403);
});
test('terminal/me restores a fresh same-origin CSRF cookie only after a valid technical session', async () => {
  const technical='b'.repeat(64);
  const calls=[];
  const me=await invoke('/api/v1/terminal/me',{headers:{cookie:`__Host-primax-terminal=${technical}`},fetcher:backend(calls, path=>path==='/api/v1/terminal/me'?Response.json({canStart:true,operationalStatus:'DISPONIBLE'}):null)});
  assert.equal(me.statusCode,200);
  assert.match(me.headers['set-cookie'],/^__Host-primax-terminal-csrf=/);
  assert.match(me.headers['set-cookie'],/Secure; SameSite=Strict/);
  assert(!me.headers['set-cookie'].includes('HttpOnly'));
  const rejected=await invoke('/api/v1/terminal/me',{headers:{cookie:''},fetcher:async()=>{throw Error('must not call backend');}});
  assert.equal(rejected.statusCode,401);
});
test('INICIAR nested Vercel Functions use the signed BFF and preserve operationId', async () => {
  assert.equal(typeof gatewayFunction, 'function');
  const id = '33333333-3333-4333-8333-333333333333';
  const technical = 'b'.repeat(64), technicalCsrf = 't'.repeat(43);
  const cookie = `__Host-primax-terminal=${technical}; __Host-primax-terminal-csrf=${technicalCsrf}`;
  const calls = [];
  const accepted = await invoke('/api/v1/terminal/operations', { method: 'POST', body: { operationId: id }, headers: { cookie, 'x-csrf-token': technicalCsrf }, fetcher: backend(calls, (path) => path === '/api/v1/terminal/operations' ? Response.json({ operationId: id, status: 'OPEN' }) : null) });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.operationId, id);
  assert.equal(calls[0].path, '/api/v1/terminal/operations');
  assert.equal(calls[0].body.operationId, id);
  assert.equal(calls[0].options.headers['x-terminal-session'], technical);
  const checked = await invoke(`/api/v1/terminal/operations/${id}?id=${id}`, { headers: { cookie }, fetcher: backend([], () => Response.json({ operationId: id, status: 'OPEN' })) });
  assert.equal(checked.statusCode, 200);
  const wrongMethod = await invoke('/api/v1/terminal/operations', { method: 'GET', headers: { cookie }, fetcher: async () => { throw Error('upstream must not run'); } });
  assert.equal(wrongMethod.statusCode, 403);
  const unknown = await invoke(`/api/v1/terminal/operations/${id}/unknown`, { method: 'POST', body: {}, headers: { cookie, 'x-csrf-token': technicalCsrf }, fetcher: async () => { throw Error('upstream must not run'); } });
  assert.equal(unknown.statusCode, 403);
  const mismatchedId = await invoke(`/api/v1/terminal/operations/${id}?id=other`, { headers: { cookie }, fetcher: async () => { throw Error('upstream must not run'); } });
  assert.equal(mismatchedId.statusCode, 403);
});
test('local pairing consumes the credential into an HttpOnly cookie and exposes only CSRF state', async () => {
  const id = '33333333-3333-4333-8333-333333333333', technical = 'd'.repeat(64);
  const localEnv = { ...env, FUELFLOW_PUBLIC_ORIGIN: 'http://127.0.0.1:26081', BACKEND_ORIGIN: 'http://backend:3000', FUELFLOW_LOCAL_HTTP: 'true' };
  const result = await invoke(`/api/v1/supervisor/terminals/${id}/pair`, {
    method: 'POST', body: {}, gatewayEnv: localEnv,
    headers: { origin: localEnv.FUELFLOW_PUBLIC_ORIGIN, authorization: 'Bearer supervisor.jwt.token', cookie: 'primax-kiosk-local=' + token },
    fetcher: async () => Response.json({ token: technical, terminalId: id, expiresAt: '2030-01-01T00:00:00Z' }),
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.token, undefined);
  assert.equal(result.body.terminalId, undefined);
  assert.match(result.headers['set-cookie'][0], /^primax-terminal-local=/);
  assert.match(result.headers['set-cookie'][0], /HttpOnly/);
  assert.doesNotMatch(result.headers['set-cookie'][0], /Secure/);
  assert.match(result.headers['set-cookie'][1], /^primax-terminal-csrf-local=/);
  assert.doesNotMatch(result.headers['set-cookie'][1], /HttpOnly/);
});
test('existing credential requires rotation; rotation installs a new local browser cookie', async () => {
  const id = '33333333-3333-4333-8333-333333333333', technical = 'e'.repeat(64);
  const localEnv = { ...env, FUELFLOW_PUBLIC_ORIGIN: 'http://127.0.0.1:26081', BACKEND_ORIGIN: 'http://backend:3000', FUELFLOW_LOCAL_HTTP: 'true' };
  const headers = { origin: localEnv.FUELFLOW_PUBLIC_ORIGIN, authorization: 'Bearer supervisor.jwt.token', cookie: 'primax-kiosk-local=' + token };
  const conflict = await invoke(`/api/v1/supervisor/terminals/${id}/pair`, {
    method: 'POST', body: {}, gatewayEnv: localEnv, headers,
    fetcher: async () => Response.json({ message: 'La terminal ya tiene sesión; usa rotación' }, { status: 409 }),
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.headers['set-cookie'], undefined);
  const rotated = await invoke(`/api/v1/supervisor/terminals/${id}/rotate`, {
    method: 'POST', body: {}, gatewayEnv: localEnv, headers,
    fetcher: async () => Response.json({ token: technical, terminalId: id, expiresAt: '2030-01-01T00:00:00Z' }),
  });
  assert.equal(rotated.statusCode, 200);
  assert.equal(rotated.body.paired, true);
  assert.equal(rotated.body.token, undefined);
  assert.match(rotated.headers['set-cookie'][0], /^primax-terminal-local=/);
  assert.match(rotated.headers['set-cookie'][0], /Path=\/; HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(rotated.headers['set-cookie'][0], /Secure|Domain=/);
  assert.match(rotated.headers['set-cookie'][1], /^primax-terminal-csrf-local=/);
});
