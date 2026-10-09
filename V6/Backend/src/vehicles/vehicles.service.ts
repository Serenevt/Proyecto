import { Injectable, NotFoundException } from '@nestjs/common';
import { Actor } from '../auth/access';
import { PaginationDto } from '../common/pagination.dto';
import { normalizePlate } from './plate.dto';
import { VehiclesRepository } from './vehicles.repository';
@Injectable()
export class VehiclesService {
  constructor(private readonly repo: VehiclesRepository) {}
  async findByPlate(plate: string, actor: Actor) {
    const vehicle = await this.repo.findByPlate(
      normalizePlate(plate) as string,
    );
    if (
      !vehicle ||
      (actor.kind === 'member' && vehicle.membership?.userId !== actor.userId)
    )
      throw new NotFoundException('Vehículo no encontrado');
    return {
      id: vehicle.id,
      plate: vehicle.plate,
      label: vehicle.label,
      membership: vehicle.membership
        ? {
            id: vehicle.membership.id,
            number: vehicle.membership.number,
            status: vehicle.membership.status,
          }
        : null,
    };
  }
  list(actor: Actor, query: PaginationDto) {
    return actor.kind === 'member' ? this.repo.list(actor.userId, query) : [];
  }
}
