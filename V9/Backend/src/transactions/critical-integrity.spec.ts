import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  PaymentStatus,
  Payment,
  FuelAuthorization,
} from '@prisma/client';
import { WalletRepository } from '../wallet/wallet.repository';
import { AuthorizationsRepository } from './authorizations.repository';
import { TransactionsRepository } from './transactions.repository';
import { TransactionModel } from './transaction.model';
import { CreateTransactionDto } from './create-transaction.dto';
import { PaymentsService } from '../payments/payments.service';
import { PointsPolicyService } from '../rewards/points-policy.service';
import { AuthorizationsService } from './authorizations.service';
import { TransactionsService } from './transactions.service';

const d = (value: string | number) => new Prisma.Decimal(value);
const request = {
  operationId: 'critical-operation',
  plate: 'ABC-123',
  stationId: 's',
  fuelId: 'f',
  mode: 'PREPAGO' as const,
  paymentMethod: 'TARJETA' as const,
  amount: '100.00',
  unitPrice: '20.00',
  receiptType: 'BOLETA' as const,
};

// Isolated repositories: exercises the real services, not PostgreSQL isolation.
function harness(status: PaymentStatus = 'CAPTURED') {
  let auth: FuelAuthorization;
  let paid: Payment;
  let purchase: TransactionModel;
  let price = d(20);
  const member = {
    id: 'm',
    number: 'PRIME-0001',
    status: 'ACTIVE',
    user: { active: true },
    balance: d(200),
  };
  const vehicle = { id: 'v', membershipId: 'm', membership: member };
  const db = {
    payment: {
      findUnique: jest.fn(async () => paid ?? null),
      create: jest.fn(
        async ({ data }: { data: Prisma.PaymentUncheckedCreateInput }) =>
          (paid = { ...data, id: 'payment' } as Payment),
      ),
    },
    vehicle: { findUnique: jest.fn(async () => vehicle) },
    fuel: {
      findUnique: jest.fn(async () => ({
        id: 'f',
        active: true,
        pricePerGallon: price,
      })),
    },
    station: { findUnique: jest.fn(async () => ({ id: 's', active: true })) },
    membership: { findUnique: jest.fn(async () => member) },
  };
  // Serialize calls to model repository contract; database races need E2E.
  let queue: Promise<unknown> = Promise.resolve();
  const atomic = (
    fn: (client: Prisma.TransactionClient) => Promise<unknown>,
  ) => {
    const next = queue.then(() =>
      fn(db as unknown as Prisma.TransactionClient),
    );
    queue = next.catch(() => {});
    return next;
  };
  const repo = {
    atomic,
    byOperation: jest.fn(async () => auth ?? null),
    byId: jest.fn(async () => auth ?? null),
    create: jest.fn(
      async (data: Prisma.FuelAuthorizationUncheckedCreateInput) => {
        expect(data.mode !== 'PREPAGO' || paid?.status === 'CAPTURED').toBe(
          true,
        );
        return (auth = {
          ...data,
          id: 'auth',
          createdAt: new Date(),
          consumedAmount: null,
          dispensedAmount: d(0),
          dispensedGallons: d(0),
        } as FuelAuthorization);
      },
    ),
    settle: jest.fn(
      async (_id: string, data: Partial<FuelAuthorization>) =>
        (auth = { ...auth, ...data }),
    ),
    client: () => db,
  };
  const wallet = {
    lockMembership: jest.fn(),
    setBalance: jest.fn(),
    movement: jest.fn(),
  };
  const payments = new PaymentsService();
  jest
    .spyOn(payments, 'authorize')
    .mockImplementation(
      (amount, method) =>
        ({ amount, method, status, provider: 'DEMO' }) as ReturnType<
          PaymentsService['authorize']
        >,
    );
  const authorizations = new AuthorizationsService(
    repo as unknown as AuthorizationsRepository,
    wallet as unknown as WalletRepository,
    payments,
  );
  const transactionsRepo = {
    atomic,
    byOperation: jest.fn(async () => purchase ?? null),
    vehicle: async () => vehicle,
    fuel: db.fuel.findUnique,
    station: db.station.findUnique,
    create: jest.fn(
      async (data: Prisma.TransactionUncheckedCreateInput) =>
        (purchase = {
          ...data,
          id: 'purchase',
          membership: null,
        } as unknown as TransactionModel),
    ),
  };
  const transactions = new TransactionsService(
    transactionsRepo as unknown as TransactionsRepository,
    new PointsPolicyService(new ConfigService({ POINTS_PER_SOL: '1' })),
    payments,
    repo as unknown as AuthorizationsRepository,
    wallet as unknown as WalletRepository,
  );
  const close = (changes: Partial<CreateTransactionDto> = {}) =>
    transactions.create({
      ...request,
      operationId: 'purchase-operation',
      authorizationId: 'auth',
      amount: '80.00',
      gallons: '4.000',
      ...changes,
    });
  return {
    authorizations,
    transactions,
    repo,
    db,
    payments,
    transactionsRepo,
    wallet,
    close,
    auth: () => auth,
    paid: () => paid,
    setPrice: (v: number) => {
      price = d(v);
    },
  };
}

describe('Critical correction: persisted payment, dispatch integrity and recovery', () => {
  it.each(['PENDING', 'REJECTED', 'ERROR', 'PARTIAL'] as PaymentStatus[])(
    '%s never creates a fuel authorization',
    async (status) => {
      const h = harness(status);
      await expect(h.authorizations.create(request)).rejects.toThrow(
        'Pago no aprobado',
      );
      expect(h.paid().status).toBe(status);
      expect(h.repo.create).not.toHaveBeenCalled();
    },
  );
  it.each(['timeout', 'network error'])(
    '%s never authorizes dispatch',
    async (message) => {
      const h = harness();
      h.payments.authorize = jest.fn(() => {
        throw Error(message);
      });
      await expect(h.authorizations.create(request)).rejects.toThrow(message);
      expect(h.repo.create).not.toHaveBeenCalled();
    },
  );
  it('double click creates one persisted payment and authorization', async () => {
    const h = harness();
    const results = await Promise.all([
      h.authorizations.create(request),
      h.authorizations.create(request),
    ]);
    expect(results[0].authorization.id).toBe(results[1].authorization.id);
    expect(h.db.payment.create).toHaveBeenCalledTimes(1);
    expect(h.repo.create).toHaveBeenCalledTimes(1);
    expect(h.payments.authorize).toHaveBeenCalledTimes(1);
  });
  it('payment persistence failure never authorizes dispatch', async () => {
    const h = harness();
    h.db.payment.create.mockRejectedValueOnce(Error('database unavailable'));
    await expect(h.authorizations.create(request)).rejects.toThrow(
      'database unavailable',
    );
    expect(h.repo.create).not.toHaveBeenCalled();
  });
  it.each([
    ['amount altered', { amount: '79.00' }],
    ['gallons altered', { gallons: '3.000' }],
    ['price altered', { unitPrice: '1.00' }],
    ['audit S/1 without gallons', { amount: '1.00', gallons: undefined }],
    ['unregistered higher close', { amount: '90.00', gallons: '4.500' }],
    ['above authorized limit', { amount: '101.00', gallons: '5.050' }],
  ])('rejects %s without settlement', async (_name, changes) => {
    const h = harness();
    await h.authorizations.create(request);
    await h.authorizations.progress('auth', {
      amount: '80.00',
      gallons: '4.000',
    });
    await expect(h.close(changes)).rejects.toThrow();
    expect(h.transactionsRepo.create).not.toHaveBeenCalled();
    expect(h.auth().status).toBe('DISPENSING');
    expect(h.auth().dispensedAmount.toFixed(2)).toBe('80.00');
  });
  it.each(['PREPAGO', 'POSTPAGO'] as const)(
    '%s locks X at initiation despite catalog change',
    async (mode) => {
      const h = harness();
      await h.authorizations.create({
        ...request,
        mode,
        membershipCode: 'PRIME-0001',
      });
      h.setPrice(30);
      await h.authorizations.progress('auth', {
        amount: '80.00',
        gallons: '4.000',
      });
      const result = await h.close({
        mode,
        paymentMethod: mode === 'POSTPAGO' ? 'SALDO_PRIME' : 'TARJETA',
      });
      expect(Number(result.transaction.unitPrice)).toBe(20);
      expect(result.transaction.amount).toBe('80.00');
      expect(h.auth().status).toBe('SETTLED');
      await expect(
        h.authorizations.progress('auth', {
          amount: '90.00',
          gallons: '4.500',
        }),
      ).rejects.toThrow();
      if (mode === 'PREPAGO')
        expect(h.payments.authorize).toHaveBeenCalledTimes(1);
    },
  );
  it('requires reconfirmation if catalog changed before authorization', async () => {
    const h = harness();
    h.setPrice(30);
    await expect(h.authorizations.create(request)).rejects.toThrow(
      'precio cambió',
    );
    expect(h.db.payment.create).not.toHaveBeenCalled();
  });
  it('intervention persists reached state and prevents silent continuation', async () => {
    const h = harness();
    await h.authorizations.create(request);
    await h.authorizations.progress('auth', {
      amount: '80.00',
      gallons: '4.000',
    });
    const result = await h.authorizations.intervention('auth');
    expect(result.status).toBe('INTERVENTION_REQUIRED');
    expect(result.dispensedAmount).toBe('80.00');
    expect(result.interventionReason).toMatch(/Fallo crítico/);
    await expect(
      h.authorizations.progress('auth', { amount: '90.00', gallons: '4.500' }),
    ).rejects.toThrow();
    await expect(h.close()).rejects.toThrow('intervención');
    await expect(h.authorizations.release('auth')).rejects.toThrow();
    expect((await h.authorizations.intervention('auth')).status).toBe(
      'INTERVENTION_REQUIRED',
    );
  });
  it('rejects manipulated progress gallons and over-limit amount', async () => {
    const h = harness();
    await h.authorizations.create(request);
    await expect(
      h.authorizations.progress('auth', { amount: '80.00', gallons: '1.000' }),
    ).rejects.toThrow();
    await expect(
      h.authorizations.progress('auth', { amount: '120.00', gallons: '6.000' }),
    ).rejects.toThrow();
    expect(h.auth().dispensedAmount.toFixed(2)).toBe('0.00');
  });
  it('rejects another vehicle even when membership is the same', async () => {
    const h = harness();
    await h.authorizations.create(request);
    h.auth().vehicleId = 'other';
    await expect(h.close()).rejects.toThrow('no corresponde');
  });
});
