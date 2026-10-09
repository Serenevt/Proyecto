import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class BenefitsRepository {
  constructor(private readonly db: PrismaService) {}
  list() {
    return this.db.benefit.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
    });
  }
}
