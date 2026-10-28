import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewStation, initialView, incidentMessage } from '../js/control-state.js';
import { createControlApi } from '../js/control-api.js';

test('global user and explicit station assignment define allowed scope', () => {
  assert.equal(canViewStation({ global: true, stations: [] }, 'other'), true);
  assert.equal(canViewStation({ global: false, stations: [{ id: 'a' }] }, 'a'), true);
  assert.equal(canViewStation({ global: false, stations: [{ id: 'a' }] }, 'b'), false);
});
test('route guard maps unknown route to dashboard and permits known views', () => {
  assert.equal(initialView('#incidents'), 'incidents');
  assert.equal(initialView('#accounts'), 'accounts');
  assert.equal(initialView('#unlisted'), 'dashboard');
});
test('API errors show safe, actionable messages', () => {
  assert.match(incidentMessage({ status: 403 }), /no tiene permiso/);
  assert.match(incidentMessage({ status: 503 }), /temporalmente/);
});

test('login, session and logout use the HttpOnly cookie session without storing a token', async () => {
  const calls = [];
  const api = createControlApi(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ user: { name: 'Control' }, permissions: ['ADMIN_CONTROL_ACCESS'] }) };
  });
  const credentials = { email: 'admin@primax.test', password: 'secret' };
  await api.login(credentials);
  await api.session();
  await api.logout();
  assert.equal(calls[0].url, '/api/v1/control/login');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.body, JSON.stringify(credentials));
  assert.equal(calls[1].url, '/api/v1/control/session');
  assert.equal(calls[2].options.method, 'POST');
  assert.equal(Object.hasOwn(calls[0].options, 'localStorage'), false);
});

test('request surfaces backend authorization and service errors with status', async () => {
  const api = createControlApi(async () => ({ ok: false, status: 403, json: async () => ({ message: 'Acceso denegado' }) }));
  await assert.rejects(api.request('/control/dashboard'), (error) => error.status === 403 && error.message === 'Acceso denegado');
});
