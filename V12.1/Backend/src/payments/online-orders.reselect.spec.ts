import { createHash } from 'node:crypto';
import { DemoWalletProvider } from './demo-provider';
import { OnlineOrdersService } from './online-orders';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const operationId = '33333333-3333-4333-8333-333333333333';
const orderId = '44444444-4444-4444-8444-444444444444';
const authorization = {
  mode: 'PREPAGO', paymentMethod: 'YAPE', unitPrice: '23.50', allowDebt: false,
  plate: 'F3R-582', amount: '50.00', stationId: '11111111-1111-4111-8111-111111111111',
  fuelId: '22222222-2222-4222-8222-222222222222', receiptType: 'BOLETA', operationId,
};
function fixture() {
  const order = { id: orderId, operationId, method: 'YAPE', status: 'PENDING', providerId: 'demo:' + orderId,
    paymentId: '55555555-5555-4555-8555-555555555555', transactionId: null, userId: null,
    requestHash: hash({ operationId, method: 'YAPE', authorization }) };
  const payment = { id: order.paymentId, operationId, status: 'PENDING', method: 'YAPE',
    requestHash: hash({ ...authorization, plate: 'F3R-582', amount: '50.00' }) };
  const reservation = { id: '66666666-6666-4666-8666-666666666666', operationId,
    status: 'PENDING_PAYMENT', requestHash: payment.requestHash };
  const created = { order: 0, payment: 0, reservation: 0, transaction: 0, movement: 0 };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: orderId }]),
    onlineOrder: { findUnique: jest.fn(async () => order), update: jest.fn(async ({data}: any) => Object.assign(order,data)) },
    payment: { findUniqueOrThrow: jest.fn(async () => payment), update: jest.fn(async ({data}: any) => Object.assign(payment,data)) },
    inventoryReservation: { findUnique: jest.fn(async () => reservation), update: jest.fn(async ({data}: any) => Object.assign(reservation,data)) },
    fuelAuthorization: { findFirst: jest.fn().mockResolvedValue(null) },
    transaction: { findFirst: jest.fn().mockResolvedValue(null) },
    paymentEvent: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const db = { atomic: async (work: any) => work(tx) };
  const service = new OnlineOrdersService(db as any, new DemoWalletProvider(db as any));
  const actor = { kind: 'kiosk' } as any;
  return { service, actor, order, payment, reservation, tx, created };
}

describe('Reselection of one unpaid FuelFlow order', () => {
  it('switches Yape → Plin → Tarjeta → Yape while preserving one operation, order, payment and stock commitment', async () => {
    const f = fixture();
    for (const method of ['PLIN', 'TARJETA', 'YAPE']) {
      const body = { operationId, method, authorization: { ...authorization, paymentMethod: method } };
      const result = await f.service.reselect(orderId, body as any, f.actor);
      expect(result.id).toBe(orderId);
      expect(result.operationId).toBe(operationId);
      expect(f.payment.method).toBe(method);
      expect(f.payment.requestHash).toBe(f.reservation.requestHash);
      expect(f.reservation.status).toBe('PENDING_PAYMENT');
    }
    expect(f.created).toEqual({ order: 0, payment: 0, reservation: 0, transaction: 0, movement: 0 });
    expect(f.tx.onlineOrder.update).toHaveBeenCalledTimes(3);
    expect(f.tx.payment.update).toHaveBeenCalledTimes(3);
    expect(f.tx.inventoryReservation.update).toHaveBeenCalledTimes(3);
  });
  it('rejects changed purchase data and captured payment before changing any state', async () => {
    const f = fixture();
    await expect(f.service.reselect(orderId, { operationId, method:'PLIN', authorization:{...authorization,paymentMethod:'PLIN',amount:'60.00'} } as any, f.actor)).rejects.toThrow();
    expect(f.tx.onlineOrder.update).not.toHaveBeenCalled();
    f.payment.status = 'CAPTURED';
    await expect(f.service.reselect(orderId, { operationId, method:'PLIN', authorization:{...authorization,paymentMethod:'PLIN'} } as any, f.actor)).rejects.toThrow();
    expect(f.tx.inventoryReservation.update).not.toHaveBeenCalled();
  });
  it('blocks a provider confirmation recorded before order status reconciliation', async () => {
    const f=fixture();
    f.tx.paymentEvent.findFirst.mockResolvedValue({eventKey:'demo-confirm:'+orderId});
    await expect(f.service.reselect(orderId,{operationId,method:'PLIN',authorization:{...authorization,paymentMethod:'PLIN'}} as any,f.actor)).rejects.toThrow('conciliación');
    expect(f.tx.payment.update).not.toHaveBeenCalled();
  });
});
