import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma, PurchaseMode } from '@prisma/client';

/** Medios de pago externos. El prepago solo admite estos. */
export const EXTERNAL_METHODS: readonly PaymentMethod[] = [
  PaymentMethod.EFECTIVO,
  PaymentMethod.TARJETA,
  PaymentMethod.YAPE,
  PaymentMethod.PLIN,
];

@Injectable()
export class PaymentsService {
  /**
   * Registra el resultado de un pago. Este prototipo NO ejecuta cobros: no hay
   * pasarela bancaria, no hay circuito de surtidor. La autorización es
   * determinista y siempre favorable, y se persiste con provider 'DEMO' para
   * que el origen simulado sea visible en la base de datos.
   *
   * PREPAGO  -> medio externo (EFECTIVO, TARJETA, YAPE, PLIN). Nunca toca el
   *             saldo de la membresía: el dinero sale del medio del cliente.
   * POSTPAGO -> SALDO_PRIME exclusivamente. El saldo ya fue descontado al
   *             reservar, antes del abastecimiento; aquí solo seasienta el
   *             consumo real y se libera el excedente.
   */
  authorize(amount: Prisma.Decimal, method: PaymentMethod, mode: PurchaseMode) {
    if (mode === PurchaseMode.PREPAGO) {
      if (!EXTERNAL_METHODS.includes(method))
        throw new BadRequestException(
          'El prepago requiere efectivo, tarjeta, Yape o Plin',
        );
    } else if (method !== PaymentMethod.SALDO_PRIME) {
      throw new BadRequestException(
        'El postpago requiere cargo al saldo Primax Prime',
      );
    }
    return {
      amount,
      method,
      status: 'CAPTURED' as const,
      provider: 'DEMO',
    };
  }
}
