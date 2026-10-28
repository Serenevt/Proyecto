import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  SetMetadata,
} from '@nestjs/common';
import { IsIn, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type RefundOutcome = 'CONFIRMED' | 'REJECTED' | 'AMBIGUOUS';
type Reader = Pick<
  Prisma.TransactionClient,
  'payment' | 'paymentEvent' | 'inventoryReservation'
>;

export class PartialRefundResultDto {
  @IsUUID('4')
  eventId: string;

  @IsIn(['CONFIRMED', 'REJECTED', 'AMBIGUOUS'])
  outcome: RefundOutcome;

  @Matches(/^\d{1,10}\.\d{2}$/)
  amount: string;

  // Reference to the operator's/provider's evidence. This endpoint only
  // records an observed result; it never calls a payment provider.
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  reference: string;
}

@Injectable()
export class PartialRefundService {
  constructor(private readonly db: PrismaService) {}

  private async context(reader: Reader, paymentId: string) {
    const payment = await reader.payment.findUnique({
      where: { id: paymentId },
      include: { authorization: true, transaction: true },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    const transaction = payment.transaction;
    const authorization = payment.authorization;
    if (
      !transaction ||
      !authorization ||
      transaction.mode !== 'PREPAGO' ||
      transaction.authorizationId !== authorization.id ||
      transaction.operationId !== authorization.operationId ||
      (payment.operationId && payment.operationId !== transaction.operationId) ||
      payment.provider === 'DEMO' ||
      payment.status !== 'CAPTURED'
    )
      throw new ConflictException('Pago sin reembolso parcial pendiente');

    const pending = await reader.paymentEvent.findUnique({
      where: { eventKey: `partial-refund-pending:${authorization.id}` },
    });
    const reservation = await reader.inventoryReservation.findUnique({
      where: { transactionId: transaction.id },
    });
    const expected = payment.amount.minus(transaction.amount);
    if (
      pending?.paymentId !== payment.id ||
      pending.kind !== 'PARTIAL_REFUND_PENDING' ||
      !reservation ||
      reservation.operationId !== transaction.operationId ||
      reservation.status !== 'CLOSED' ||
      !reservation.remainingLiters.isZero() ||
      expected.lte(0)
    )
      throw new ConflictException('Cierre físico o reembolso parcial no conciliable');
    return { payment, transaction, expected };
  }

  private async state(reader: Reader, paymentId: string) {
    const { payment, transaction, expected } = await this.context(reader, paymentId);
    const final = await reader.paymentEvent.findUnique({
      where: { eventKey: `partial-refund-result:${paymentId}` },
    });
    if (final && final.paymentId !== paymentId)
      throw new ConflictException('Resultado financiero incompatible');
    const ambiguous = final
      ? null
      : await reader.paymentEvent.findFirst({
          where: { paymentId, kind: 'PARTIAL_REFUND_AMBIGUOUS' },
          orderBy: { createdAt: 'desc' },
        });
    const outcome = final
      ? final.kind === 'PARTIAL_REFUND_CONFIRMED'
        ? 'CONFIRMED'
        : final.kind === 'PARTIAL_REFUND_REJECTED'
          ? 'REJECTED'
          : null
      : ambiguous
        ? 'AMBIGUOUS'
        : 'PENDING';
    if (!outcome) throw new ConflictException('Resultado financiero incompatible');
    if (
      (outcome === 'CONFIRMED' &&
        (!payment.refundedAmount.eq(expected) || transaction.status !== 'PAID')) ||
      (outcome !== 'CONFIRMED' &&
        (!payment.refundedAmount.isZero() || transaction.status !== 'PAYMENT_PENDING'))
    )
      throw new ConflictException('Estado financiero divergente');
    return {
      paymentId,
      operationId: transaction.operationId,
      transactionId: transaction.id,
      amount: expected.toFixed(2),
      refundedAmount: payment.refundedAmount.toFixed(2),
      transactionStatus: transaction.status,
      outcome,
    };
  }

  get(paymentId: string) {
    return this.db.atomic((tx) => this.state(tx, paymentId));
  }

  report(paymentId: string, dto: PartialRefundResultDto) {
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${paymentId}::uuid FOR UPDATE`;
      const current = await this.state(tx, paymentId);
      if (!new Prisma.Decimal(dto.amount).eq(current.amount))
        throw new ConflictException('Importe de reembolso incompatible');
      const detail = JSON.stringify({
        paymentId,
        eventId: dto.eventId,
        outcome: dto.outcome,
        amount: current.amount,
        reference: dto.reference.trim(),
      });
      const eventKey = `partial-refund-report:${dto.eventId}`;
      const existing = await tx.paymentEvent.findUnique({ where: { eventKey } });
      if (existing) {
        if (existing.paymentId !== paymentId || existing.detail !== detail)
          throw new ConflictException('Evento reutilizado con otros datos');
        return { ...current, replayed: true, ignored: false };
      }
      if (
        ['CONFIRMED', 'REJECTED'].includes(current.outcome) &&
        dto.outcome !== 'AMBIGUOUS' &&
        dto.outcome !== current.outcome
      )
        throw new ConflictException('Resultado definitivo incompatible');

      await tx.paymentEvent.create({
        data: {
          eventKey,
          paymentId,
          kind:
            dto.outcome === 'AMBIGUOUS'
              ? 'PARTIAL_REFUND_AMBIGUOUS'
              : 'PARTIAL_REFUND_REPORT',
          detail,
        },
      });
      if (current.outcome === 'CONFIRMED' || current.outcome === 'REJECTED')
        return {
          ...current,
          replayed: true,
          ignored: dto.outcome === 'AMBIGUOUS',
        };
      if (dto.outcome === 'AMBIGUOUS')
        return { ...(await this.state(tx, paymentId)), replayed: false, ignored: false };

      await tx.paymentEvent.create({
        data: {
          eventKey: `partial-refund-result:${paymentId}`,
          paymentId,
          kind: `PARTIAL_REFUND_${dto.outcome}`,
          detail,
        },
      });
      if (dto.outcome === 'CONFIRMED') {
        await tx.payment.update({
          where: { id: paymentId },
          data: { refundedAmount: new Prisma.Decimal(current.amount) },
        });
        await tx.transaction.update({
          where: { id: current.transactionId },
          data: { status: 'PAID' },
        });
      }
      return { ...(await this.state(tx, paymentId)), replayed: false, ignored: false };
    });
  }
}

@Controller('payments')
export class PartialRefundController {
  constructor(private readonly service: PartialRefundService) {}

  @Get(':id/partial-refund')
  @SetMetadata('access', 'admin')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }

  @Post(':id/partial-refund')
  @SetMetadata('access', 'admin')
  report(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PartialRefundResultDto,
  ) {
    return this.service.report(id, dto);
  }
}
