// Local Compose financial path. Uses synthetic demo data and ignored .env only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^'|'$/g, '')]; }));
const publicOrigin = 'http://127.0.0.1:26081';
const backend = 'http://127.0.0.1:26000';
const jar = new Map();
const browser = { 'X-FuelFlow-Request': '1', 'Sec-Fetch-Site': 'same-origin' };
let kioskCsrf = '';
function remember(response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';'); const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}
function cookies() { return [...jar].map(([name, value]) => `${name}=${value}`).join('; '); }
async function call(base, path, method = 'GET', body, headers = {}) {
  const response = await fetch(base + '/api/v1/' + path, {
    method,
    headers: { ...(base === publicOrigin ? { ...browser, Cookie: cookies(), 'X-CSRF-Token': path.startsWith('terminal/') ? jar.get('primax-terminal-csrf-local') || '' : kioskCsrf } : {}),
      ...headers, ...(method === 'POST' ? { Origin: publicOrigin, 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  remember(response);
  const raw = await response.text();
  return { status: response.status, body: raw ? JSON.parse(raw) : null };
}
function ok(result, status, label) { assert.equal(result.status, status, `${label}: ${JSON.stringify(result.body)}`); return result.body; }
const pre = await fetch(publicOrigin + '/api/kiosk/session', { headers: browser });
remember(pre); const preSession = await pre.json(); assert.equal(pre.status, 200);
const login = await fetch(publicOrigin + '/api/kiosk/session/login', {
  method: 'POST', headers: { ...browser, Origin: publicOrigin, Cookie: cookies(), 'Content-Type': 'application/json', 'X-CSRF-Token': preSession.csrfToken },
  body: JSON.stringify({ username: env.KIOSK_OPERATOR_USER, password: env.DEMO_SUPERVISOR_PASSWORD }),
});
remember(login); const kiosk = await login.json(); assert.equal(login.status, 201); kioskCsrf = kiosk.csrfToken;
const supervisor = ok(await call(backend, 'auth/login', 'POST', { identifier: env.DEMO_SUPERVISOR_EMAIL, password: env.DEMO_SUPERVISOR_PASSWORD }), 200, 'supervisor login');
const bearer = { Authorization: `Bearer ${supervisor.accessToken}` };
const stations = ok(await call(backend, 'supervisor/me/stations', 'GET', undefined, bearer), 200, 'stations');
const stationId = stations.find(row => row.station.code === 'PRIMAX-SUR')?.stationId; assert.ok(stationId);
const terminals = ok(await call(backend, `supervisor/stations/${stationId}/terminals`, 'GET', undefined, bearer), 200, 'terminals');
const terminalId = terminals.find(row => row.code === 'PRIMAX-SUR-T01')?.id; assert.ok(terminalId);
const fuels = ok(await call(publicOrigin, 'fuels'), 200, 'fuels');
const fuel = fuels.find(row => row.name === 'Regular'); assert.ok(fuel);
const unitPrice = Number(fuel.pricePerGallon).toFixed(2), amount = unitPrice;
const negativeId = randomUUID();
const baseAuth = operationId => ({ operationId, stationId, fuelId: fuel.id, plate: 'ABC-123', membershipCode: 'PRIME-0001', amount, unitPrice, receiptType: 'BOLETA' });
assert.equal((await call(publicOrigin, 'authorizations', 'POST', { ...baseAuth(negativeId), mode: 'POSTPAGO', paymentMethod: 'SALDO_PRIME', allowDebt: true })).status, 401);
assert.equal((await call(publicOrigin, 'online-orders', 'POST', { operationId: negativeId, method: 'YAPE', authorization: { ...baseAuth(negativeId), mode: 'PREPAGO', paymentMethod: 'YAPE' } })).status, 401);
assert.equal((await call(publicOrigin, 'transactions', 'POST', { ...baseAuth(negativeId), mode: 'POSTPAGO', gallons: '1.000' })).status, 401);
assert.equal((await call(backend, 'authorizations', 'POST', { ...baseAuth(negativeId), mode: 'POSTPAGO' }, { 'x-kiosk-key': env.KIOSK_API_KEY })).status, 403);
assert.equal((await call(backend, 'online-orders', 'POST', { operationId: negativeId, method: 'YAPE', authorization: { ...baseAuth(negativeId), mode: 'PREPAGO' } }, { 'x-kiosk-key': env.KIOSK_API_KEY })).status, 403);
assert.equal((await call(backend, 'transactions', 'POST', { ...baseAuth(negativeId), mode: 'POSTPAGO', gallons: '1.000' }, { 'x-kiosk-key': env.KIOSK_API_KEY })).status, 403);
const shift = ok(await call(backend, 'supervisor/shifts', 'POST', { stationId }, bearer), 201, 'open shift');
ok(await call(backend, `supervisor/terminals/${terminalId}/enable`, 'POST', { shiftId: shift.id }, bearer), 201, 'enable');
ok(await call(publicOrigin, `supervisor/terminals/${terminalId}/pair`, 'POST', {}, bearer), 201, 'pair');
const unboundId = randomUUID();
assert.equal((await call(publicOrigin, 'authorizations', 'POST', { ...baseAuth(unboundId), mode: 'POSTPAGO', paymentMethod: 'SALDO_PRIME', allowDebt: true })).status, 403);
assert.equal((await call(publicOrigin, 'online-orders', 'POST', { operationId: unboundId, method: 'YAPE', authorization: { ...baseAuth(unboundId), mode: 'PREPAGO', paymentMethod: 'YAPE' } })).status, 403);
async function start() {
  const operationId = randomUUID();
  ok(await call(publicOrigin, 'terminal/operations', 'POST', { operationId }), 201, 'terminal start');
  assert.equal(ok(await call(publicOrigin, `terminal/operations/${operationId}`), 200, 'terminal recover').operationId, operationId);
  return operationId;
}
const postId = await start();
const postBody = { ...baseAuth(postId), mode: 'POSTPAGO', paymentMethod: 'SALDO_PRIME', allowDebt: true };
assert.equal((await call(publicOrigin, 'authorizations', 'POST', { ...postBody, stationId: randomUUID() })).status, 403);
const postAuth = ok(await call(publicOrigin, 'authorizations', 'POST', postBody), 201, 'postpaid authorization').authorization;
assert.equal(ok(await call(publicOrigin, 'authorizations', 'POST', postBody), 201, 'postpaid retry').replayed, true);
ok(await call(publicOrigin, `authorizations/${postAuth.id}/progress`, 'POST', { amount, gallons: '1.000' }), 200, 'postpaid progress');
const { allowDebt: _postDebt, ...postSale } = postBody;
const postTransaction = { ...postSale, gallons: '1.000', authorizationId: postAuth.id, outcome: 'AUTO' };
const postTx = ok(await call(publicOrigin, 'transactions', 'POST', postTransaction), 201, 'postpaid transaction').transaction;
assert.equal(ok(await call(publicOrigin, 'transactions', 'POST', postTransaction), 201, 'postpaid transaction retry').replayed, true);
ok(await call(publicOrigin, `terminal/operations/${postId}/close`, 'POST'), 201, 'postpaid close');
const prepaidId = await start();
const prepaidAuth = { ...baseAuth(prepaidId), mode: 'PREPAGO', paymentMethod: 'YAPE', allowDebt: false };
const orderBody = { operationId: prepaidId, method: 'YAPE', authorization: prepaidAuth };
const order = ok(await call(publicOrigin, 'online-orders', 'POST', orderBody), 201, 'prepaid order');
assert.equal(ok(await call(publicOrigin, 'online-orders', 'POST', orderBody), 201, 'prepaid retry').id, order.id);
const confirmed = ok(await call(publicOrigin, `online-orders/${order.id}/demo-confirm`, 'POST', { amount: Number(order.amount).toFixed(2), currency: 'PEN' }), 201, 'demo confirm');
assert.equal(confirmed.status, 'CAPTURED');
const preAuth = ok(await call(publicOrigin, 'authorizations', 'POST', prepaidAuth), 201, 'prepaid authorization').authorization;
ok(await call(backend, `supervisor/shifts/${shift.id}/close`, 'POST', {}, bearer), 201, 'close shift with active sale');
assert.equal((await call(publicOrigin, 'terminal/operations', 'POST', { operationId: randomUUID() })).status, 409);
ok(await call(publicOrigin, `authorizations/${preAuth.id}/progress`, 'POST', { amount, gallons: '1.000' }), 200, 'prepaid progress');
const { allowDebt: _preDebt, ...preSale } = prepaidAuth;
const prepaidTx = { ...preSale, gallons: '1.000', authorizationId: preAuth.id, outcome: 'AUTO' };
const preTx = ok(await call(publicOrigin, 'transactions', 'POST', prepaidTx), 201, 'prepaid transaction').transaction;
ok(await call(publicOrigin, `terminal/operations/${prepaidId}/close`, 'POST'), 201, 'prepaid close');
ok(await call(publicOrigin, `supervisor/terminals/${terminalId}/revoke-session`, 'POST', {}, bearer), 201, 'revoke');
console.log(JSON.stringify({ postId, prepaidId, negativeId, unboundId, postAuthorizationId: postAuth.id, prepaidAuthorizationId: preAuth.id, postTransactionId: postTx.id, prepaidTransactionId: preTx.id, result: 'passed' }));
