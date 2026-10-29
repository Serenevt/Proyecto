import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureTerminalOperation } from '../src/js/terminalOperation.js';
import { createTransactionsService, OPERATION_KEY } from '../src/js/transactionsService.js';

const id = '33333333-3333-4333-8333-333333333333';
test('starts with the persisted operationId and recovers it after refresh', async () => {
  const calls = [];
  const transactions = { begin: () => ({ operationId: id }) };
  let exists = false;
  const terminal = {
    me: async () => ({ canStart: !exists }),
    operation: async operationId => { calls.push(['get', operationId]); if (!exists) throw Object.assign(Error('missing'), { status: 404 }); return { operationId, status: 'ACTIVE' }; },
    start: async operationId => { calls.push(['post', operationId]); exists = true; return { operationId, status: 'ACTIVE' }; },
  };
  assert.equal((await ensureTerminalOperation({ terminal, transactions })).operationId, id);
  assert.equal((await ensureTerminalOperation({ terminal, transactions })).operationId, id);
  assert.deepEqual(calls, [['get', id], ['post', id], ['get', id]]);
});
test('requires a prepared terminal before creating a new operation', async () => {
  let started = false;
  const terminal = { me: async () => ({ canStart: false }), operation: async () => { throw Object.assign(Error('missing'), { status: 404 }); }, start: async () => { started = true; } };
  await assert.rejects(ensureTerminalOperation({ terminal, transactions: { begin: () => ({ operationId: id }) } }), /no está disponible/);
  assert.equal(started, false);
});
test('closed persisted operation is discarded and a fresh operation starts; active operation is retained', async () => {
  const old = 'cc4460cb-d4c0-45eb-a240-dffcfbc042aa';
  const next = '77777777-7777-4777-8777-777777777777';
  const values = new Map([[OPERATION_KEY, JSON.stringify({ operationId: old })]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const transactions = createTransactionsService({ storage, uuid: () => next });
  const calls = [];
  const terminal = {
    me: async () => ({ prepared: true, canStart: true, operationalStatus: 'DISPONIBLE' }),
    operation: async operationId => { calls.push(['get', operationId]); if (operationId === old) return { operationId, status: 'CLOSED', closedAt: '2026-10-29T16:36:45.368Z' }; throw Object.assign(Error('missing'), { status: 404 }); },
    start: async operationId => { calls.push(['post', operationId]); return { operationId, status: 'ACTIVE' }; },
  };
  assert.equal((await ensureTerminalOperation({ terminal, transactions })).operationId, next);
  assert.equal(JSON.parse(storage.getItem(OPERATION_KEY)).operationId, next);
  assert.deepEqual(calls, [['get', old], ['get', next], ['post', next]]);
  const active = { ...terminal, operation: async operationId => ({ operationId, status: 'ACTIVE' }), start: async () => { throw Error('must not start again'); } };
  assert.equal((await ensureTerminalOperation({ terminal: active, transactions })).operationId, next);
});
