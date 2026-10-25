import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentsService } from '../payments/payments.service';
import { Prisma, WalletMovementKind } from '@prisma/client';
import { createHash } from 'node:crypto';
import { WalletRepository } from '../wallet/wallet.repository';
import { AuthorizationsRepository } from './authorizations.repository';
import { AuthorizationsService } from './authorizations.service';

const VEHICLE_WITH_MEMBERSHIP = {
  id: 'v1',
  membership: {
    id: 'm1',
    number: 'PRIME-0001',
    status: 'ACTIVE',
    user: { active: true },
  },
};

const dto = {
  operationId: '11111111-1111-4111-8111-111111111111',
  plate: 'ABC-123',
  amount: '200.00',
  membershipCode: 'PRIME-0001',
  stationId: 's1',
  fuelId: 'f1',
  receiptType: 'BOLETA' as const,
};

function harness(balance = '500.00') {
  const txDb = {
    fuelInventory: { findUnique: jest.fn().mockResolvedValue({liters:new Prisma.Decimal(5000)}) },
    membershipDebt: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountPending: null } }),
    },
    fuelAuthorization: { findMany: jest.fn().mockResolvedValue([]) },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue(VEHICLE_WITH_MEMBERSHIP),
    },
    fuel: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 'f1',
          active: true,
          pricePerGallon: new Prisma.Decimal('23.50'),
        }),
    },
    station: {
      findUnique: jest.fn().mockResolvedValue({ id: 's1', active: true }),
    },
    membership: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'm1',
        number: 'PRIME-0001',
        balance: new Prisma.Decimal(balance),
      }),
    },
  };
  const authRepo = {
    // atomic debe entregar el cliente simulado al callback del servicio.
    atomic: <T>(fn: (c: unknown) => Promise<T>) => fn(txDb),
    byOperation: jest.fn().mockResolvedValue(null),
    byId: jest.fn(),
    create: jest.fn(async (data: Record<string, unknown>) => ({
      ...data,
      id: 'auth-1',
      consumedAmount: null,
      status: 'RESERVED',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })),
    settle: jest.fn(async (_id: string, data: Record<string, unknown>) => ({
      id: 'auth-1',
      authorizedAmount: new Prisma.Decimal('200.00'),
      reservedAmount: new Prisma.Decimal('200.00'),
      consumedAmount: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...data,
    })),
  };
  const wallet = {
    lockMembership: jest.fn(),
    setBalance: jest.fn(),
    movement: jest.fn(),
  };
  const service = new AuthorizationsService(
    authRepo as unknown as AuthorizationsRepository,
    wallet as unknown as WalletRepository,
    new PaymentsService(),
  );
  return { service, authRepo, wallet, txDb };
}

describe('AuthorizationsService (reserva de saldo postpago)', () => {
  it('reserva el importe autorizado y lo descuenta del saldo', async () => {
    const { service, wallet } = harness('500.00');
    const result = await service.create(dto);
    expect(result.authorization.reservedAmount).toBe('200.00');
    expect(result.replayed).toBe(false);
    expect(wallet.setBalance).toHaveBeenCalledWith(
      'm1',
      new Prisma.Decimal('300.00'),
      expect.anything(),
    );
    expect(wallet.movement).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: WalletMovementKind.RESERVE,
        amount: new Prisma.Decimal('-200.00'),
      }),
      expect.anything(),
    );
  });

  it('RECHUZA un código de membresía que no corresponde a la placa', async () => {
    const { service, wallet } = harness();
    await expect(
      service.create({ ...dto, membershipCode: 'PX-004821' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(wallet.setBalance).not.toHaveBeenCalled();
  });

  it('RECHUZA vehículo sin membresía', async () => {
    const { service, txDb, wallet } = harness();
    txDb.vehicle.findUnique.mockResolvedValue({ id: 'v1', membership: null });
    await expect(service.create(dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(wallet.setBalance).not.toHaveBeenCalled();
  });

  it('RECHUZA membresía suspendida', async () => {
    const { service, txDb } = harness();
    txDb.vehicle.findUnique.mockResolvedValue({
      id: 'v1',
      membership: {
        ...VEHICLE_WITH_MEMBERSHIP.membership,
        status: 'SUSPENDED',
      },
    });
    await expect(service.create(dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('RECHUZA saldo insuficiente sin descontar nada', async () => {
    const { service, wallet } = harness('50.00');
    await expect(service.create(dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(wallet.setBalance).not.toHaveBeenCalled();
    expect(wallet.movement).not.toHaveBeenCalled();
  });

  it('reintento idéntico no vuelve a descontar', async () => {
    const { service, authRepo, wallet } = harness();
    authRepo.byOperation.mockResolvedValueOnce({
      id: 'auth-1',
      requestHash: createHash('sha256')
        .update(
          JSON.stringify({
            plate: 'ABC-123',
            amount: '200.00',
            code: 'PRIME-0001',
            stationId: 's1',
            fuelId: 'f1',
            receiptType: 'BOLETA',
            allowDebt: false,
          }),
        )
        .digest('hex'),
      authorizedAmount: new Prisma.Decimal('200.00'),
      reservedAmount: new Prisma.Decimal('200.00'),
      consumedAmount: null,
      releasedAmount: new Prisma.Decimal('0'),
      status: 'RESERVED',
      createdAt: new Date(),
    });
    const result = await service.create(dto);
    expect(result.replayed).toBe(true);
    expect(wallet.setBalance).not.toHaveBeenCalled();
  });

  it('conflicto si el operationId se reutiliza con otro importe', async () => {
    const { service, authRepo } = harness();
    authRepo.byOperation.mockResolvedValueOnce({ requestHash: 'otro-hash' });
    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('libera la reserva y devuelve el saldo si el cliente aborta', async () => {
    const { service, authRepo, wallet } = harness('300.00');
    authRepo.byId.mockResolvedValue({
      id: 'auth-1',
      membershipId: 'm1',
      mode: 'POSTPAGO',
      reservedAmount: new Prisma.Decimal('200.00'),
      status: 'RESERVED',
    });
    const result = await service.release('auth-1');
    expect(wallet.setBalance).toHaveBeenCalledWith(
      'm1',
      new Prisma.Decimal('500.00'),
      expect.anything(),
    );
    expect(result.status).toBe('RELEASED');
    expect(result.releasedAmount).toBe('200.00');
  });

  it('no libera dos veces la misma reserva', async () => {
    const { service, authRepo, wallet } = harness();
    authRepo.byId.mockResolvedValue({
      id: 'auth-1',
      membershipId: 'm1',
      mode: 'POSTPAGO',
      reservedAmount: new Prisma.Decimal('200.00'),
      status: 'RELEASED',
    });
    await expect(service.release('auth-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(wallet.setBalance).not.toHaveBeenCalled();
  });

  it('rechaza reserva de vehículo inexistente', async () => {
    const { service, txDb } = harness();
    txDb.vehicle.findUnique.mockResolvedValue(null);
    await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza combustible inactivo', async () => {
    const { service, txDb } = harness();
    txDb.fuel.findUnique.mockResolvedValue({ id: 'f1', active: false });
    await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza estación inactiva', async () => {
    const { service, txDb } = harness();
    txDb.station.findUnique.mockResolvedValue({ id: 's1', active: false });
    await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza montos no positivos o fuera de rango', () => {
    // create() lanza de forma síncrona antes de abrir la transacción.
    const { service } = harness();
    expect(() => service.create({ ...dto, amount: '0' })).toThrow(
      BadRequestException,
    );
    expect(() => service.create({ ...dto, amount: '99999999.00' })).toThrow(
      BadRequestException,
    );
  });
});
// ---------- Avance, liquidación y recuperación ----------

describe('AuthorizationsService (abastecimiento y liquidación)', () => {
  const reservation = (overrides: Record<string, unknown> = {}) => ({
    id: 'auth-1',
    mode: 'POSTPAGO',
    unitPrice: new Prisma.Decimal('23.50'),
    membershipId: 'm1',
    stationId: 's1',
    fuelId: 'f1',
    authorizedAmount: new Prisma.Decimal('100.00'),
    reservedAmount: new Prisma.Decimal('100.00'),
    consumedAmount: null,
    releasedAmount: new Prisma.Decimal('0'),
    dispensedAmount: new Prisma.Decimal('0'),
    dispensedGallons: new Prisma.Decimal('0'),
    status: 'RESERVED',
    outcome: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

  function dispensingHarness(balance = '300.00') {
    const txDb = {
    fuelInventory: { findUnique: jest.fn().mockResolvedValue({liters:new Prisma.Decimal(5000)}) },
      membership: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'm1',
          balance: new Prisma.Decimal(balance),
        }),
      },
    };
    const authRepo = {
      atomic: <T>(fn: (c: unknown) => Promise<T>) => fn(txDb),
      byId: jest.fn(),
      settle: jest.fn(async (_id: string, data: Record<string, unknown>) => ({
        ...reservation(),
        ...data,
      })),
      active: jest.fn().mockResolvedValue([]),
      pendingOlderThan: jest.fn().mockResolvedValue([]),
      client: jest.fn().mockReturnValue(txDb),
    };
    const wallet = {
      lockMembership: jest.fn(),
      setBalance: jest.fn(),
      movement: jest.fn(),
    };
    const service = new AuthorizationsService(
      authRepo as unknown as AuthorizationsRepository,
      wallet as unknown as WalletRepository,
      new PaymentsService(),
    );
    return { service, authRepo, wallet, txDb };
  }

  it('registra el avance y pasa la reserva a DISPENSING', async () => {
    const { service, authRepo } = dispensingHarness();
    authRepo.byId.mockResolvedValue(reservation());
    const result = await service.progress('auth-1', {
      amount: '43.50',
      gallons: '1.851',
    });
    expect(result.dispensedAmount).toBe('43.50');
    expect(result.dispensedGallons).toBe('1.851');
    expect(authRepo.settle).toHaveBeenCalledWith(
      'auth-1',
      expect.objectContaining({
        dispensedAmount: new Prisma.Decimal('43.50'),
        status: 'DISPENSING',
      }),
      expect.anything(),
    );
  });

  it('RECHUZA un avance por encima de lo reservado', async () => {
    const { service, authRepo } = dispensingHarness();
    authRepo.byId.mockResolvedValue(reservation());
    await expect(
      service.progress('auth-1', { amount: '100.01', gallons: '4.000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ignora un avance que retrocede', async () => {
    const { service, authRepo } = dispensingHarness();
    authRepo.byId.mockResolvedValue(
      reservation({
        status: 'DISPENSING',
        dispensedAmount: new Prisma.Decimal('40.00'),
        dispensedGallons: new Prisma.Decimal('1.700'),
      }),
    );
    const result = await service.progress('auth-1', {
      amount: '20.00',
      gallons: '0.851',
    });
    expect(result.dispensedAmount).toBe('40.00');
    expect(authRepo.settle).not.toHaveBeenCalled();
  });

  it('Detener cobra solo lo consumido y libera el excedente (caso 300/100/43.50)', async () => {
    const { service, authRepo, wallet } = dispensingHarness('200.00');
    authRepo.byId.mockResolvedValue(
      reservation({ dispensedAmount: new Prisma.Decimal('43.50') }),
    );
    const result = await service.settle(
      'auth-1',
      new Prisma.Decimal('43.50'),
      'MANUAL' as never,
    );
    expect(wallet.setBalance).toHaveBeenCalledWith(
      'm1',
      new Prisma.Decimal('256.50'),
      expect.anything(),
    );
    expect(wallet.movement).toHaveBeenCalledWith(
      expect.objectContaining({ amount: new Prisma.Decimal('56.50') }),
      expect.anything(),
    );
    expect(result.excess.toFixed(2)).toBe('56.50');
  });

  it('un consumo igual a lo reservado no libera nada', async () => {
    const { service, authRepo, wallet } = dispensingHarness('200.00');
    authRepo.byId.mockResolvedValue(
      reservation({ dispensedAmount: new Prisma.Decimal('100') }),
    );
    await service.settle(
      'auth-1',
      new Prisma.Decimal('100.00'),
      'AUTO' as never,
    );
    expect(wallet.setBalance).not.toHaveBeenCalled();
    expect(wallet.movement).not.toHaveBeenCalled();
  });

  it('RECHUZA liquidar más de lo reservado', async () => {
    const { service, authRepo, wallet } = dispensingHarness();
    authRepo.byId.mockResolvedValue(reservation());
    await expect(
      service.settle('auth-1', new Prisma.Decimal('100.01'), 'AUTO' as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(wallet.setBalance).not.toHaveBeenCalled();
  });

  it('no liquida dos veces la misma reserva', async () => {
    const { service, authRepo, wallet } = dispensingHarness();
    authRepo.byId.mockResolvedValue(reservation({ status: 'SETTLED' }));
    await expect(
      service.settle('auth-1', new Prisma.Decimal('10.00'), 'MANUAL' as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(wallet.setBalance).not.toHaveBeenCalled();
  });

  it('no registra avance sobre una reserva ya liquidada', async () => {
    const { service, authRepo } = dispensingHarness();
    authRepo.byId.mockResolvedValue(reservation({ status: 'SETTLED' }));
    await expect(
      service.progress('auth-1', { amount: '5.00', gallons: '0.200' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('pendingBefore lista reservas antiguas sin liberarlas', async () => {
    const { service, authRepo, wallet } = dispensingHarness();
    authRepo.pendingOlderThan.mockResolvedValueOnce([
      {
        id: 'auth-old',
        status: 'RESERVED',
        authorizedAmount: new Prisma.Decimal('100.00'),
        dispensedAmount: new Prisma.Decimal('0'),
        dispensedGallons: new Prisma.Decimal('0'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const rows = await service.pendingBefore(30);
    expect(rows).toHaveLength(1);
    expect(rows[0].authorizedAmount).toBe('100.00');
    expect(wallet.setBalance).not.toHaveBeenCalled();
  });
});
