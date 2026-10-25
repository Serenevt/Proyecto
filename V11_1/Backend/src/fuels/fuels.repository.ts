import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class FuelsRepository {
  constructor(private readonly db: PrismaService) {}
  inventory() {
    return this.db.fuelInventory.findMany({ include: { fuel: true, station: true } });
  }
  list() {
    return this.db.fuel.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
    });
  }
}
