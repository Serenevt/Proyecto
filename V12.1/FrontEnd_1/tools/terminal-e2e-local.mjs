// Local Compose proof. Uses only loopback HTTP and the ignored V12.1/.env.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const env = Object.fromEntries(readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^'|'$/g, '')]; }));
const publicOrigin = 'http://127.0.0.1:26081';
const backend = 'http://127.0.0.1:26000';
const browser = { 'X-FuelFlow-Request': '1', 'Sec-Fetch-Site': 'same-origin' };
const jar = new Map();
function remember(response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';'); const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}
function cookies() { return [...jar].map(([name, value]) => `${name}=${value}`).join('; '); }
function localSql(statement) {
  return execFileSync('docker', ['exec', '-i', 'primax-v12-1-postgres-1', 'sh', '-c',
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qAt'],
  { input: statement, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
}
async function call(base, path, method = 'GET', body, headers = {}) {
  const response = await fetch(base + '/api/v1/' + path, {
    method, headers: { ...(base === publicOrigin ? browser : {}), ...headers,
      ...(base === publicOrigin ? { Cookie: cookies() } : {}),
      ...(method === 'POST' ? { Origin: publicOrigin, 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  remember(response);
  const raw = await response.text();
  return { status: response.status, body: raw ? JSON.parse(raw) : null };
}
function expectStatus(result, status, label) {
  assert.equal(result.status, status, `${label}: ${JSON.stringify(result.body)}`);
  return result.body;
}
const pre = await fetch(publicOrigin + '/api/kiosk/session', { headers: browser });
remember(pre); const preSession = await pre.json();
assert.equal(pre.status, 200);
const login = await fetch(publicOrigin + '/api/kiosk/session/login', {
  method: 'POST', headers: { ...browser, Origin: publicOrigin, Cookie: cookies(),
    'Content-Type': 'application/json', 'X-CSRF-Token': preSession.csrfToken },
  body: JSON.stringify({ username: env.KIOSK_OPERATOR_USER, password: env.DEMO_SUPERVISOR_PASSWORD }),
});
remember(login); const kiosk = await login.json();
assert.equal(login.status, 201); assert.equal(kiosk.authenticated, true);
const supervisor = expectStatus(await call(backend, 'auth/login', 'POST',
  { identifier: env.DEMO_SUPERVISOR_EMAIL, password: env.DEMO_SUPERVISOR_PASSWORD }), 200, 'supervisor login');
const bearer = { Authorization: `Bearer ${supervisor.accessToken}` };
const stations = expectStatus(await call(backend, 'supervisor/me/stations', 'GET', undefined, bearer), 200, 'stations');
const stationId = stations.find(row => row.station.code === 'PRIMAX-SUR')?.stationId;
assert.ok(stationId);
const terminals = expectStatus(await call(backend, `supervisor/stations/${stationId}/terminals`, 'GET', undefined, bearer), 200, 'terminals');
const terminalId = terminals.find(row => row.code === 'PRIMAX-SUR-T01')?.id;
assert.ok(terminalId);
const kioskCsrf = { 'X-CSRF-Token': kiosk.csrfToken };
const previousShift = expectStatus(await call(backend, 'supervisor/shifts/current', 'GET', undefined, bearer), 200, 'current shift');
if (previousShift) {
  assert.equal(terminals.find(row => row.id === terminalId)?.operations?.length ?? 0, 0, 'existing active operation requires manual review');
  expectStatus(await call(publicOrigin, `supervisor/terminals/${terminalId}/revoke-session`, 'POST', {}, { ...kioskCsrf, ...bearer }), 201, 'cleanup credential');
  expectStatus(await call(backend, `supervisor/shifts/${previousShift.id}/close`, 'POST', {}, bearer), 201, 'cleanup shift');
}
assert.equal((await call(publicOrigin, 'terminal/me')).status, 401);
assert.equal((await call(publicOrigin, `supervisor/terminals/${terminalId}/pair`, 'POST', {}, { ...kioskCsrf, ...bearer })).status, 409);
const shift = expectStatus(await call(backend, 'supervisor/shifts', 'POST', { stationId }, bearer), 201, 'open shift');
assert.equal((await call(publicOrigin, `supervisor/terminals/${terminalId}/pair`, 'POST', {}, { ...kioskCsrf, ...bearer })).status, 409);
expectStatus(await call(backend, `supervisor/terminals/${terminalId}/enable`, 'POST', { shiftId: shift.id }, bearer), 201, 'enable');
const paired = expectStatus(await call(publicOrigin, `supervisor/terminals/${terminalId}/pair`, 'POST', {}, { ...kioskCsrf, ...bearer }), 201, 'pair');
assert.equal(paired.paired, true); assert.equal(paired.token, undefined);
const oldTechnical = jar.get('primax-terminal-local');
assert.match(oldTechnical, /^[a-f0-9]{64}$/);
const technicalCsrf = () => ({ 'X-CSRF-Token': jar.get('primax-terminal-csrf-local') });
const me = expectStatus(await call(publicOrigin, 'terminal/me'), 200, 'terminal status');
assert.equal(me.canStart, true); assert.equal(me.id, undefined);
const operationId = randomUUID();
const opened = expectStatus(await call(publicOrigin, 'terminal/operations', 'POST', { operationId }, technicalCsrf()), 201, 'start');
assert.equal(opened.operationId, operationId);
assert.equal((await call(publicOrigin, 'terminal/operations', 'POST', { operationId: randomUUID() }, technicalCsrf())).status, 409);
assert.equal(expectStatus(await call(publicOrigin, `terminal/operations/${operationId}`), 200, 'recovery').operationId, operationId);
assert.equal(expectStatus(await call(publicOrigin, 'terminal/operations', 'POST', { operationId }, technicalCsrf()), 201, 'retry').operationId, operationId);
expectStatus(await call(publicOrigin, `terminal/operations/${operationId}/close`, 'POST', {}, technicalCsrf()), 201, 'close');
expectStatus(await call(backend, `supervisor/terminals/${terminalId}/block`, 'POST', {}, bearer), 201, 'block');
assert.equal((await call(publicOrigin, 'terminal/operations', 'POST', { operationId: randomUUID() }, technicalCsrf())).status, 409);
expectStatus(await call(backend, `supervisor/terminals/${terminalId}/enable`, 'POST', { shiftId: shift.id }, bearer), 201, 'reenable');
localSql(`UPDATE "Terminal" SET "operationalStatus" = 'FUERA_DE_SERVICIO' WHERE id = '${terminalId}';`);
try {
  assert.equal((await call(publicOrigin, 'terminal/operations', 'POST', { operationId: randomUUID() }, technicalCsrf())).status, 409);
} finally {
  expectStatus(await call(backend, `supervisor/terminals/${terminalId}/restore`, 'POST', {}, bearer), 201, 'restore service');
}
const assignmentId = terminals.find(row => row.id === terminalId)?.assignments?.[0]?.id;
assert.ok(assignmentId);
localSql(`UPDATE "TerminalPumpAssignment" SET "endedAt" = now() WHERE id = '${assignmentId}';`);
try {
  assert.equal((await call(publicOrigin, 'terminal/operations', 'POST', { operationId: randomUUID() }, technicalCsrf())).status, 409);
} finally {
  localSql(`UPDATE "TerminalPumpAssignment" SET "endedAt" = NULL WHERE id = '${assignmentId}';`);
}
jar.set('primax-terminal-local', 'f'.repeat(64));
assert.equal((await call(publicOrigin, 'terminal/me')).status, 401);
jar.set('primax-terminal-local', oldTechnical);
const rotated = expectStatus(await call(publicOrigin, `supervisor/terminals/${terminalId}/rotate`, 'POST', {}, { ...kioskCsrf, ...bearer }), 201, 'rotate');
assert.equal(rotated.paired, true);
const newTechnical = jar.get('primax-terminal-local'); assert.notEqual(newTechnical, oldTechnical);
jar.set('primax-terminal-local', oldTechnical);
assert.equal((await call(publicOrigin, 'terminal/me')).status, 401);
jar.set('primax-terminal-local', newTechnical);
assert.equal((await call(publicOrigin, 'terminal/me')).status, 200);
const activeId = randomUUID();
expectStatus(await call(publicOrigin, 'terminal/operations', 'POST', { operationId: activeId }, technicalCsrf()), 201, 'active before suspension');
expectStatus(await call(backend, `supervisor/shifts/${shift.id}/suspend`, 'POST', {}, bearer), 201, 'suspend');
assert.equal(expectStatus(await call(publicOrigin, `terminal/operations/${activeId}`), 200, 'active after suspension').operationId, activeId);
expectStatus(await call(publicOrigin, `terminal/operations/${activeId}/close`, 'POST', {}, technicalCsrf()), 201, 'close while suspended');
assert.equal((await call(publicOrigin, 'terminal/operations', 'POST', { operationId: randomUUID() }, technicalCsrf())).status, 409);
expectStatus(await call(backend, `supervisor/shifts/${shift.id}/close`, 'POST', {}, bearer), 201, 'close shift');
assert.equal((await call(publicOrigin, 'terminal/operations', 'POST', { operationId: randomUUID() }, technicalCsrf())).status, 409);
expectStatus(await call(publicOrigin, `supervisor/terminals/${terminalId}/revoke-session`, 'POST', {}, { ...kioskCsrf, ...bearer }), 201, 'revoke');
jar.set('primax-terminal-local', newTechnical);
assert.equal((await call(publicOrigin, 'terminal/me')).status, 401);
console.log(JSON.stringify({ flow: 'supervisor → pairing → terminal operation → recovery → close → rotate → suspend → revoke', operationId, result: 'passed' }));
