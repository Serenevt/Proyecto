import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class StationsRepository {
  constructor(private readonly db: PrismaService) {}
  list() {
    return this.db.station.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
    });
  }
}
