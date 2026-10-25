import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXTERNAL_METHODS, PaymentsService } from './payments.service';

describe('PaymentsService (reglas por modalidad)', () => {
  const service = new PaymentsService();
  const amount = new Prisma.Decimal('100.00');

  it('PREPAGO simula efectivo/tarjeta y exige proveedor para Yape/Plin', () => {
    for (const method of EXTERNAL_METHODS) {
      if (['YAPE','PLIN'].includes(method)) { expect(()=>service.authorize(amount,method,'PREPAGO')).toThrow(BadRequestException); continue; }
      const result = service.authorize(amount, method, 'PREPAGO');
      expect(result.status).toBe('CAPTURED');
      expect(result.provider).toBe('DEMO');
    }
  });

  it('PREPAGO rechaza SALDO_PRIME: el prepago nunca toca la membresía', () => {
    expect(() => service.authorize(amount, 'SALDO_PRIME', 'PREPAGO')).toThrow(
      BadRequestException,
    );
  });

  it('POSTPAGO usa exclusivamente SALDO_PRIME', () => {
    const result = service.authorize(amount, 'SALDO_PRIME', 'POSTPAGO');
    expect(result.method).toBe('SALDO_PRIME');
    for (const method of EXTERNAL_METHODS) {
      expect(() => service.authorize(amount, method, 'POSTPAGO')).toThrow(
        BadRequestException,
      );
    }
  });

  it('no invoca ninguna pasarela: el proveedor queda marcado como DEMO', () => {
    expect(service.authorize(amount, 'TARJETA', 'PREPAGO').provider).toBe(
      'DEMO',
    );
    expect(service.authorize(amount, 'SALDO_PRIME', 'POSTPAGO').provider).toBe(
      'DEMO',
    );
  });
});
