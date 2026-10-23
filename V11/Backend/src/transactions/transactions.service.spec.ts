import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentsService } from '../payments/payments.service';
import { PointsPolicyService } from '../rewards/points-policy.service';
import { WalletRepository } from '../wallet/wallet.repository';
import { AuthorizationsRepository } from './authorizations.repository';
import { CreateTransactionDto } from './create-transaction.dto';
import { TransactionModel } from './transaction.model';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  const tx = {} as Prisma.TransactionClient;
  const repo = {
    atomic: <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => fn(tx),
    byOperation: jest.fn(),
    vehicle: jest.fn(),
    fuel: jest.fn(),
    station: jest.fn(),
    create: jest.fn(),
    byId: jest.fn(),
  };
  const authorizations = {
    byId: jest.fn(),
    settle: jest.fn(),
  };
  const wallet = {
    lockMembership: jest.fn(),
    setBalance: jest.fn(),
    movement: jest.fn(),
  };
  // tx.membership lo usa settleReservation al liberar el excedente.
  (tx as { membership?: unknown }).membership = {
    updateMany: jest.fn().mockResolvedValue({count:0}),
    findUnique: jest.fn().mockResolvedValue({
      id: 'member',
      balance: new Prisma.Decimal('0.00'),
    }),
  };
  const policy = new PointsPolicyService(
    new ConfigService({ SOLES_PER_POINT: '9' }),
  );
  const service = new TransactionsService(
    repo as unknown as TransactionsRepository,
    policy,
    new PaymentsService(),
    authorizations as unknown as AuthorizationsRepository,
    wallet as unknown as WalletRepository,
  );
  const membership = {
    id: 'member',
    number: 'PRIME-0001',
    status: 'ACTIVE',
    user: { active: true },
  };
  const reservation = {
    id: 'auth-1',
    plate: 'ABC-123',
    vehicleId: 'vehicle',
    mode: 'POSTPAGO',
    unitPrice: new Prisma.Decimal('21.30'),
    dispensedAmount: new Prisma.Decimal('100'),
    dispensedGallons: new Prisma.Decimal('4.695'),
    membershipId: 'member',
    stationId: 'station',
    fuelId: 'fuel',
    authorizedAmount: new Prisma.Decimal('200.00'),
    reservedAmount: new Prisma.Decimal('200.00'),
    status: 'RESERVED',
  };

  const prepago: CreateTransactionDto = {
    operationId: 'operation',
    plate: 'ABC-123',
    amount: '100.00',
    stationId: 'station',
    fuelId: 'fuel',
    mode: 'PREPAGO',
    gallons: '4.695',
    authorizationId: 'auth-pre',
    paymentMethod: 'TARJETA',
    receiptType: 'BOLETA',
  };
  const postpago: CreateTransactionDto = {
    operationId: 'operation',
    plate: 'ABC-123',
    amount: '100.00',
    stationId: 'station',
    fuelId: 'fuel',
    mode: 'POSTPAGO',
    gallons: '4.695',
    paymentMethod: 'SALDO_PRIME',
    receiptType: 'BOLETA',
    authorizationId: 'auth-1',
    membershipCode: 'PRIME-0001',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo.byOperation.mockResolvedValue(null);
    repo.vehicle.mockResolvedValue({ id: 'vehicle', membership });
    repo.fuel.mockResolvedValue({
      id: 'fuel',
      active: true,
      pricePerGallon: new Prisma.Decimal('21.30'),
    });
    repo.station.mockResolvedValue({ id: 'station', active: true });
    authorizations.byId.mockImplementation(async (id: string) =>
      id === 'auth-pre'
        ? { ...reservation, id, mode: 'PREPAGO', paymentId: 'paid' }
        : reservation,
    );
    (tx as unknown as { payment: unknown }).payment = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'paid',
        status: 'CAPTURED',
        method: 'TARJETA',
        amount: new Prisma.Decimal('200'),
      }),
    };
    repo.create.mockImplementation(
      async (data: Prisma.TransactionUncheckedCreateInput) =>
        ({
          ...data,
          id: 'transaction',
          membership: {
            id: 'member',
            number: 'PRIME-0001',
            userId: 'u',
            user: { name: 'Diego' },
          },
        }) as unknown as TransactionModel,
    );
  });

  // ---------- Prepago ----------

  it('crea compra, pago y movimiento de +100 en una operación atómica', async () => {
    const result = await service.create(prepago);
    expect(result.pointsEarned).toBe(11);
    expect(result.transaction.amount).toBe('100.00');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment: { connect: { id: 'paid' } },
        rewardMovement: {
          create: { membershipId: 'member', points: 11, kind: 'EARN' },
        },
      }),
      tx,
    );
  });

  it('PREPAGO nunca toca el saldo de la membresía', async () => {
    await service.create(prepago);
    expect(wallet.setBalance).not.toHaveBeenCalled();
    expect(wallet.movement).not.toHaveBeenCalled();
  });

  it('PREPAGO con medio externo acepta EFECTIVO, TARJETA, YAPE y PLIN', async () => {
    for (const paymentMethod of [
      'EFECTIVO',
      'TARJETA',
      'YAPE',
      'PLIN',
    ] as const) {
      (tx.payment.findUnique as jest.Mock).mockResolvedValue({
        id: 'paid',
        status: 'CAPTURED',
        method: paymentMethod,
        amount: new Prisma.Decimal('200'),
      });
      await expect(
        service.create({ ...prepago, paymentMethod }),
      ).resolves.toBeDefined();
    }
  });

  it('PREPAGO con SALDO_PRIME se rechaza', async () => {
    await expect(
      service.create({ ...prepago, paymentMethod: 'SALDO_PRIME' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('compra sin membresía obtiene cero puntos', async () => {
    repo.vehicle.mockResolvedValueOnce({ id: 'vehicle', membership: null });
    expect((await service.create(prepago)).pointsEarned).toBe(0);
    expect(repo.create.mock.calls[0][0]).not.toHaveProperty('rewardMovement');
  });

  it('membresía suspendida no gana puntos', async () => {
    repo.vehicle.mockResolvedValueOnce({
      id: 'vehicle',
      membership: { ...membership, status: 'SUSPENDED' },
    });
    expect((await service.create(prepago)).pointsEarned).toBe(0);
  });

  // ---------- Postpago ----------

  it('POSTPAGO liquida la reserva y libera el excedente', async () => {
    const result = await service.create(postpago);
    expect(result.transaction.amount).toBe('100.00');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ authorizationId: 'auth-1' }),
      tx,
    );
    // 200 reservados - 100 consumidos = 100 devueltos al saldo
    expect(wallet.movement).toHaveBeenCalledWith(
      expect.objectContaining({ amount: new Prisma.Decimal('100.00') }),
      expect.anything(),
    );
    expect(authorizations.settle).toHaveBeenCalled();
  });

  it('POSTPAGO sin autorización previa se rechaza', async () => {
    const { authorizationId: _omit, ...withoutAuth } = postpago;
    await expect(
      service.create(withoutAuth as CreateTransactionDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('POSTPAGO exige SALDO_PRIME como método', async () => {
    await expect(
      service.create({ ...postpago, paymentMethod: 'TARJETA' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('postpago sin membresía se rechaza', async () => {
    repo.vehicle.mockResolvedValueOnce({ id: 'vehicle', membership: null });
    await expect(service.create(postpago)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('POSTPAGO con reserva de otra membresía se rechaza', async () => {
    authorizations.byId.mockResolvedValueOnce({
      ...reservation,
      membershipId: 'otra',
    });
    await expect(service.create(postpago)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('POSTPAGO con reserva de otra estación o combustible se rechaza', async () => {
    authorizations.byId.mockResolvedValueOnce({
      ...reservation,
      stationId: 'otra',
    });
    await expect(service.create(postpago)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    authorizations.byId.mockResolvedValueOnce({
      ...reservation,
      fuelId: 'otro',
    });
    await expect(service.create(postpago)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('POSTPAGO con reserva ya liquidada entra en conflicto', async () => {
    authorizations.byId.mockResolvedValueOnce({
      ...reservation,
      status: 'SETTLED',
    });
    await expect(service.create(postpago)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('POSTPAGO que supera el importe reservado se rechaza', async () => {
    await expect(
      service.create({ ...postpago, amount: '250.00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('POSTPAGO consume exactamente lo reservado sin liberar excedente', async () => {
    authorizations.byId.mockResolvedValue({
      ...reservation,
      dispensedAmount: new Prisma.Decimal('200'),
      dispensedGallons: new Prisma.Decimal('9.390'),
    });
    await expect(
      service.create({ ...postpago, amount: '200.00', gallons: '9.390' }),
    ).resolves.toBeDefined();
    expect(wallet.setBalance).not.toHaveBeenCalled();
  });

  // ---------- Código de membresía ----------

  it('RECHUZA un código de membresía que no corresponde a la placa', async () => {
    await expect(
      service.create({ ...postpago, membershipCode: 'PX-004821' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('acepta el código correcto y lo persiste como evidencia', async () => {
    await expect(service.create(postpago)).resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ membershipCode: 'PRIME-0001' }),
      tx,
    );
  });

  // ---------- Importe vs galones ----------

  it('acepta el importe que coincide con el volumen despachado', async () => {
    authorizations.byId.mockResolvedValue({
      ...reservation,
      id: 'auth-pre',
      mode: 'PREPAGO',
      paymentId: 'paid',
      dispensedAmount: new Prisma.Decimal('199.99'),
      dispensedGallons: new Prisma.Decimal('9.389'),
    });
    await expect(
      service.create({ ...prepago, amount: '199.99', gallons: '9.389' }),
    ).resolves.toBeDefined();
  });

  it('RECHUZA un importe que no corresponde al volumen despachado', async () => {
    await expect(
      service.create({ ...prepago, amount: '500.00', gallons: '9.390' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rechaza montos inválidos antes de escribir', async () => {
    await expect(
      service.create({ ...prepago, amount: '0' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rechaza combustible inactivo', async () => {
    repo.fuel.mockResolvedValueOnce({ active: false });
    await expect(service.create(prepago)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  // ---------- Idempotencia ----------

  it('reintento idéntico devuelve la compra original sin duplicarla', async () => {
    await service.create(prepago);
    const existing = (await repo.create.mock.results[0]
      .value) as TransactionModel;
    repo.byOperation.mockResolvedValueOnce(existing);
    const result = await service.create({ ...prepago, amount: '100' });
    expect(result.replayed).toBe(true);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('conflicto al reutilizar operationId con otro monto', async () => {
    repo.byOperation.mockResolvedValueOnce({ requestHash: 'other' });
    await expect(service.create(prepago)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
