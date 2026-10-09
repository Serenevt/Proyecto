import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RewardsRepository } from './rewards.repository';
import { RewardsService } from './rewards.service';
describe('RewardsService', () => {
  const tx = {} as Prisma.TransactionClient;
  const repo = {
    atomic: <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => fn(tx),
    membership: jest.fn(),
    byOperation: jest.fn(),
    benefit: jest.fn(),
    balance: jest.fn(),
    create: jest.fn(),
  };
  const service = new RewardsService(repo as unknown as RewardsRepository);
  beforeEach(() => {
    repo.membership.mockResolvedValue({
      id: 'member',
      status: 'ACTIVE',
      user: { active: true },
    });
    repo.byOperation.mockResolvedValue(null);
    repo.benefit.mockResolvedValue({
      id: 'coffee',
      active: true,
      pointsCost: 400,
    });
    repo.balance.mockResolvedValue(500);
    repo.create.mockResolvedValue({ id: 'coupon', pointsSpent: 400 });
  });
  it('canje con puntos suficientes genera débito trazable', async () => {
    expect(
      (await service.redeem('user', { operationId: 'op', benefitId: 'coffee' }))
        .redemption.pointsSpent,
    ).toBe(400);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        rewardMovement: {
          create: { membershipId: 'member', points: -400, kind: 'REDEEM' },
        },
      }),
      tx,
    );
  });
  it('rechaza puntos insuficientes sin escribir', async () => {
    repo.balance.mockResolvedValueOnce(399);
    await expect(
      service.redeem('user', { operationId: 'op', benefitId: 'coffee' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });
  it('reintento de canje no vuelve a gastar puntos', async () => {
    repo.byOperation.mockResolvedValueOnce({
      id: 'coupon',
      membershipId: 'member',
      benefitId: 'coffee',
    });
    expect(
      (await service.redeem('user', { operationId: 'op', benefitId: 'coffee' }))
        .replayed,
    ).toBe(true);
    expect(repo.create).not.toHaveBeenCalled();
  });
});
