const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./harness.cjs');
test('V4 amount, document and plate rules are preserved', () => {
  const { validation: v } = harness().F;
  for (const amount of [10, 20, 500]) assert.equal(v.amount(amount), true);
  for (const amount of [0, 9.99, 500.01, NaN, Infinity]) assert.equal(v.amount(amount), false);
  assert.equal(v.dni('70123456'), true); assert.equal(v.dni('7012345'), false);
  assert.equal(v.ruc('20509876543'), true); assert.equal(v.ruc('2050987654x'), false);
  assert.equal(v.formatPlate(' abc123 '), 'ABC-123');
  assert.equal(v.plate('D4X-207'), true); assert.equal(v.plate('ABC-12'), false);
});
test('membership uses V4 rounding and a five percent discount', () => {
  const { totals } = harness().F;
  assert.deepEqual({ ...totals(10, 16.5, true) }, { subtotal: 165, descuento: 8.25, total: 156.75 });
  assert.deepEqual({ ...totals(3.03, 16.5, false) }, { subtotal: 50, descuento: 0, total: 50 });
  // This intentionally characterizes V4 rounding at a target of S/ 20.
  assert.equal(totals(1.21, 16.5, true).total, 18.97);
});
