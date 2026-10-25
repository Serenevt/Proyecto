import { Prisma } from '@prisma/client';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateVehicleDto } from './create-vehicle.dto';
import { Actor } from '../auth/access';
import { PaginationDto } from '../common/pagination.dto';
import { normalizePlate } from './plate.dto';
import { VehiclesRepository } from './vehicles.repository';
@Injectable()
export class VehiclesService {
  constructor(private readonly repo: VehiclesRepository) {}
  membership(number: string) { return this.repo.membership(number); }
  async create(dto: CreateVehicleDto, actor: Actor) {
    if (actor.kind !== 'member') throw new ForbiddenException();
    const plate = normalizePlate(dto.plate) as string;
    await this.repo.link(actor.userId, plate, dto.label);
    return this.findByPlate(plate, actor);
  }
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
            name: vehicle.membership.user.name,
            balance: vehicle.membership.balance.toFixed(2),
            dni: vehicle.membership.dni,
            ruc: vehicle.membership.ruc,
            businessName: vehicle.membership.businessName,
            pendingBalance: vehicle.membership.debts
              .reduce(
                (sum, d) => sum.plus(d.amountPending),
                new Prisma.Decimal(0),
              )
              .toFixed(2),
          }
        : null,
    };
  }
  list(actor: Actor, query: PaginationDto) {
    return actor.kind === 'member' ? this.repo.list(actor.userId, query) : [];
  }
}
