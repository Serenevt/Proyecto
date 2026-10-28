import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('FuelFlow shows the payment review message only after Backend confirms INC-001', async () => {
  const script = await readFile(new URL('../src/js/script.js', import.meta.url), 'utf8');
  const intervention = script.slice(
    script.indexOf('function requerirIntervencion(error)'),
    script.indexOf('\nfunction pintarDespacho', script.indexOf('function requerirIntervencion(error)')),
  );

  assert.match(intervention, /authorizationService\.intervention\(state\.autorizacionId\)/);
  assert.match(intervention, /result\?\.incident\?\.code === 'INC_001'/);
  assert.match(intervention, /El pago fue registrado, pero el despacho no pudo completarse/);
  assert.match(intervention, /no se ha confirmado un reembolso/);
  assert.doesNotMatch(intervention, /incident\.id|paymentId|authorizationId/);
});
