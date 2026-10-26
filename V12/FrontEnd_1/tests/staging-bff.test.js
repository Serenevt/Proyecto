import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../server/bff.mjs';
import { createTransactionsService } from '../src/js/transactionsService.js';
import { shouldReportProgress } from '../src/js/progressPolicy.js';

const origin = 'https://primax-v12-fuelflow-staging.vercel.app';
const operatorId = '11111111-1111-4111-8111-111111111111';
const outsiderId = '22222222-2222-4222-8222-222222222222';
const proxyKey = 'x'.repeat(40);
const env = {
  VERCEL_ENV: 'production', FUELFLOW_DEPLOYMENT: 'staging',
  FUELFLOW_PUBLIC_ORIGIN: origin,
  FUELFLOW_API_UPSTREAM: 'https://primax-v12-api-staging.vercel.app/api/v1',
  STAGING_FUELFLOW_PROXY_KEY: proxyKey,
  STAGING_FUELFLOW_OPERATOR_IDS: operatorId,
};
const cookie = '__Host-fuelflow-session=valid.jwt.token';
function request(path, { method = 'GET', body, headers = {}, withCookie = true } = {}) {
  return new Request(origin + path, { method, headers: {
    'x-fuelflow-request': '1',
    ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
    ...(withCookie ? { Cookie: cookie } : {}), ...headers,
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
function api({ id = operatorId, status = 200, calls = [] } = {}) {
  return async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, options });
    if (path.endsWith('/memberships/me')) return Response.json({ userId: id }, { status });
    if (path.endsWith('/auth/login')) return Response.json({ accessToken: 'valid.jwt.token', user: { id } });
    return Response.json({ ok: true, operationId: 'same-id' });
  };
}

test('authorized operator login sets only a secure HttpOnly session cookie', async () => {
  const calls = [];
  const response = await handleRequest(request('/api/session/login', {
    method: 'POST', withCookie: false,
    body: { identifier: 'operator@example.test', password: 'fixture-password' },
    headers: { 'x-forwarded-for': 'test-login-1' },
  }), { env, fetcher: api({ calls }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  const payload = await response.json();
  assert.equal(payload.authenticated, true);
  assert.match(payload.sessionTag, /^[0-9a-f]{20}$/);
  assert(!JSON.stringify(payload).includes(operatorId));
  assert(!JSON.stringify(payload).includes(proxyKey));
  assert(!calls[0].options.headers['x-fuelflow-proxy-key']);
});

test('normal member, absent and revoked sessions fail before terminal proxy', async () => {
  const login = await handleRequest(request('/api/session/login', {
    method: 'POST', withCookie: false,
    body: { identifier: 'member@example.test', password: 'fixture-password' },
    headers: { 'x-forwarded-for': 'test-login-2' },
  }), { env, fetcher: api({ id: outsiderId }) });
  assert.equal(login.status, 403);
  assert.equal(login.headers.get('set-cookie'), null);
  const missing = await handleRequest(request('/api/v1/authorizations', {
    method: 'POST', withCookie: false, body: { mode: 'POSTPAGO' },
  }), { env, fetcher: api() });
  assert.equal(missing.status, 401);
  for (const status of [401, 403]) {
    const revoked = await handleRequest(request('/api/session'), {
      env, fetcher: api({ status }),
    });
    assert.equal(revoked.status, 401);
    assert.match(revoked.headers.get('set-cookie'), /Max-Age=0/);
  }
});

test('proxy forwards only allowlisted route and server credentials', async () => {
  const calls = [];
  const response = await handleRequest(request('/api/v1/authorizations', {
    method: 'POST', body: { mode: 'POSTPAGO', allowDebt: false, operationId: 'same-id' },
    headers: { Authorization: 'Bearer attacker', 'x-kiosk-key': 'attacker',
      'x-fuelflow-proxy-key': 'attacker', 'x-extra': 'attacker' },
  }), { env, fetcher: api({ calls }) });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer valid.jwt.token');
  assert.equal(calls[1].options.headers['x-fuelflow-proxy-key'], proxyKey);
  assert.equal(calls[1].options.headers['x-kiosk-key'], undefined);
  assert.equal(calls[1].options.headers['x-extra'], undefined);
  assert.equal(calls[1].path, '/api/v1/authorizations');
  assert(!JSON.stringify(await response.json()).includes(proxyKey));
});

test('Vercel internal rewrites retain a validated route and reject malformed targets', async () => {
  const calls = [];
  const valid = await handleRequest(request('/api/index?route=v1/fuels'), {
    env, fetcher: api({ calls }),
  });
  assert.equal(valid.status, 200);
  assert.equal(calls[1].path, '/api/v1/fuels');
  for (const path of ['/api/index?route=v1/fuels&path=fuels',
    '/api/index?route=v1/:path*&path=fuels']) {
    const response = await handleRequest(request(path), { env, fetcher: api() });
    assert.equal(response.status, 200, path);
  }
  const login = await handleRequest(request('/api/index?route=session/:path*&path=login', {
    method: 'POST', withCookie: false,
    body: { identifier: 'operator@example.test', password: 'fixture-password' },
    headers: { 'x-forwarded-for': 'test-rewrite-login' },
  }), { env, fetcher: api() });
  assert.equal(login.status, 200);
  for (const path of ['/api/index?route=v1/../admin',
    '/api/index?route=v1/fuels&next=evil', '/api/index?route=v1/fuels&path=admin',
    '/api/index?route=v1/fuels&path=fuels&path=admin',
    '/api/index?route=v1/plate-recognition']) {
    const denied = await handleRequest(request(path), { env, fetcher: api() });
    assert.equal(denied.status, 404);
  }
});

test('the BFF preserves the four DEMO payment methods and saldo Prime requests', async () => {
  for (const method of ['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN']) {
    const calls = [];
    const result = await handleRequest(request('/api/v1/transactions', {
      method: 'POST', body: { mode: 'PREPAGO', paymentMethod: method,
        operationId: '33333333-3333-4333-8333-333333333333' },
    }), { env, fetcher: api({ calls }) });
    assert.equal(result.status, 200, method);
    assert.equal(JSON.parse(calls[1].options.body).paymentMethod, method);
  }
  const balance = await handleRequest(request('/api/v1/authorizations', {
    method: 'POST', body: { mode: 'POSTPAGO', paymentMethod: 'SALDO_PRIME', allowDebt: false },
  }), { env, fetcher: api() });
  assert.equal(balance.status, 200);
  for (const method of ['YAPE', 'PLIN']) {
    const order = await handleRequest(request('/api/v1/online-orders', {
      method: 'POST', body: { method, authorization: {
        mode: 'PREPAGO', paymentMethod: method, allowDebt: false,
      } },
    }), { env, fetcher: api() });
    assert.equal(order.status, 200);
  }
});

test('login attempts are limited locally without relying on Vercel WAF', async () => {
  const options = { env, fetcher: api(), now: () => 1000 };
  for (let n = 0; n < 6; n++) {
    const response = await handleRequest(request('/api/session/login', {
      method: 'POST', withCookie: false,
      body: { identifier: 'operator@example.test', password: 'fixture-password' },
      headers: { 'x-forwarded-for': 'unique-throttle-test' },
    }), options);
    assert.equal(response.status, n < 5 ? 200 : 429);
  }
});

test('denies unauthorized routes, traversal, foreign origin and CSRF', async () => {
  const calls = [];
  for (const path of ['/api/v1/admin/alerts', '/api/v1/plate-recognition',
    '/api/v1/online-orders/11111111-1111-4111-8111-111111111111/refund',
    '/api/v1/%2e%2e/health', '/api/v1/transactions/../../health']) {
    const response = await handleRequest(request(path), { env, fetcher: api({ calls }) });
    assert.equal(response.status, 404, path);
  }
  assert.equal(calls.length, 5); // only the harmless operator-session checks
  for (const headers of [{ Origin: 'https://evil.example' },
    { 'sec-fetch-site': 'cross-site' }, { 'x-fuelflow-request': '' }]) {
    const response = await handleRequest(request('/api/v1/transactions', {
      method: 'POST', body: { mode: 'PREPAGO' }, headers,
    }), { env, fetcher: api({ calls }) });
    assert.equal(response.status, 403);
  }
  assert.equal(calls.length, 5);
});

test('rejects both direct and nested debt manipulation before upstream mutation', async () => {
  const cases = [
    ['/api/v1/authorizations', { mode: 'POSTPAGO', allowDebt: true }],
    ['/api/v1/online-orders', { transactionId: outsiderId }],
    ['/api/v1/online-orders', { authorization: { allowDebt: true } }],
  ];
  for (const [path, body] of cases) {
    const calls = [];
    const response = await handleRequest(request(path, { method: 'POST', body }), {
      env, fetcher: api({ calls }),
    });
    assert.equal(response.status, 403);
    assert.equal(calls.length, 1);
  }
});

test('reports backend errors and timeouts without leaking upstream content', async () => {
  const unavailable = await handleRequest(request('/api/v1/fuels'), { env,
    fetcher: async (url) => new URL(url).pathname.endsWith('/memberships/me')
      ? Response.json({ userId: operatorId })
      : Response.json({ message: proxyKey }, { status: 500 }),
  });
  assert.equal(unavailable.status, 502);
  assert(!JSON.stringify(await unavailable.json()).includes(proxyKey));
  const timeout = await handleRequest(request('/api/session'), { env,
    fetcher: async () => { throw new DOMException('timeout', 'TimeoutError'); },
  });
  assert.equal(timeout.status, 504);
});

test('server configuration fails closed without a valid proxy key or operator list', async () => {
  for (const patch of [{ STAGING_FUELFLOW_PROXY_KEY: 'wrong' },
    { STAGING_FUELFLOW_OPERATOR_IDS: '' }, { VERCEL_ENV: 'preview' }]) {
    const response = await handleRequest(request('/api/session'), { env: { ...env, ...patch }, fetcher: api() });
    assert.equal(response.status, 503);
  }
});

test('session scopes recovery, preserves operationId and prevents duplicate submissions', async () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  let key = 'fuelflow:staging:operation:v1:aaaaaaaaaaaaaaaaaaaa';
  let submissions = 0;
  const service = createTransactionsService({ storage, storageKey: () => key,
    request: async () => { submissions++; return { transaction: { id: 'tx-1' } }; },
    uuid: () => 'stable-operation-id',
  });
  service.prepare({ amount: '20.00' });
  const [a, b] = await Promise.all([service.submit(), service.submit()]);
  assert.deepEqual(a, b);
  assert.equal(submissions, 1);
  assert.equal(service.current().operationId, 'stable-operation-id');
  key = 'fuelflow:staging:operation:v1:bbbbbbbbbbbbbbbbbbbb';
  assert.equal(service.current(), null);
  key = 'fuelflow:staging:operation:v1:aaaaaaaaaaaaaaaaaaaa';
  assert.equal(service.current().operationId, 'stable-operation-id');
});

test('staging throttles progress and always sends the final sample', () => {
  assert(shouldReportProgress({ amount: 2, previousAmount: 0, lastAt: 0, now: 100,
    staging: false }));
  assert(!shouldReportProgress({ amount: 2, previousAmount: 0, lastAt: 100, now: 500,
    staging: true }));
  assert(shouldReportProgress({ amount: 3, previousAmount: 0, lastAt: 100, now: 2100,
    staging: true }));
  assert(shouldReportProgress({ amount: 3, previousAmount: 3, lastAt: 2100, now: 2101,
    staging: true, force: true }));
});

test('supervisor pairing sets a technical HttpOnly cookie without exposing its token', async () => {
  const technical = 'a'.repeat(64);
  const id = '33333333-3333-4333-8333-333333333333';
  const calls = [];
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, options });
    if (path.endsWith('/auth/login')) return Response.json({ accessToken: 'supervisor.jwt', user: { id: operatorId } });
    if (path.endsWith('/supervisor/me/stations')) return Response.json([{ stationId: id }]);
    if (path.endsWith('/pair')) return Response.json({terminalId:id,expiresAt:'future'}, {headers:{
      'Set-Cookie':`__Host-fuelflow-terminal=${technical}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`,
    }});
    return Response.json({ok:true});
  };
  const login=await handleRequest(request('/api/session/supervisor-login',{method:'POST',withCookie:false,
    body:{identifier:'supervisor@example.test',password:'test'},headers:{'x-forwarded-for':'test-supervisor-login'}}),{env,fetcher});
  assert.equal(login.status,200);
  assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  const paired=await handleRequest(request(`/api/v1/supervisor/terminals/${id}/pair`,{method:'POST',
    headers:{Cookie:'__Host-fuelflow-supervisor=supervisor.jwt','Content-Type':''}}),{env,fetcher});
  assert.equal(paired.status,200);
  assert.match(paired.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  assert(!JSON.stringify(await paired.json()).includes(technical));
  assert.equal(calls.at(-1).options.headers.Authorization,'Bearer supervisor.jwt');
  assert.equal(calls.at(-1).options.headers['x-terminal-session'],undefined);
});

test('terminal requests use only the technical cookie after human session is gone',async()=>{
  const technical='b'.repeat(64);
  const calls=[];
  const fetcher=async(url,options)=>{calls.push({path:new URL(url).pathname,options});return Response.json({id:'terminal'});};
  const response=await handleRequest(request('/api/v1/terminal/me',{withCookie:false,
    headers:{Cookie:`__Host-fuelflow-terminal=${technical}`}}),{env,fetcher});
  assert.equal(response.status,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.headers['x-terminal-session'],technical);
  assert.equal(calls[0].options.headers.Authorization,undefined);
  assert.equal(calls[0].options.headers['x-fuelflow-proxy-key'],proxyKey);
  assert(!JSON.stringify(await response.json()).includes(technical));
});
