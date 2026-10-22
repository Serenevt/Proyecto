import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthorizationOutcome,
  AuthorizationStatus,
  PaymentMethod,
  Prisma,
  PurchaseMode,
  WalletMovementKind,
} from '@prisma/client';
import { assertIdentity } from '../memberships/profile.dto';
import { funding } from '../wallet/debt';
import { createHash } from 'node:crypto';
import { Actor } from '../auth/access';
import { PaymentsService } from '../payments/payments.service';
import { PointsPolicyService } from '../rewards/points-policy.service';
import { WalletRepository } from '../wallet/wallet.repository';
import { normalizePlate } from '../vehicles/plate.dto';
import { AuthorizationsRepository } from './authorizations.repository';
import { CreateTransactionDto } from './create-transaction.dto';
import { transactionResponse } from './transaction.model';
import { TransactionsRepository } from './transactions.repository';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly repo: TransactionsRepository,
    private readonly policy: PointsPolicyService,
    private readonly payments: PaymentsService,
    private readonly authorizations: AuthorizationsRepository,
    private readonly wallet: WalletRepository,
  ) {}

  async create(dto: CreateTransactionDto) {
    const amount = this.policy.amount(dto.amount);
    const plate = normalizePlate(dto.plate) as string;
    const gallons = dto.gallons ? new Prisma.Decimal(dto.gallons) : null;
    if (gallons?.lte(0))
      throw new BadRequestException('Los galones deben ser positivos');
    const code = dto.membershipCode?.trim().toUpperCase() ?? null;
    // Closing a prepaid delivery must never initiate another payment.
    const payment =
      dto.mode === 'POSTPAGO'
        ? this.payments.authorize(amount, dto.paymentMethod, dto.mode)
        : {
            amount,
            method: dto.paymentMethod,
            status: 'CAPTURED' as const,
            provider: 'DEMO',
          };
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          plate,
          amount: amount.toFixed(2),
          ...(dto.unitPrice ? { unitPrice: dto.unitPrice } : {}),
          stationId: dto.stationId,
          fuelId: dto.fuelId,
          mode: dto.mode,
          method: dto.paymentMethod,
          receiptType: dto.receiptType ?? 'BOLETA',
          receiptDni: dto.receiptDni ?? null,
          receiptRuc: dto.receiptRuc ?? null,
          receiptBusinessName: dto.receiptBusinessName ?? null,
          saveReceiptProfile: dto.saveReceiptProfile === true,
          membershipCode: code,
          gallons: gallons?.toFixed(3) ?? null,
          authorizationId: dto.authorizationId ?? null,
        }),
      )
      .digest('hex');

    return this.repo.atomic(async (tx) => {
      const existing = await this.repo.byOperation(dto.operationId, tx);
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException('operationId ya usado con otros datos');
        return {
          transaction: transactionResponse(existing),
          pointsEarned: existing.pointsEarned,
          replayed: true,
        };
      }
      if (!dto.authorizationId)
        throw new BadRequestException('Se requiere autorización previa');
      const auth = await this.authorizations.byId(dto.authorizationId, tx);
      if (!auth) throw new NotFoundException('Autorización no encontrada');
      // Keep a guest purchase unlinked even if the plate is registered mid-delivery.
      const vehicle = auth.vehicleId
        ? await this.repo.vehicle(plate, tx)
        : null;
      if (!vehicle && dto.mode === 'POSTPAGO')
        throw new NotFoundException('Vehículo no encontrado');
      const membership = vehicle?.membership;
      const eligible =
        membership?.status === 'ACTIVE' && membership.user.active;

      // El código capturado en el terminal debe pertenecer a la placa leída.
      // Esta validación no existía: el código se descartaba en el navegador.
      if (code && membership?.number !== code)
        throw new BadRequestException(
          'El código de membresía no corresponde al vehículo identificado',
        );

      if (dto.mode === PurchaseMode.POSTPAGO) {
        if (!eligible)
          throw new BadRequestException(
            'El postpago requiere una membresía Primax Prime activa',
          );
        if (dto.paymentMethod !== PaymentMethod.SALDO_PRIME)
          throw new BadRequestException(
            'El postpago se cobra al saldo Primax Prime',
          );
      }

      const fuel = await this.repo.fuel(dto.fuelId, tx);
      const station = await this.repo.station(dto.stationId, tx);
      if (!fuel?.active)
        throw new NotFoundException('Combustible no disponible');
      if (!station?.active)
        throw new NotFoundException('Estación no disponible');

      if (
        auth.plate !== plate ||
        auth.vehicleId !== (vehicle?.id ?? null) ||
        auth.stationId !== dto.stationId ||
        auth.fuelId !== dto.fuelId ||
        auth.mode !== dto.mode
      )
        throw new BadRequestException(
          'La autorización no corresponde a esta operación',
        );
      if (dto.mode === 'POSTPAGO' && auth.membershipId !== membership?.id)
        throw new BadRequestException(
          'La autorización no corresponde a esta membresía',
        );
      if (!['RESERVED', 'DISPENSING'].includes(auth.status))
        throw new ConflictException(
          'La autorización ya fue liquidada o liberada, o requiere intervención',
        );
      if (!auth.unitPrice)
        throw new ConflictException(
          'Precio histórico desconocido; requiere intervención',
        );
      if (
        !gallons ||
        !amount.eq(auth.dispensedAmount) ||
        !gallons.eq(auth.dispensedGallons) ||
        amount.gt(auth.authorizedAmount)
      )
        throw new BadRequestException(
          'El cierre no coincide con el avance registrado',
        );
      if (!gallons.eq(amount.div(auth.unitPrice).toDecimalPlaces(3)))
        throw new BadRequestException(
          'El importe no coincide con el volumen despachado',
        );
      if (dto.unitPrice && !auth.unitPrice.eq(dto.unitPrice))
        throw new BadRequestException(
          'El precio no coincide con el autorizado',
        );
      let prepaidPaymentId: string | null = null;
      if (dto.mode === 'PREPAGO') {
        const prepaid = auth.paymentId
          ? await tx.payment.findUnique({ where: { id: auth.paymentId } })
          : null;
        if (
          !prepaid ||
          prepaid.status !== 'CAPTURED' ||
          prepaid.method !== dto.paymentMethod ||
          prepaid.amount.lt(amount)
        )
          throw new BadRequestException('Pago previo no aprobado');
        prepaidPaymentId = prepaid.id;
        await this.authorizations.settle(
          auth.id,
          {
            status: 'SETTLED',
            consumedAmount: auth.dispensedAmount,
            outcome: dto.outcome === 'AUTO' ? 'AUTO' : 'MANUAL',
          },
          tx,
        );
      }

      let authorizationId: string | null = auth.id;
      let pending = new Prisma.Decimal(0);
      if (dto.mode === PurchaseMode.POSTPAGO) {
        const settlement = await this.settleReservation(
          tx,
          dto,
          amount,
          membership!.id,
        );
        authorizationId = settlement.id;
        pending = settlement.pending;
      }

      const receiptDni =
        dto.receiptType === 'FACTURA'
          ? null
          : (dto.receiptDni ?? membership?.dni ?? null);
      const receiptRuc =
        dto.receiptType === 'FACTURA'
          ? (dto.receiptRuc ?? membership?.ruc ?? null)
          : null;
      const receiptBusinessName =
        dto.receiptType === 'FACTURA'
          ? (dto.receiptBusinessName ?? membership?.businessName ?? null)
          : null;
      if (dto.saveReceiptProfile) {
        if (!eligible || !code)
          throw new BadRequestException(
            'Identifica tu membresia para guardar datos',
          );
        assertIdentity({
          dni: receiptDni ?? membership?.dni,
          passport: membership?.passport,
        });
        await tx.membership.update({
          where: { id: membership!.id },
          data: {
            ...(receiptDni ? { dni: receiptDni } : {}),
            ...(receiptRuc ? { ruc: receiptRuc } : {}),
            ...(receiptBusinessName
              ? { businessName: receiptBusinessName }
              : {}),
          },
        });
      }
      const points = eligible ? this.policy.calculate(amount) : 0;
      const transaction = await this.repo.create(
        {
          operationId: dto.operationId,
          requestHash,
          plate,
          vehicleId: vehicle?.id,
          membershipId: membership?.id,
          membershipCode: code,
          stationId: station.id,
          fuelId: fuel.id,
          amount,
          unitPrice: auth.unitPrice,
          gallons,
          pointsRate: this.policy.rate,
          solesPerPoint: this.policy.solesPerPoint,
          pointsEarned: points,
          mode: dto.mode,
          receiptType: dto.receiptType,
          authorizationId,
          receiptDni,
          receiptRuc,
          receiptBusinessName,
          status: pending.gt(0) ? 'PAYMENT_PENDING' : 'PAID',
          payment: prepaidPaymentId
            ? { connect: { id: prepaidPaymentId } }
            : {
                create: {
                  ...payment,
                  status: pending.isZero()
                    ? 'CAPTURED'
                    : pending.eq(amount)
                      ? 'PENDING'
                      : 'PARTIAL',
                },
              },
          ...(pending.gt(0)
            ? {
                debt: {
                  create: {
                    membershipId: membership!.id,
                    amountOriginal: pending,
                    amountPending: pending,
                  },
                },
              }
            : {}),
          ...(points > 0 && membership
            ? {
                rewardMovement: {
                  create: { membershipId: membership.id, points, kind: 'EARN' },
                },
              }
            : {}),
        },
        tx,
      );
      return {
        transaction: transactionResponse(transaction),
        pointsEarned: points,
        replayed: false,
      };
    });
  }

  /**
   * Liquida la reserva de un abastecimiento postpago.
   *
   * El saldo ya se descontó al reservar. Aquí se cobra únicamente el importe
   * efectivamente consumido y se devuelve el excedente, de modo que la suma de
   * los dos efectos sea exactamente el consumo real.
   *
   * @returns el id de la reserva liquidada.
   */
  private async settleReservation(
    tx: Prisma.TransactionClient,
    dto: CreateTransactionDto,
    amount: Prisma.Decimal,
    membershipId: string,
  ): Promise<{ id: string; pending: Prisma.Decimal }> {
    if (!dto.authorizationId)
      throw new BadRequestException(
        'El postpago requiere una autorización de saldo previa',
      );
    const authorization = await this.authorizations.byId(
      dto.authorizationId,
      tx,
    );
    if (!authorization)
      throw new NotFoundException('Autorización de saldo no encontrada');
    if (authorization.membershipId !== membershipId)
      throw new BadRequestException(
        'La autorización no corresponde a este vehículo ni a esta membresía',
      );
    if (authorization.stationId !== dto.stationId)
      throw new BadRequestException(
        'La autorización pertenece a otra estación',
      );
    if (authorization.fuelId !== dto.fuelId)
      throw new BadRequestException(
        'La autorización pertenece a otro combustible',
      );
    if (
      authorization.status !== AuthorizationStatus.RESERVED &&
      authorization.status !== AuthorizationStatus.DISPENSING
    )
      throw new ConflictException(
        'La autorización ya fue liquidada o liberada',
      );
    if (amount.gt(authorization.authorizedAmount))
      throw new BadRequestException(
        'El consumo supera el importe reservado; autoriza de nuevo antes de abastecer',
      );

    await this.wallet.lockMembership(membershipId, tx);
    const membership = await tx.membership.findUnique({
      where: { id: membershipId },
    });
    if (!membership) throw new NotFoundException('Membresía no encontrada');

    // Cobra únicamente lo consumido y devuelve el excedente. El saldo ya se
    // descontó al reservar, así que el efecto neto es exactamente -consumido.
    const split = funding(amount, authorization.reservedAmount);
    const excess = split.balanceAfter;
    let balanceAfter = membership.balance;
    if (excess.gt(0)) {
      balanceAfter = membership.balance.plus(excess);
      await this.wallet.setBalance(membershipId, balanceAfter, tx);
      await this.wallet.movement(
        {
          membershipId,
          kind: WalletMovementKind.RELEASE,
          amount: excess,
          balanceAfter,
          authorizationId: authorization.id,
          note: 'Excedente liberado tras el consumo postpago',
        },
        tx,
      );
    }
    await this.authorizations.settle(
      authorization.id,
      {
        consumedAmount: amount,
        releasedAmount: excess,
        dispensedAmount: amount,
        balanceAfter,
        status: AuthorizationStatus.SETTLED,
        outcome: amount.lte(0)
          ? AuthorizationOutcome.CANCELLED
          : dto.outcome === 'AUTO'
            ? AuthorizationOutcome.AUTO
            : AuthorizationOutcome.MANUAL,
      },
      tx,
    );
    return { id: authorization.id, pending: split.pending };
  }

  async get(id: string, actor: Actor) {
    const transaction = await this.repo.byId(id);
    if (
      !transaction ||
      (actor.kind === 'member' &&
        transaction.membership?.userId !== actor.userId)
    )
      throw new NotFoundException('Transacción no encontrada');
    return transactionResponse(transaction);
  }
}
