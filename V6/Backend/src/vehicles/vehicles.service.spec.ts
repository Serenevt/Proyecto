import { NotFoundException } from '@nestjs/common';
import { VehiclesRepository } from './vehicles.repository';
import { VehiclesService } from './vehicles.service';
describe('VehiclesService', () => {
  const repo = { findByPlate: jest.fn() };
  const service = new VehiclesService(repo as unknown as VehiclesRepository);
  beforeEach(() =>
    repo.findByPlate.mockResolvedValue({
      id: 'v',
      plate: 'ABC-123',
      label: 'Mi auto',
      membership: {
        id: 'm',
        number: 'PRIME-0001',
        userId: 'u',
        status: 'ACTIVE',
      },
    }),
  );
  it('normaliza y encuentra la placa', async () => {
    expect(
      (await service.findByPlate(' abc123 ', { kind: 'kiosk' })).plate,
    ).toBe('ABC-123');
    expect(repo.findByPlate).toHaveBeenCalledWith('ABC-123');
  });
  it('rechaza vehículo inexistente', async () => {
    repo.findByPlate.mockResolvedValueOnce(null);
    await expect(
      service.findByPlate('ZZZ-123', { kind: 'kiosk' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('oculta vehículos de otros socios', async () => {
    await expect(
      service.findByPlate('ABC-123', { kind: 'member', userId: 'other' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
