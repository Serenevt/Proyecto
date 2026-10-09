import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/pagination.dto';
@Injectable()
export class VehiclesRepository {
  constructor(private readonly db: PrismaService) {}
  findByPlate(plate: string) {
    return this.db.vehicle.findUnique({
      where: { plate },
      include: {
        membership: {
          select: { id: true, number: true, status: true, userId: true },
        },
      },
    });
  }
  list(userId: string, query: PaginationDto) {
    return this.db.vehicle.findMany({
      where: { membership: { userId } },
      orderBy: { plate: 'asc' },
      take: query.limit,
      skip: (query.page - 1) * query.limit,
    });
  }
}
