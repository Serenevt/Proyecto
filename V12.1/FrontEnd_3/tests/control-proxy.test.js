import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import functionHandler from '../api/v1/[...path].js';
import { createControlProxy, createControlAdapter } from '../server/controlProxy.js';

const env = { PRIMAX_CONTROL_PUBLIC_URL: 'https://control.example.test', BACKEND_ORIGIN: 'https://backend.example.test' };
function request(url, method = 'GET', body, headers = {}) {
  const req = Readable.from([]);
  Object.assign(req, { url, method, body, headers: { origin: env.PRIMAX_CONTROL_PUBLIC_URL, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...headers } });
  return req;
}
function response() {
  return { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, end(value) { this.body = value; } };
}
test('Control Function exports a handler and keeps API under the browser origin', () => {
  assert.equal(typeof functionHandler, 'function');
});
test('Control proxy forwards only its auth cookie and preserves Secure Set-Cookie', async () => {
  const calls = [];
  const handler = createControlProxy({ env, fetcher: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ user: { name: 'Control' } }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'primax_control=fixture.jwt; Path=/api/v1/control; HttpOnly; Secure; SameSite=Strict' } });
  } });
  const login = response();
  await handler(request('/api/v1/control/login', 'POST', { email: 'admin@example.test', password: 'fixture' }, { cookie: 'other=discard' }), login);
  assert.equal(login.statusCode, 200);
  assert.equal(calls[0].url, 'https://backend.example.test/api/v1/control/login');
  assert.equal(calls[0].options.headers.Cookie, undefined);
  assert.match(login.headers['set-cookie'][0], /HttpOnly; Secure; SameSite=Strict/);
  const dashboard = response();
  await handler(request('/api/v1/control/dashboard?stationId=all', 'GET', undefined, { cookie: 'other=discard; primax_control=fixture.jwt' }), dashboard);
  assert.equal(dashboard.statusCode, 200);
  assert.equal(calls[1].url, 'https://backend.example.test/api/v1/control/dashboard?stationId=all');
  assert.equal(calls[1].options.headers.Cookie, 'primax_control=fixture.jwt');
  const logout = response();
  await handler(request('/api/v1/control/logout', 'POST', undefined, { cookie: 'primax_control=fixture.jwt' }), logout);
  assert.equal(logout.statusCode, 200);
  assert.equal(calls[2].options.body, undefined);
});
test('Control proxy rejects other API namespaces, foreign origins and duplicate cookies', async () => {
  let calls = 0;
  const handler = createControlProxy({ env, fetcher: async () => { calls++; return Response.json({}); } });
  for (const [url, method, headers] of [
    ['/api/v1/transactions', 'GET', {}],
    ['/api/v1/control/login', 'POST', { origin: 'https://evil.example' }],
    ['/api/v1/control/session', 'GET', { cookie: 'primax_control=a; primax_control=b' }],
    ['/api/v1/control/session', 'GET', { 'sec-fetch-site': 'cross-site' }],
  ]) {
    const res = response();
    await handler(request(url, method, method === 'POST' ? {} : undefined, headers), res);
    assert([400, 403].includes(res.statusCode));
  }
  assert.equal(calls, 0);
});
test('Control proxy rejects an insecure upstream auth cookie before exposing it to HTTPS browser', async () => {
  const handler = createControlProxy({ env, fetcher: async () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'primax_control=fixture.jwt; Path=/api/v1/control; HttpOnly; SameSite=Strict' } }) });
  const res = response();
  await handler(request('/api/v1/control/login', 'POST', { email: 'admin@example.test', password: 'fixture' }), res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.headers['set-cookie'], undefined);
});

test('Control proxy strips Vercel routing metadata and preserves functional filters across sections', async () => {
  const calls = [];
  const handler = createControlProxy({ env, fetcher: async (url) => {
    calls.push(url);
    return Response.json({});
  } });
  const cases = [
    ['/operations?path=operations&route=control&stationId=s1&status=open&mode=manual', '/operations?stationId=s1&status=open&mode=manual'],
    ['/clients?path=clients&q=ana&status=active', '/clients?q=ana&status=active'],
    ['/memberships?route=memberships&actorUserId=u1&kind=staff', '/memberships?actorUserId=u1&kind=staff'],
    ['/vehicles?path=vehicles&stationId=s1&status=active', '/vehicles?stationId=s1&status=active'],
    ['/transactions?route=transactions&from=2026-01-01&to=2026-01-31&fuelId=f1', '/transactions?from=2026-01-01&to=2026-01-31&fuelId=f1'],
    ['/terminals?path=terminals&stationId=s1&status=online', '/terminals?stationId=s1&status=online'],
    ['/inventory?route=inventory&stationId=s1&fuelId=f1', '/inventory?stationId=s1&fuelId=f1'],
    ['/movements?path=movements&stationId=s1&kind=adjustment', '/movements?stationId=s1&kind=adjustment'],
    ['/incidents?route=incidents&status=open&stationId=s1', '/incidents?status=open&stationId=s1'],
    ['/audit?path=audit&actorUserId=u1&action=login&method=GET', '/audit?actorUserId=u1&action=login&method=GET'],
  ];
  for (const [input, expected] of cases) {
    const res = response();
    await handler(request(`/api/v1/control${input}&path=again`, 'GET'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.at(-1), `https://backend.example.test/api/v1/control${expected}`);
  }
});

test('Vercel adapter removes catch-all metadata from req.url and req.query', async () => {
  const calls = [];
  const handler = createControlAdapter({ env, fetcher: async (url) => { calls.push(url); return Response.json({}); } });
  for (const [path, query, expected] of [
    ['/customers?%2E%2E%2Epath=customers', { '...path': ['customers'] }, '/customers'],
    ['/operations?%2E%2E%2Epath=operations&status=CLOSED&mode=PREPAGO', { path: ['control', 'operations'], status: 'CLOSED', mode: 'PREPAGO' }, '/operations?status=CLOSED&mode=PREPAGO'],
    ['/inventory/movements?%2E%2E%2Epath=inventory%2Fmovements&kind=adjustment', { '...path': ['inventory', 'movements'], kind: 'adjustment' }, '/inventory/movements?kind=adjustment'],
  ]) {
    const req = request(`/api/v1/control${path}`);
    req.query = query;
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.at(-1), `https://backend.example.test/api/v1/control${expected}`);
    assert.deepEqual(Object.keys(req.query), Object.keys(query).filter(key => !/^(?:\.\.\.)?(?:path|route)$/i.test(key)));
  }
});
