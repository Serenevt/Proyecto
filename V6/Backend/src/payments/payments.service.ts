import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma, PurchaseMode } from '@prisma/client';
@Injectable()
export class PaymentsService {
  // This phase records an already confirmed DEMO payment; no gateway call is made.
  captured(amount: Prisma.Decimal, method: PaymentMethod, mode: PurchaseMode) {
    if ((mode === PurchaseMode.POSTPAGO) !== (method === PaymentMethod.PEAJE))
      throw new BadRequestException(
        'POSTPAGO requiere PEAJE; PREPAGO requiere otro método',
      );
    return { amount, method, status: 'CAPTURED' as const, provider: 'DEMO' };
  }
}
