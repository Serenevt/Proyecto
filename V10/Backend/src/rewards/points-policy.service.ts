import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

/**
 * Tolerancia máxima, en soles, entre el importe cobrado y el valor del
 * combustible realmente despachado (gallons × unitPrice).
 *
 * El surtidor entrega galones con 3 decimales y el precio con 2, así que el
 * producto tiene hasta 5 decimales. Redondear a 2 puede mover el resultado
 * hasta ±0.005, y el redondeo de los galones mostrados añade un margen
 * pequeño. 0.02 PEN absorbe esa diferencia sin tolerar desvíos reales.
 *
 * Antes esta comprobación no existía: el backend aceptaba cualquier importe
 * declarado por el navegador (origen del S/ 199.99 reportado en la auditoría).
 */
export const MAX_AMOUNT_GALLONS_TOLERANCE = new Prisma.Decimal('0.02');

@Injectable()
export class PointsPolicyService {
  readonly rate: Prisma.Decimal;
  readonly solesPerPoint: Prisma.Decimal;
  constructor(config: ConfigService) {
    this.solesPerPoint = new Prisma.Decimal(config.getOrThrow<string>('SOLES_PER_POINT'));
    // Legacy API snapshot only; calculation uses the exact divisor.
    this.rate = new Prisma.Decimal(1).div(this.solesPerPoint);
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
  /** Importe esperado según lo despachado. */
  expected(gallons: Prisma.Decimal, unitPrice: Prisma.Decimal) {
    return gallons
      .mul(unitPrice)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  /**
   * Verifica que el importe cobrado corresponda al combustible servido.
   * Si no se informan galones (compra sin volumen) no hay contra qué comparar.
   */
  assertMatchesDispatch(
    amount: Prisma.Decimal,
    gallons: Prisma.Decimal | null,
    unitPrice: Prisma.Decimal,
  ) {
    if (!gallons) return;
    const difference = this.expected(gallons, unitPrice).minus(amount).abs();
    if (difference.gt(MAX_AMOUNT_GALLONS_TOLERANCE))
      throw new BadRequestException(
        'El importe no coincide con el volumen despachado',
      );
  }
  calculate(amount: Prisma.Decimal): number {
    return amount.div(this.solesPerPoint).floor().toNumber();
  }
}
