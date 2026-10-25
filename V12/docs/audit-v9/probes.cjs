/* Audit probes: actual source, in-memory dependencies, no network or database writes.
 * Run from V9: node docs/audit-v9/probes.cjs
 * These reproduce observed behavior; passing a probe does NOT mean compliance.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
require(path.join(root, 'Backend/node_modules/ts-node')).register({
  project: path.join(root, 'Backend/tsconfig.json'), transpileOnly: true,
});
const { Prisma } = require(path.join(root, 'Backend/node_modules/@prisma/client'));
const { ConfigService } = require(path.join(root, 'Backend/node_modules/@nestjs/config'));
const { TransactionsService } = require(path.join(root, 'Backend/src/transactions/transactions.service.ts'));
const { PointsPolicyService } = require(path.join(root, 'Backend/src/rewards/points-policy.service.ts'));
const { PaymentsService } = require(path.join(root, 'Backend/src/payments/payments.service.ts'));
const decimal = value => new Prisma.Decimal(value);
const results = [];
const source = fs.readFileSync(path.join(root, 'FrontEnd_1/src/js/script.js'), 'utf8');
function functionSource(name, next) {
  return source.slice(source.indexOf('function ' + name + '('), source.indexOf('function ' + next + '('));
}
async function main() {
  const { createTransactionsService } = await import(pathToFileURL(path.join(root, 'FrontEnd_1/src/js/transactionsService.js')));
  for (const status of [503, 401]) {
    const map = new Map();
    const service = createTransactionsService({
      storage: { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) },
      uuid: () => 'audit-operation',
      authorizations: { status: async () => { throw Object.assign(Error('temporary'), { status }); } },
    });
    service.prepare({ mode: 'POSTPAGO', authorizationId: 'audit-auth' }, {});
    const result = await service.reconcile();
    assert.equal(result.action, 'discard');
    results.push({ probe: 'recovery-error-' + status, observed: result });
  }
  let localRecord;
  const elements = new Map();
  const context = {
    state: { tipoComprobante: 'BOLETA', placa: 'ABC-123', combustible: { nombre: 'Premium', precio: 23.5 }, galones: 0.536, modalidad: 'POSTPAGO', montoPostpago: 12.6, idioma: 'es' },
    backendResult: { transaction: { id: 'synthetic', status: 'PAYMENT_PENDING', amount: '12.60', debt: { amountPending: '7.60' } }, pointsEarned: 12 },
    calcularTotales: () => ({ subtotal: 12.6, descuento: 0, total: 12.6, aplica_descuento: false }),
    $: id => { if (!elements.has(id)) elements.set(id, { classList: { toggle() {} } }); return elements.get(id); },
    t: key => key, LOCALE_IDIOMA: { es: 'es-PE' },
    guardarTransaccion: record => { localRecord = record; },
    refrescarAdmin() {}, mostrarPantalla() {}, hablar() {}, actualizarEstado() {},
  };
  vm.runInNewContext(functionSource('pintarResumen', 'generarComprobante') + '\npintarResumen();', context);
  assert.equal(localRecord.estado, 'Pagado');
  assert.match(elements.get('t-estado').textContent, /Pendiente/);
  results.push({ probe: 'RN-06-same-response', backendStatus: context.backendResult.transaction.status, ticket: elements.get('t-estado').textContent, localHistory: localRecord.estado });
  let dispatched = false;
  const paymentContext = { state: {}, $: () => ({}), t: x => x, mostrarPantalla() {}, hablar() {}, actualizarEstado() {}, setTimeout: fn => fn(), mostrarModal: (_a, _b, _c, fn) => fn(), simularDespacho: () => { dispatched = true; } };
  vm.runInNewContext(functionSource('procesarPago', 'mostrarConsumoPostpago') + '\nprocesarPago();', paymentContext);
  assert.equal(dispatched, true);
  results.push({ probe: 'prepago-before-server', paymentAuthorized: paymentContext.state.pagoAutorizado, dispatchStarted: dispatched, networkAvailableInProbe: false });

  const membership = { id: 'member', number: 'PRIME-0001', status: 'ACTIVE', user: { active: true } };
  let created;
  let price = decimal('23.50');
  const tx = { membership: { findUnique: async () => ({ balance: decimal('0') }) } };
  const reservation = { id: 'auth', membershipId: 'member', vehicleId: 'vehicle-original', stationId: 'station', fuelId: 'fuel', status: 'DISPENSING', authorizedAmount: decimal('100'), reservedAmount: decimal('100'), dispensedAmount: decimal('80'), dispensedGallons: decimal('3.404') };
  const repo = { atomic: fn => fn(tx), byOperation: async () => null, vehicle: async () => ({ id: 'vehicle-other', membership }), fuel: async () => ({ id: 'fuel', active: true, pricePerGallon: price }), station: async () => ({ id: 'station', active: true }), create: async data => { created = data; return { ...data, id: 'audit', membership: null }; } };
  const service = new TransactionsService(repo, new PointsPolicyService(new ConfigService({ POINTS_PER_SOL: '1' })), new PaymentsService(), { byId: async () => reservation, settle: async () => ({}) }, { lockMembership: async () => {}, setBalance: async () => {}, movement: async () => {} });
  const body = { operationId: 'synthetic', plate: 'ABC-123', membershipCode: 'PRIME-0001', stationId: 'station', fuelId: 'fuel', amount: '1.00', mode: 'POSTPAGO', paymentMethod: 'SALDO_PRIME', authorizationId: 'auth', receiptType: 'BOLETA' };
  await service.create(body);
  assert.equal(created.amount.toFixed(2), '1.00');
  assert.equal(created.gallons, null);
  results.push({ probe: 'postpago-lower-than-recorded', recordedProgress: '80.00', acceptedFinalAmount: created.amount.toFixed(2), gallons: created.gallons, reservationVehicle: reservation.vehicleId, acceptedVehicle: created.vehicleId, status: created.status });
  price = decimal('24.00');
  let message;
  try { await service.create({ ...body, amount: '23.50', gallons: '1.000' }); } catch (error) { message = error.message; }
  assert.match(message, /importe no coincide/);
  results.push({ probe: 'price-change-during-operation', selectedPrice: '23.50', currentPrice: '24.00', observed: message });
  process.stdout.write(JSON.stringify({ scope: 'Source-level probes with isolated dependencies; no HTTP, PostgreSQL, hardware or external payment validation', results }, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
