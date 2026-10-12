import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTransactionsService, AUTHORIZATION_CLOSED, OPERATION_KEY } from '../src/js/transactionsService.js';

const storage = () => {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
};

const payload = {
  plate: 'ABC-123',
  stationId: 'station-1',
  fuelId: 'fuel-1',
  amount: '43.50',
  gallons: '2.042',
  mode: 'POSTPAGO',
  paymentMethod: 'SALDO_PRIME',
  authorizationId: 'auth-1',
  membershipCode: 'PRIME-0001',
  outcome: 'MANUAL',
};

const auth = (status) => ({ status, id: 'auth-1' });

test('AUTHORIZATION_CLOSED incluye solo los estados terminales', () => {
  assert.deepEqual(AUTHORIZATION_CLOSED, ['SETTLED', 'RELEASED']);
});

test('reconcile reenvía cuando la reserva sigue abierta', async () => {
  const disk = storage();
  const svc = createTransactionsService({
    storage: disk,
    authorizations: { status: async () => auth('DISPENSING') },
  });
  svc.prepare(payload, { placa: 'ABC-123' });
  const result = await svc.reconcile();
  assert.equal(result.action, 'retry');
});

test('reconcile reenvía con RESERVED', async () => {
  const disk = storage();
  const svc = createTransactionsService({
    storage: disk,
    authorizations: { status: async () => auth('RESERVED') },
  });
  svc.prepare(payload, {});
  assert.equal((await svc.reconcile()).action, 'retry');
});

test('reconcile recupera el comprobante cuando el backend ya liquidó', async () => {
  const disk = storage();
  const calls = [];
  const svc = createTransactionsService({
    storage: disk,
    authorizations: { status: async () => auth('SETTLED') },
    request: async (path, options) => {
      calls.push({ path, options });
      return {
        transaction: {
          id: 'tx-1',
          amount: '43.50',
          membership: { number: 'PRIME-0001' },
        },
        pointsEarned: 43,
        replayed: true,
      };
    },
  });
  svc.prepare(payload, { placa: 'ABC-123' });
  const operationIdPersistido = svc.current().payload.operationId;
  const result = await svc.reconcile();
  assert.equal(result.action, 'recovered');
  assert.equal(result.result.transaction.id, 'tx-1');
  assert.equal(result.result.replayed, true);
  // Se reenvía la misma operación persistida aprovechando la idempotencia
  // del backend por operationId; no se consulta por el id de la autorización.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/transactions');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body.operationId, operationIdPersistido);
  assert.equal(calls[0].options.body.amount, payload.amount);
  assert.equal(calls[0].options.body.authorizationId, payload.authorizationId);
  // El resultado queda persistido: un reintento no vuelve a enviar.
  assert.equal((await svc.submit()).transaction.id, 'tx-1');
  assert.equal(calls.length, 1);
});

test('reconcile no crea operación nueva si falta información del payload', async () => {
  const disk = storage();
  disk.setItem(
    OPERATION_KEY,
    JSON.stringify({
      operationId: 'op-incompleto',
      payload: {
        operationId: 'op-incompleto',
        plate: 'ABC-123',
        mode: 'POSTPAGO',
        authorizationId: 'auth-1',
      },
    }),
  );
  let enviado = false;
  const svc = createTransactionsService({
    storage: disk,
    authorizations: { status: async () => auth('SETTLED') },
    request: async () => {
      enviado = true;
      return {};
    },
  });
  const result = await svc.reconcile();
  assert.equal(result.action, 'discard');
  assert.match(result.reason, /Falta información/);
  // Sin payload completo no se reenvía nada: no hay riesgo de operación nueva.
  assert.equal(enviado, false);
  assert.equal(svc.current().payload.operationId, 'op-incompleto');
});

test('reconcile descarta sin crear operación nueva cuando el reenvío falla', async () => {
  const disk = storage();
  const svc = createTransactionsService({
    storage: disk,
    authorizations: { status: async () => auth('SETTLED') },
    request: async () => {
      throw new Error('operationId ya usado con otros datos');
    },
  });
  svc.prepare(payload, { placa: 'ABC-123' });
  const result = await svc.reconcile();
  assert.equal(result.action, 'discard');
  assert.match(result.reason, /No pudimos recuperar/);
  // La operación persistida sigue intacta hasta que el usuario la descarte.
  assert.equal(svc.current().payload.operationId, svc.current().operationId);
});

test('reconcile descarta la operación cuando la reserva fue liberada', async () => {
  const disk = storage();
  const svc = createTransactionsService({
    storage: disk,
    authorizations: { status: async () => auth('RELEASED') },
  });
  svc.prepare(payload, {});
  const result = await svc.reconcile();
  assert.equal(result.action, 'discard');
  assert.match(result.reason, /liberada/i);
  // Solo se elimina esta operación; el resto del almacenamiento se conserva.
  disk.setItem('idioma', 'es');
  svc.discard();
  assert.equal(disk.getItem('idioma'), 'es');
  assert.equal(disk.getItem('fuelflow:operation:v1'), null);
});

test('reconcile descarta cuando la reserva ya no existe (404)', async () => {
  const disk = storage();
  const svc = createTransactionsService({
    storage: disk,
    authorizations: { status: async () => { throw Object.assign(Error('no encontrada'), { status: 404 }); } },
  });
  svc.prepare(payload, {});
  const result = await svc.reconcile();
  assert.equal(result.action, 'discard');
});

test('reconcile no toca nada sin payload', async () => {
  const disk = storage();
  const svc = createTransactionsService({ storage: disk });
  assert.deepEqual(await svc.reconcile(), { action: 'empty' });
});

test('reconcile no consulta el backend en prepago', async () => {
  const disk = storage();
  let consulted = false;
  const svc = createTransactionsService({
    storage: disk,
    authorizations: { status: async () => { consulted = true; return auth('SETTLED'); } },
  });
  svc.prepare({ ...payload, mode: 'PREPAGO', paymentMethod: 'TARJETA', authorizationId: undefined }, {});
  assert.equal((await svc.reconcile()).action, 'retry');
  assert.equal(consulted, false);
});

test('submit es idempotente: un solo envío aunque se llame dos veces', async () => {
  const disk = storage();
  let calls = 0;
  const svc = createTransactionsService({
    storage: disk,
    request: async () => { calls++; return { transaction: { id: 'tx' }, pointsEarned: 1 }; },
  });
  svc.prepare(payload, {});
  const [a, b] = await Promise.all([svc.submit(), svc.submit()]);
  assert.equal(calls, 1);
  assert.equal(a.transaction.id, b.transaction.id);
});

test('un resultado persistido no se reenvía', async () => {
  const disk = storage();
  let calls = 0;
  const svc = createTransactionsService({
    storage: disk,
    request: async () => { calls++; return { transaction: { id: 'tx' } }; },
  });
  svc.prepare(payload, {});
  await svc.submit();
  await svc.submit();
  assert.equal(calls, 1);
});

test('discard no puede ejecutarse mientras hay un envío en curso', async () => {
  const disk = storage();
  let release;
  const svc = createTransactionsService({
    storage: disk,
    request: () => new Promise((r) => { release = r; }),
  });
  svc.prepare(payload, {});
  const pending = svc.submit();
  assert.throws(() => svc.discard(), /Espera/);
  release({ transaction: { id: 'tx' } });
  await pending;
});

test('finish exige confirmación y limpia solo esa operación', async () => {
  const disk = storage();
  const svc = createTransactionsService({
    storage: disk,
    request: async () => ({ transaction: { id: 'tx' }, pointsEarned: 1 }),
  });
  svc.prepare(payload, {});
  assert.throws(() => svc.finish(), /Primero confirma/);
  disk.setItem('idioma', 'qu');
  await svc.submit();
  svc.finish();
  assert.equal(disk.getItem('fuelflow:operation:v1'), null);
  assert.equal(disk.getItem('idioma'), 'qu');
});

test('el script reconcilia al iniciar y no reenvía reservas cerradas', () => {
  const script = readFileSync(new URL('../src/js/script.js', import.meta.url), 'utf8');
  // iniciar() consulta el estado real antes de reenviar.
  assert.match(script, /const check=await transactionsService\.reconcile\(\);/);
  assert.match(script, /if\(check\.action==='discard'\)\{/);
  assert.match(script, /transactionsService\.discard\(\);/);
  // El fallo por autorización cerrada se trata aparte del fallo de red.
  assert.match(script, /async function manejarFalloConfirmacion\(error\)/);
  assert.match(script, /const cerrada=\/liquidada o liberada/);
  // El cobro se marca una sola vez.
  assert.match(script, /state\.cobroIniciado = true;/);
  assert.match(script, /if \(state\.cobroIniciado\) return;/);
});

test('limpiarEstadoOperacion no toca localStorage', () => {
  const script = readFileSync(new URL('../src/js/script.js', import.meta.url), 'utf8');
  const body = script.slice(script.indexOf('function limpiarEstadoOperacion()'));
  const fn = body.slice(0, body.indexOf('\n}'));
  assert.equal(/localStorage/.test(fn), false);
  assert.equal(/removeItem/.test(fn), false);
  assert.match(fn, /cobroIniciado: false/);
});