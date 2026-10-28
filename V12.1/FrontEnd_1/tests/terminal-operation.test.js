import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureTerminalOperation } from '../src/js/terminalOperation.js';

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
