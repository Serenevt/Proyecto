import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PointsPolicyService } from '../rewards/points-policy.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateTransactionDto } from './create-transaction.dto';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';
import { TransactionModel } from './transaction.model';
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
  const policy = new PointsPolicyService(
    new ConfigService({ POINTS_PER_SOL: '1' }),
  );
  const service = new TransactionsService(
    repo as unknown as TransactionsRepository,
    policy,
    new PaymentsService(),
  );
  const dto: CreateTransactionDto = {
    operationId: 'operation',
    plate: 'ABC-123',
    amount: '100.00',
    stationId: 'station',
    fuelId: 'fuel',
    mode: 'PREPAGO',
    paymentMethod: 'TARJETA',
    receiptType: 'BOLETA',
  };
  beforeEach(() => {
    repo.byOperation.mockResolvedValue(null);
    repo.vehicle.mockResolvedValue({
      id: 'vehicle',
      membership: { id: 'member', status: 'ACTIVE', user: { active: true } },
    });
    repo.fuel.mockResolvedValue({
      id: 'fuel',
      active: true,
      pricePerGallon: new Prisma.Decimal('23.50'),
    });
    repo.station.mockResolvedValue({ id: 'station', active: true });
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
  it('crea compra, pago y movimiento de +100 en una operación atómica', async () => {
    const result = await service.create(dto);
    expect(result.pointsEarned).toBe(100);
    expect(result.transaction.amount).toBe('100.00');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment: { create: expect.objectContaining({ status: 'CAPTURED' }) },
        rewardMovement: {
          create: { membershipId: 'member', points: 100, kind: 'EARN' },
        },
      }),
      tx,
    );
  });
  it('compra sin membresía obtiene cero puntos', async () => {
    repo.vehicle.mockResolvedValueOnce({ id: 'vehicle', membership: null });
    expect((await service.create(dto)).pointsEarned).toBe(0);
    expect(repo.create.mock.calls[0][0]).not.toHaveProperty('rewardMovement');
  });
  it('membresía suspendida no gana puntos', async () => {
    repo.vehicle.mockResolvedValueOnce({
      id: 'vehicle',
      membership: { id: 'member', status: 'SUSPENDED', user: { active: true } },
    });
    expect((await service.create(dto)).pointsEarned).toBe(0);
  });
  it('postpago sin membresía se rechaza', async () => {
    repo.vehicle.mockResolvedValueOnce({ id: 'vehicle', membership: null });
    await expect(
      service.create({ ...dto, mode: 'POSTPAGO', paymentMethod: 'PEAJE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rechaza monto inválido antes de escribir', async () => {
    await expect(
      service.create({ ...dto, amount: '0' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });
  it('rechaza combustible inactivo', async () => {
    repo.fuel.mockResolvedValueOnce({ active: false });
    await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.create).not.toHaveBeenCalled();
  });
  it('reintento idéntico devuelve la compra original sin duplicarla', async () => {
    await service.create(dto);
    const existing = (await repo.create.mock.results[0]
      .value) as TransactionModel;
    repo.byOperation.mockResolvedValueOnce(existing);
    const result = await service.create({
      ...dto,
      amount: '100',
      plate: 'abc123',
    });
    expect(result.replayed).toBe(true);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
  it('conflicto al reutilizar operationId con otro monto', async () => {
    repo.byOperation.mockResolvedValueOnce({ requestHash: 'other' });
    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
  });
});
