const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./harness.cjs');
const tx = id => ({ id, hora: '12:00', placa: 'ABC-123', combustible: 'Regular', monto: 50, estado: 'Pendiente', litros: 3.03 });
test('save is idempotent and postpay updates by id, not plate', async () => {
  const { F } = harness();
  await F.transactionService.save(tx('first')); await F.transactionService.save(tx('second'));
  await F.transactionService.save(tx('first'));
  await F.transactionService.updatePayment('first', { estado: 'Pagado', importe: 50 });
  assert.equal((await F.transactionService.list()).length, 7);
  assert.equal((await F.transactionService.get('first')).estado, 'Pagado');
  assert.equal((await F.transactionService.get('second')).estado, 'Pendiente');
});
test('legacy history is copied once without writing V4 keys', async () => {
  const raw = JSON.stringify([{ ...tx('legacy'), id: undefined }]);
  const env = harness({ primax_transacciones: raw, primax_idioma: 'qu' });
  assert.equal((await env.F.transactionService.list()).length, 1);
  assert.equal(await env.F.settingsService.getLanguage(), 'qu');
  await env.F.transactionService.save(tx('new'));
  await env.F.settingsService.setLanguage('en');
  assert.equal(env.storage.get('primax_transacciones'), raw);
  assert.equal(env.storage.get('primax_idioma'), 'qu');
  const reload = harness(Object.fromEntries(env.storage));
  assert.equal((await reload.F.transactionService.list()).length, 2);
});
test('denied and malformed storage preserve a usable in-memory history', async () => {
  for (const env of [harness({}, true), harness({ fuelflow_v5_transactions_v1: '{broken' }), harness({ fuelflow_v5_transactions_v1: JSON.stringify({ version: 1, records: [{}] }) })]) {
    const saved = await env.F.transactionService.save(tx('memory'));
    assert.equal(saved.transaction.id, 'memory');
    assert.equal((await env.F.transactionService.list()).length, 6);
  }
});
test('payment authorization is distinct from capture, double confirmation returns same promise', async () => {
  const env = harness();
  const request = { id: 'payment', amount: 20, method: 'YAPE' };
  const first = env.F.paymentService.confirm(request);
  assert.equal(first, env.F.paymentService.confirm(request));
  const auth = env.F.paymentService.authorize(request);
  env.advance(2000);
  assert.equal((await first).estado, 'Pagado'); assert.equal((await auth).estado, 'Autorizado');
});
test('dispensing clamps prepay, pauses without catch-up and stops cleanly', async () => {
  const env = harness(); const service = env.F.fuelService;
  let last; const off = service.subscribe(event => last = event);
  await service.startDispense({ id: 'fuel', price: 16.5, target: 50 });
  env.advance(600); assert.equal(last.litros, 1);
  service.pause(); env.advance(10000); assert.equal(last.litros, 1);
  service.resume(); env.advance(1500);
  assert.equal(last.total, 50); assert.equal(last.litros, 3.03); assert.equal(last.automatic, true);
  off(); const previous = last; env.advance(1000); assert.equal(last, previous);
});
test('postpay has no automatic stop at the reference tank capacity', async () => {
  const env = harness(); const service = env.F.fuelService;
  await service.startDispense({ id: 'post', price: 14.8 });
  env.advance(36600); assert.equal(service.getSnapshot().litros, 61);
  const stopped = await service.stopDispense(); env.advance(3000);
  assert.equal(service.getSnapshot().litros, stopped.litros);
});
test('assistance arrives after six seconds; cancellation releases its interval', async () => {
  const env = harness(); const service = env.F.assistanceService;
  const first = await service.request(); let status;
  const off = service.subscribe(first.id, event => status = event.status);
  env.advance(6000); assert.equal(status, 'arrived'); off(); await service.cancel(first.id);
  const second = await service.request(); await service.cancel(second.id);
  assert.equal(env.timers.size, 0);
});
test('cancelled operations do not invoke stale callbacks', () => {
  const env = harness(); let invoked = false;
  env.F.operations.later(() => invoked = true, 900); env.F.operations.cancel(); env.advance(2000);
  assert.equal(invoked, false);
});
