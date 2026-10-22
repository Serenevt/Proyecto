import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, WalletMovementKind } from '@prisma/client';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';

function harness(balance = '100.00') {
  const txDb = {
    membershipDebt: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountPending: null } }),
    },
    membership: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'm1',
        status: 'ACTIVE',
        user: { active: true },
        balance: new Prisma.Decimal(balance),
      }),
      update: jest.fn(),
    },
  };
  const repo = {
    atomic: <T>(fn: (c: unknown) => Promise<T>) => fn(txDb),
    byOperation: jest.fn().mockResolvedValue(null),
    lockMembership: jest.fn(),
    setBalance: jest.fn(),
    movement: jest.fn(async (d: Record<string, unknown>) => ({
      id: 'wm-1',
      ...d,
    })),
  };
  const service = new WalletService(repo as unknown as WalletRepository);
  return { service, repo, txDb };
}

const dto = {
  operationId: '22222222-2222-4222-8222-222222222222',
  amount: '250.00',
};

describe('WalletService (recarga de saldo Prime)', () => {
  it('acredita el saldo y registra el movimiento', async () => {
    const { service, repo } = harness('100.00');
    const result = await service.recharge('u1', dto);
    expect(result.replayed).toBe(false);
    expect(result.balance).toBe('350.00');
    expect(repo.setBalance).toHaveBeenCalledWith(
      'm1',
      new Prisma.Decimal('350.00'),
      expect.anything(),
    );
    expect(repo.movement).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: WalletMovementKind.RECHARGE,
        amount: new Prisma.Decimal('250.00'),
        balanceAfter: new Prisma.Decimal('350.00'),
      }),
      expect.anything(),
    );
  });

  it('bloquea la fila de la membresía para serializar recargas', async () => {
    const { service, repo } = harness();
    await service.recharge('u1', dto);
    expect(repo.setBalance).toHaveBeenCalled();
  });

  it('reintento con el mismo operationId no acredita dos veces', async () => {
    const { service, repo } = harness();
    repo.byOperation.mockResolvedValueOnce({
      id: 'wm-1',
      membershipId: 'm1',
      amount: new Prisma.Decimal(dto.amount),
      kind: WalletMovementKind.RECHARGE,
    });
    const result = await service.recharge('u1', dto);
    expect(result.replayed).toBe(true);
    expect(repo.setBalance).not.toHaveBeenCalled();
  });

  it('rechaza montos no positivos o mal formados', async () => {
    const { service } = harness();
    await expect(
      service.recharge('u1', { operationId: dto.operationId, amount: '0' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.recharge('u1', { operationId: dto.operationId, amount: '-10' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si la membresía está inactiva', async () => {
    const { service, txDb } = harness();
    txDb.membership.findUnique.mockResolvedValue({
      id: 'm1',
      status: 'SUSPENDED',
      user: { active: true },
      balance: new Prisma.Decimal('0'),
    });
    await expect(service.recharge('u1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza si el usuario no tiene membresía', async () => {
    const { service, txDb } = harness();
    txDb.membership.findUnique.mockResolvedValue(null);
    await expect(service.recharge('u1', dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
