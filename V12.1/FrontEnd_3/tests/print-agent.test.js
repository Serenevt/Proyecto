import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrintAgent, isLocalControlOrigin } from '../js/print-agent.js';

const receipt = { id: '00000000-0000-4000-8000-000000000001', pump: '03' };

test('PrintAgent only accepts an exact local Control origin', () => {
  assert.equal(isLocalControlOrigin('http://127.0.0.1:10083'), true);
  assert.equal(isLocalControlOrigin('http://localhost:10083'), true);
  assert.equal(isLocalControlOrigin('https://127.0.0.1:10083'), false);
  assert.equal(isLocalControlOrigin('http://192.168.1.4:10083'), false);
});

test('PrintAgent submits one stable job and safely reuses an accepted job', async () => {
  const calls = [];
  const print = createPrintAgent(async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'GET') return { status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ id: 'receipt-' + receipt.id, status: 'accepted' }) };
  }, 'http://127.0.0.1:10083');
  const job = await print(receipt);
  assert.equal(job.status, 'accepted');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[1].options.method, 'POST');
});

test('PrintAgent failure is surfaced without retrying a possibly unknown job', async () => {
  let posts = 0;
  const print = createPrintAgent(async (_url, options) => {
    if (options.method === 'POST') posts += 1;
    return { ok: true, status: 200, json: async () => ({ id: 'receipt-' + receipt.id, status: 'unknown' }) };
  }, 'http://localhost:10083');
  await assert.rejects(print(receipt), /resultado de impresión es desconocido/);
  assert.equal(posts, 0);
  await assert.rejects(createPrintAgent(async () => { throw Error('offline'); }, 'http://localhost:10083')(receipt), /PrintAgent local no está disponible/);
});
