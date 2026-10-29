import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import gatewayHandler from '../api/[...path].js';
import supervisorHandler from '../api/supervisor-proxy.js';
import { createGateway } from '../server/gateway.js';
import { createSupervisorProxy } from '../server/supervisorProxy.js';

const publicOrigin = 'https://fuel.example.test';
const env = { FUELFLOW_PUBLIC_ORIGIN: publicOrigin, BACKEND_ORIGIN: 'https://backend.example.test', KIOSK_GATEWAY_SECRET: randomBytes(32).toString('hex') };
const id = '33333333-3333-4333-8333-333333333333';
function request(url, method = 'GET', body, headers = {}, query) {
  const req = Readable.from([]);
  Object.assign(req, { url, method, body, query, headers: { origin: publicOrigin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...headers } });
  return req;
}
function response() {
  return { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, end(value) { this.body = value; } };
}
test('Vercel entrypoints export reusable Node handlers without a listener', () => {
  assert.equal(typeof gatewayHandler, 'function');
  assert.equal(typeof supervisorHandler, 'function');
});
test('Supervisor Function maps only human routes and strips browser cookies', async () => {
  const calls = [];
  const handler = createSupervisorProxy({ env, fetcher: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ ok: true });
  } });
  const login = response();
  await handler(request('/api/supervisor-proxy?route=login', 'POST', { identifier: 'supervisor', password: 'fixture' }, { cookie: 'primax-kiosk-local=secret' }, { route: 'login' }), login);
  assert.equal(login.statusCode, 200);
  assert.equal(calls[0].url, 'https://backend.example.test/api/v1/auth/login');
  assert.equal(calls[0].options.headers.Cookie, undefined);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  const stations = response();
  await handler(request('/api/supervisor-proxy?route=supervisor/me/stations', 'GET', undefined, { authorization: 'Bearer fixture.jwt', cookie: 'primax-terminal-local=secret' }, { route: 'supervisor/me/stations' }), stations);
  assert.equal(stations.statusCode, 200);
  assert.equal(calls[1].url, 'https://backend.example.test/api/v1/supervisor/me/stations');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer fixture.jwt');
  assert.equal(calls[1].options.headers.Cookie, undefined);
  const enable = response();
  await handler(request('/api/supervisor-proxy?route=supervisor/terminals/' + id + '/enable', 'POST', { shiftId: id }, { authorization: 'Bearer fixture.jwt' }, { route: 'supervisor/terminals/' + id + '/enable' }), enable);
  assert.equal(enable.statusCode, 200);
  assert.equal(calls[2].url, 'https://backend.example.test/api/v1/supervisor/terminals/' + id + '/enable');
});
test('Supervisor rewrite permits login and shift/terminal actions despite runtime query metadata', async () => {
  const calls = [];
  const handler = createSupervisorProxy({ env, fetcher: async (url, options) => { calls.push([url, options.method]); return Response.json({ ok: true }); } });
  for (const [path, method, body, expected] of [
    ['login', 'POST', { identifier: 'supervisor@example.test', password: 'fixture' }, '/api/v1/auth/login'],
    ['supervisor/shifts', 'POST', { stationId: id }, '/api/v1/supervisor/shifts'],
    [`supervisor/terminals/${id}/enable`, 'POST', { shiftId: id }, `/api/v1/supervisor/terminals/${id}/enable`],
  ]) {
    const res = response();
    await handler(request('/api/supervisor-proxy?route=' + path, method, body, { authorization: 'Bearer fixture.jwt' }, { route: path, path: path.split('/') }), res);
    assert.equal(res.statusCode, 200, path);
    assert.equal(calls.at(-1)[0], env.BACKEND_ORIGIN + expected);
  }
  const rewritten = response();
  await handler(request('/supervisor-api/login?route=login&path=supervisor-proxy', 'POST', { identifier: 'supervisor@example.test', password: 'fixture' }, {}, { route: 'login', path: 'supervisor-proxy' }), rewritten);
  assert.equal(rewritten.statusCode, 200);
  assert.equal(calls.at(-1)[0], env.BACKEND_ORIGIN + '/api/v1/auth/login');
  for (const [path, method] of [['login', 'GET'], ['admin/users', 'GET']]) {
    const res = response();
    await handler(request('/supervisor-api/' + path, method, undefined, {}, { path }), res);
    assert.equal(res.statusCode, 403);
  }
});
test('Supervisor Function rejects sales, pairing bypass, foreign origin, query and oversized body', async () => {
  let calls = 0;
  const handler = createSupervisorProxy({ env, fetcher: async () => { calls++; return Response.json({}); } });
  for (const [route, method, body, headers, query] of [
    ['api/v1/transactions', 'POST', {}, {}, undefined],
    ['supervisor/terminals/' + id + '/pair', 'POST', {}, {}, undefined],
    ['supervisor/shifts', 'POST', {}, { origin: 'https://evil.example' }, undefined],
    ['supervisor/shifts', 'POST', { value: 'x'.repeat(300001) }, { authorization: 'Bearer fixture.jwt' }, undefined],
    ['supervisor/me/stations', 'GET', undefined, { authorization: 'Bearer fixture.jwt' }, { other: 'bad' }],
  ]) {
    const res = response();
    await handler(request('/api/supervisor-proxy?route=' + route + (query ? '&other=bad' : ''), method, body, headers, { route, ...query }), res);
    assert([403, 413].includes(res.statusCode));
  }
  assert.equal(calls, 0);
});
test('BFF Function accepts parsed JSON, preserves two technical cookies and rejects query', async () => {
  const token = 'a'.repeat(43), csrf = 'c'.repeat(43);
  const handler = createGateway({ env, fetcher: async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/v1/supervisor/terminals/' + id + '/pair');
    assert.equal(options.signal instanceof AbortSignal, true);
    assert.match(options.headers['x-kiosk-signature'], /^[a-f0-9]{64}$/);
    return Response.json({ token: 'b'.repeat(64), terminalId: id, expiresAt: '2030-01-01T00:00:00Z' });
  } });
  const res = response();
  await handler(request('/api/v1/supervisor/terminals/' + id + '/pair', 'POST', {}, { 'x-fuelflow-request': '1', cookie: '__Host-primax-kiosk=' + token, 'x-csrf-token': csrf, authorization: 'Bearer fixture.jwt' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['set-cookie'].length, 2);
  for (const cookie of res.headers['set-cookie']) { assert.match(cookie, /Secure/); assert.match(cookie, /Path=\//); assert.doesNotMatch(cookie, /Domain=/); }
  const denied = response();
  await handler(request('/api/v1/fuels?target=elsewhere', 'GET', undefined, { 'x-fuelflow-request': '1' }), denied);
  assert.equal(denied.statusCode, 403);
});
test('BFF permits only matching Vercel terminal route metadata', async () => {
  const handler = createGateway({ env });
  for (const [suffix, expected] of [[`?id=${id}`, 401], ['?id=other', 403], ['?target=elsewhere', 403]]) {
    const res = response();
    await handler(request(`/api/v1/supervisor/terminals/${id}/pair${suffix}`, 'POST', {}, { 'x-fuelflow-request': '1' }), res);
    assert.equal(res.statusCode, expected);
  }
});
