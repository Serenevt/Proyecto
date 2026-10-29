import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { createVercelGateway } from '../api/gateway.js';
import { kioskRoute } from '../server/policy.js';

const id = '33333333-3333-4333-8333-333333333333';
const routes = [
  ['GET', 'fuels'], ['GET', 'stations'], ['GET', 'fuels/inventory'],
  ['GET', 'vehicles/ABC-123'], ['POST', 'admin/check-plate'], ['POST', 'plate-recognition'],
  ['POST', 'authorizations'], ['GET', `authorizations/${id}`],
  ...['progress', 'release', 'intervention'].map(action => ['POST', `authorizations/${id}/${action}`]),
  ['POST', 'online-orders'], ['GET', `online-orders/${id}`],
  ...['demo-confirm', 'cancel', 'reselect'].map(action => ['POST', `online-orders/${id}/${action}`]),
  ['POST', 'transactions'], ['GET', `transactions/${id}`],
  ['GET', 'terminal/me'], ['POST', 'terminal/operations'],
  ['GET', `terminal/operations/${id}`], ['POST', `terminal/operations/${id}/close`],
  ['POST', `supervisor/terminals/${id}/pair`], ['POST', `supervisor/terminals/${id}/rotate`],
];
const env = { FUELFLOW_PUBLIC_ORIGIN: 'https://fuel.example.test', BACKEND_ORIGIN: 'https://backend.example.test', KIOSK_GATEWAY_SECRET: randomBytes(32).toString('hex') };
function request(route, method = 'GET', body, query = `route=${route}`) {
  const req = Readable.from([]);
  Object.assign(req, { method, url: `/api/v1/${route}?${query}`, body, headers: {
    origin: env.FUELFLOW_PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin', 'x-fuelflow-request': '1', 'content-type': 'application/json',
    cookie: '__Host-primax-kiosk=' + 's'.repeat(43), 'x-csrf-token': 'c'.repeat(43),
  } });
  return req;
}
function response() { return { statusCode: 200, setHeader() {}, end(value) { this.body = JSON.parse(value); } }; }

test('complete FuelFlow browser matrix is routed through one Vercel Function and the strict gateway policy', () => {
  assert.equal(routes.length, 24);
  for (const [method, route] of routes) {
    assert(route.startsWith('terminal/') || route.startsWith('supervisor/terminals/') || kioskRoute(method, '/api/v1/' + route), `${method} ${route}`);
  }
});

test('all 24 browser paths enter the gateway through Vercel rewrite metadata', async () => {
  const handler = createVercelGateway({ env, fetcher: async () => Response.json({ allowed: true, stationId: id, operationId: id }) });
  for (const [method, route] of routes) {
    const res = response();
    await handler(request(route, method, method === 'POST' ? { operationId: id } : undefined), res);
    assert.notEqual(res.body?.message, 'Ruta no permitida', `${method} ${route}`);
  }
});

test('fuels and stations reach their exact Backend path without a technical cookie and preserve JSON status', async () => {
  for (const route of ['fuels', 'stations']) {
    const calls = [];
    const handler = createVercelGateway({ env, fetcher: async (url, options) => {
      calls.push({ url, options });
      return Response.json(url.endsWith('/authorize') ? { allowed: true, stationId: id } : [{ id: 'catalog' }], { status: url.endsWith('/authorize') ? 200 : 203 });
    } });
    const res = response();
    const req = request(route);
    delete req.headers.cookie;
    delete req.headers['x-csrf-token'];
    await handler(req, res);
    assert.equal(res.statusCode, 203);
    assert.deepEqual(res.body, [{ id: 'catalog' }]);
    assert.equal(calls.at(-1).url, env.BACKEND_ORIGIN + '/api/v1/' + route);
    assert.equal(calls.at(-1).options.headers['x-terminal-session'], undefined);
    assert.equal(calls.length, 1);
  }
});

test('rewrite validates path metadata; unknown routes and methods still fail closed', async () => {
  const calls = [];
  const handler = createVercelGateway({ env, fetcher: async (url, options) => { calls.push([url, options]); return Response.json({ allowed: true, stationId: id }); } });
  for (const [route, method, query] of [
    ['fuels', 'POST', 'route=fuels'],
    ['admin/users', 'GET', 'route=admin/users'],
    ['fuels', 'GET', 'route=stations'],
    ['fuels', 'GET', 'route=fuels&unknown=1'],
    ['fuels', 'GET', 'route=fuels&route=fuels'],
  ]) {
    const res = response();
    await handler(request(route, method, method === 'POST' ? {} : undefined, query), res);
    assert.equal(res.statusCode, 403, `${method} ${route}`);
  }
  assert.equal(calls.length, 0);
});
