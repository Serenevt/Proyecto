import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrimeBalanceRetry, prepaidAmountFromPostpaid } from '../src/js/primeBalance.js';
import { createTransactionsService, OPERATION_KEY } from '../src/js/transactionsService.js';

const storage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
};

const insufficient = () => Object.assign(Error('Saldo insuficiente'), {
  status: 400,
  details: { code: 'INSUFFICIENT_BALANCE', available: '30.00', amount: '50.00', amountPending: '20.00' },
});

test('Ya recargué consulta la membresía real y reserva cuando el saldo actualizado alcanza', async () => {
  const events = [];
  let visibleMembership;
  const retry = createPrimeBalanceRetry({
    refreshVehicle: async plate => { events.push(['GET vehicle', plate]); return { membership: { number: 'PRIM001', status: 'ACTIVE', balance: '80.00' } }; },
    updateMembership: value => { visibleMembership = value; },
    reserve: async amount => { events.push(['POST authorization', amount]); return { authorization: { status: 'RESERVED' } }; },
  });
  const result = await retry({ plate: 'ABC-123', membershipNumber: 'PRIM001', amount: 50 });
  assert.deepEqual(events, [['GET vehicle', 'ABC-123'], ['POST authorization', 50]]);
  assert.equal(visibleMembership.balance, '80.00');
  assert.equal(result.authorization.status, 'RESERVED');
});

test('Ya recargué mantiene el rechazo backend si todavía falta saldo y no crea autorización local', async () => {
  let reserveCalls = 0;
  let visibleMembership;
  const retry = createPrimeBalanceRetry({
    refreshVehicle: async () => ({ membership: { number: 'PRIM001', status: 'ACTIVE', balance: '30.00' } }),
    updateMembership: value => { visibleMembership = value; },
    reserve: async () => { reserveCalls++; throw insufficient(); },
  });
  await assert.rejects(retry({ plate: 'ABC-123', membershipNumber: 'PRIM001', amount: 50 }), error => {
    assert.equal(error.details.code, 'INSUFFICIENT_BALANCE');
    return true;
  });
  assert.equal(visibleMembership.balance, '30.00');
  assert.equal(reserveCalls, 1);
});

test('fallo al consultar la placa no intenta autorizar ni cambia el saldo mostrado', async () => {
  let reserveCalls = 0;
  const retry = createPrimeBalanceRetry({
    refreshVehicle: async () => { throw Error('Backend no disponible'); },
    updateMembership: () => assert.fail('no debe actualizar el saldo'),
    reserve: async () => { reserveCalls++; },
  });
  await assert.rejects(retry({ plate: 'ABC-123', membershipNumber: 'PRIM001', amount: 50 }), /Backend no disponible/);
  assert.equal(reserveCalls, 0);
});

test('doble toque de Ya recargué comparte la misma consulta y autorización', async () => {
  let gets = 0, reserves = 0, resolve;
  const retry = createPrimeBalanceRetry({
    refreshVehicle: async () => { gets++; return { membership: { number: 'PRIM001', status: 'ACTIVE', balance: '80.00' } }; },
    updateMembership: () => {},
    reserve: () => { reserves++; return new Promise(done => { resolve = done; }); },
  });
  const args = { plate: 'ABC-123', membershipNumber: 'PRIM001', amount: 50 };
  const first = retry(args), second = retry(args);
  assert.equal(first, second);
  await Promise.resolve();
  resolve({ authorization: { status: 'RESERVED' } });
  await Promise.all([first, second]);
  assert.equal(gets, 1);
  assert.equal(reserves, 1);
});

test('saldo Prime suficiente continúa con una sola autorización postpago', async () => {
  const calls = [];
  const service = createTransactionsService({
    storage: storage(),
    uuid: () => 'sufficient-sale',
    authorizations: { reserve: async body => { calls.push(body); return { authorization: { status: 'RESERVED', unitPrice: '20.00' } }; } },
  });
  const result = await service.authorize({ mode: 'POSTPAGO', amount: '50.00' }, {});
  assert.equal(result.authorization.status, 'RESERVED');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mode, 'POSTPAGO');
});

test('Prime rechazado cambia a prepago manteniendo operationId para Yape, Plin y NFC', async t => {
  for (const paymentMethod of ['YAPE', 'PLIN', 'TARJETA']) await t.test(paymentMethod, async () => {
    const disk = storage(), calls = [];
    let resolvePrepaid;
    const service = createTransactionsService({
      storage: disk,
      uuid: () => 'same-sale',
      authorizations: { reserve: async body => {
        calls.push(body);
        if (body.mode === 'POSTPAGO') throw insufficient();
        return new Promise(resolve => { resolvePrepaid = () => resolve({ authorization: { status: 'RESERVED', unitPrice: '20.00' } }); });
      } },
    });
    await assert.rejects(service.authorize({ mode: 'POSTPAGO', plate: 'ABC-123', amount: '50.00' }, {}), /Saldo insuficiente/);
    service.switchAuthorizationToPrepaid({ modalidad: 'PREPAGO', combustible: { id: 'fuel' }, montoPrepago: 50 });
    const body = { mode: 'PREPAGO', paymentMethod, plate: 'ABC-123', amount: '50.00' };
    const first = service.authorize(body, {}), duplicate = service.authorize(body, {});
    assert.equal(first, duplicate);
    resolvePrepaid();
    const result = await first;
    assert.equal(result.authorization.status, 'RESERVED');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].operationId, 'same-sale');
    assert.equal(calls[1].operationId, 'same-sale');
    assert.equal(calls[1].mode, 'PREPAGO');
    assert.equal(calls[1].paymentMethod, paymentMethod);
    assert.equal(JSON.parse(disk.getItem(OPERATION_KEY)).authorizationRequest.mode, 'PREPAGO');
  });
});

test('el cambio a prepago se bloquea después de autorizar o preparar la compra', async () => {
  const disk = storage();
  const service = createTransactionsService({ storage: disk, uuid: () => 'sale' });
  service.begin();
  disk.setItem(OPERATION_KEY, JSON.stringify({ operationId: 'sale', authorization: { authorization: { id: 'auth' } } }));
  assert.throws(() => service.switchAuthorizationToPrepaid({}), /ya tiene un resultado/);
  disk.setItem(OPERATION_KEY, JSON.stringify({ operationId: 'sale', payload: { operationId: 'sale' } }));
  assert.throws(() => service.switchAuthorizationToPrepaid({}), /ya tiene un resultado/);
});

test('conserva el importe postpago válido para prepago y borra solo montos fuera de rango', () => {
  assert.equal(prepaidAmountFromPostpaid(50), '50.00');
  assert.equal(prepaidAmountFromPostpaid(50.129), '50.13');
  assert.equal(prepaidAmountFromPostpaid(9.99), null);
  assert.equal(prepaidAmountFromPostpaid(501), null);
});
