import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PointsPolicyService } from './points-policy.service';

const policy = new PointsPolicyService(
  new ConfigService({ POINTS_PER_SOL: '1' }),
);

describe('PointsPolicyService', () => {
  it('acepta el importe del caso auditado (9.390 gal x 21.30 = 200.01)', () => {
    expect(() =>
      policy.assertMatchesDispatch(
        new Prisma.Decimal('200.01'),
        new Prisma.Decimal('9.390'),
        new Prisma.Decimal('21.30'),
      ),
    ).not.toThrow();
  });

  it('acepta el importe exacto sin galones informados', () => {
    expect(() =>
      policy.assertMatchesDispatch(
        new Prisma.Decimal('150.00'),
        null,
        new Prisma.Decimal('21.30'),
      ),
    ).not.toThrow();
  });

  it('RECHAZA un importe que no corresponde al volumen despachado', () => {
    expect(() =>
      policy.assertMatchesDispatch(
        new Prisma.Decimal('500.00'),
        new Prisma.Decimal('9.390'),
        new Prisma.Decimal('21.30'),
      ),
    ).toThrow(BadRequestException);
  });

  it('tolera desviaciones de hasta 0.02 PEN', () => {
    // 9.390 gal x 21.30 = 200.007 -> esperado 200.01
    // 200.01 -> 0.00;  199.99 y 200.03 -> 0.02 (límite, aceptado)
    for (const amount of ['200.01', '199.99', '200.03'])
      expect(() =>
        policy.assertMatchesDispatch(
          new Prisma.Decimal(amount),
          new Prisma.Decimal('9.390'),
          new Prisma.Decimal('21.30'),
        ),
      ).not.toThrow();
    // 199.98 -> 0.03 y 200.04 -> 0.03: superan la tolerancia.
    for (const amount of ['199.98', '200.04'])
      expect(() =>
        policy.assertMatchesDispatch(
          new Prisma.Decimal(amount),
          new Prisma.Decimal('9.390'),
          new Prisma.Decimal('21.30'),
        ),
      ).toThrow(BadRequestException);
  });

  it('valida el formato y la positividad del monto', () => {
    expect(() => policy.amount('0')).toThrow(BadRequestException);
    expect(() => policy.amount('-5')).toThrow(BadRequestException);
    expect(() => policy.amount('20,50')).toThrow(BadRequestException);
    expect(() => policy.amount('20.555')).toThrow(BadRequestException);
    expect(policy.amount('199.99').toFixed(2)).toBe('199.99');
  });

  it('calcula puntos sobre el importe cobrado', () => {
    expect(policy.calculate(new Prisma.Decimal('199.99'))).toBe(199);
    expect(policy.calculate(new Prisma.Decimal('100.00'))).toBe(100);
  });
});
