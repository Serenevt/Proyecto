import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
@Injectable()
export class PointsPolicyService {
  readonly rate: Prisma.Decimal;
  constructor(config: ConfigService) {
    this.rate = new Prisma.Decimal(config.getOrThrow<string>('POINTS_PER_SOL'));
  }
  amount(value: string): Prisma.Decimal {
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(value))
      throw new BadRequestException(
        'Monto inválido: usa soles con hasta dos decimales',
      );
    const amount = new Prisma.Decimal(value);
    if (amount.lte(0))
      throw new BadRequestException('El monto debe ser positivo');
    return amount;
  }
  calculate(amount: Prisma.Decimal): number {
    return amount.mul(this.rate).floor().toNumber();
  }
}
