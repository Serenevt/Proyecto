import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentsService } from '../payments/payments.service';
import { creditCapacity, funding } from '../wallet/debt';
import { createHash } from 'node:crypto';
import {
  AuthorizationOutcome,
  AuthorizationStatus,
  Prisma,
  WalletMovementKind,
} from '@prisma/client';
import { normalizePlate } from '../vehicles/plate.dto';
import { WalletRepository } from '../wallet/wallet.repository';
import { AuthorizationsRepository } from './authorizations.repository';
import { CreateAuthorizationDto } from './create-authorization.dto';
import { DispenseProgressDto } from './dispense-progress.dto';

/** Antigüedad máxima de una reserva sin liquidar antes de considerarla abandonada. */
const RESERVATION_TTL_MINUTES = 30;

export function authorizationResponse(value: {
  id: string;
  status: AuthorizationStatus;
  outcome?: AuthorizationOutcome | null;
  unitPrice?: Prisma.Decimal | null;
  interventionReason?: string | null;
  mode?: string;
  authorizedAmount: Prisma.Decimal;
  reservedAmount: Prisma.Decimal;
  consumedAmount: Prisma.Decimal | null;
  releasedAmount: Prisma.Decimal;
  dispensedAmount?: Prisma.Decimal | null;
  dispensedGallons?: Prisma.Decimal | null;
  createdAt: Date;
}) {
  const zero = new Prisma.Decimal(0);
  return {
    id: value.id,
    unitPrice: value.unitPrice?.toFixed(2) ?? null,
    interventionReason: value.interventionReason ?? null,
    status: value.status,
    outcome: value.outcome ?? null,
    authorizedAmount: value.authorizedAmount.toFixed(2),
    reservedAmount: value.reservedAmount.toFixed(2),
    creditReserved:
      value.mode === 'PREPAGO'
        ? '0.00'
        : value.authorizedAmount.minus(value.reservedAmount).toFixed(2),
    // Tolerancia a registros previos a la migración de avance.
    dispensedAmount: (value.dispensedAmount ?? zero).toFixed(2),
    dispensedGallons: (value.dispensedGallons ?? zero).toFixed(3),
    consumedAmount: value.consumedAmount?.toFixed(2) ?? null,
    releasedAmount: value.releasedAmount.toFixed(2),
    expiresAt: new Date(
      value.createdAt.getTime() + RESERVATION_TTL_MINUTES * 60_000,
    ),
    createdAt: value.createdAt,
  };
}

@Injectable()
export class AuthorizationsService {
  constructor(
    private readonly repo: AuthorizationsRepository,
    private readonly wallet: WalletRepository,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * Reserva saldo para un abastecimiento postpago.
   *
   * Valida en una única transacción serializable que: la placa exista, el
   * código de membresía corresponda a esa placa, la membresía y el usuario
   * estén activos, la estación y el combustible existan, y el saldo alcance el
   * importe autorizado. Solo entonces descuenta el importe del saldo.
   *
   * El descuento ocurre aquí, antes del abastecimiento: es lo que impide gastar
   * dos veces el mismo saldo desde dos surtidores simultáneos.
   */
  create(dto: CreateAuthorizationDto) {
    if (dto.mode === 'PREPAGO') return this.createPrepaid(dto);
    const plate = normalizePlate(dto.plate) as string;
    const code = (dto.membershipCode ?? '').trim().toUpperCase();
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0))
      throw new BadRequestException('El monto a autorizar debe ser positivo');
    if (amount.gt(new Prisma.Decimal('999999.99')))
      throw new BadRequestException(
        'El monto a autorizar excede el máximo permitido',
      );

    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          plate,
          amount: amount.toFixed(2),
          code,
          stationId: dto.stationId,
          fuelId: dto.fuelId,
          receiptType: dto.receiptType ?? 'BOLETA',
          allowDebt: dto.allowDebt === true,
          ...(dto.unitPrice ? { unitPrice: dto.unitPrice } : {}),
        }),
      )
      .digest('hex');

    return this.repo.atomic(async (tx) => {
      const existing = await this.repo.byOperation(dto.operationId, tx);
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException('operationId ya usado con otros datos');
        return {
          authorization: authorizationResponse(existing),
          replayed: true,
        };
      }

      const vehicle = await tx.vehicle.findUnique({
        where: { plate },
        include: {
          membership: { include: { user: { select: { active: true } } } },
        },
      });
      if (!vehicle) throw new NotFoundException('Vehículo no encontrado');

      // El código capturado en el terminal debe pertenecer a la placa leída.
      // Antes esta comprobación no existía y el código nunca llegaba al backend.
      const membership = vehicle.membership;
      if (!membership)
        throw new BadRequestException(
          'El vehículo no está asociado a una membresía Primax Prime',
        );
      if (membership.number !== code)
        throw new BadRequestException(
          'El código de membresía no corresponde al vehículo identificado',
        );
      if (membership.status !== 'ACTIVE' || !membership.user.active)
        throw new BadRequestException('La membresía no está activa');

      const fuel = await tx.fuel.findUnique({ where: { id: dto.fuelId } });
      if (!fuel?.active)
        throw new NotFoundException('Combustible no disponible');
      const station = await tx.station.findUnique({
        where: { id: dto.stationId },
      });
      if (!station?.active)
        throw new NotFoundException('Estación no disponible');

      this.checkPrice(dto.unitPrice, fuel.pricePerGallon);
      // Bloqueo de fila: serializa reservas concurrentes sobre la misma cuenta.
      await this.wallet.lockMembership(membership.id, tx);
      const fresh = await tx.membership.findUnique({
        where: { id: membership.id },
      });
      if (!fresh) throw new NotFoundException('Membresía no encontrada');

      const split = funding(amount, fresh.balance);
      if (split.pending.gt(0)) {
        const capacity = await creditCapacity(tx, membership.id);
        if (!dto.allowDebt || split.pending.gt(capacity.remaining))
          throw new BadRequestException({
            message: split.pending.gt(capacity.remaining)
              ? 'Has alcanzado el l\u00edmite de saldo pendiente.'
              : 'Tu saldo Primax Prime no es suficiente para cubrir el consumo.',
            code: split.pending.gt(capacity.remaining)
              ? 'DEBT_LIMIT'
              : 'INSUFFICIENT_BALANCE',
            available: fresh.balance.toFixed(2),
            amount: amount.toFixed(2),
            amountPending: split.pending.toFixed(2),
            existingDebt: capacity.pending.toFixed(2),
            canRegisterDebt: split.pending.lte(capacity.remaining),
          });
      }
      const balanceAfter = split.balanceAfter;
      await this.wallet.setBalance(membership.id, balanceAfter, tx);
      const authorization = await this.repo.create(
        {
          operationId: dto.operationId,
          requestHash,
          membershipId: membership.id,
          plate,
          vehicleId: vehicle.id,
          stationId: station.id,
          fuelId: fuel.id,
          unitPrice: fuel.pricePerGallon,
          authorizedAmount: amount,
          reservedAmount: split.cash,
          releasedAmount: new Prisma.Decimal(0),
          balanceAfter,
          mode: 'POSTPAGO',
          status: AuthorizationStatus.RESERVED,
        },
        tx,
      );
      if (split.cash.gt(0))
        await this.wallet.movement(
          {
            membershipId: membership.id,
            kind: WalletMovementKind.RESERVE,
            amount: split.cash.negated(),
            balanceAfter,
            authorizationId: authorization.id,
            operationId: dto.operationId,
            note: 'Reserva para abastecimiento postpago',
          },
          tx,
        );
      return {
        authorization: authorizationResponse(authorization),
        replayed: false,
        membershipNumber: membership.number,
      };
    });
  }

  /**
   * Registra el avance del abastecimiento.
   *
   * No mueve saldo ni registra cobro: el importe ya está comprometido desde la
   * reserva. Sirve para que FrontEnd_1 muestre el estado real de la operación y
   * para que una interruption quede registrada con lo que ya se despachó.
   *
   * El avance nunca puede superar lo reservado: esa es la garantía que impide
   * que el consumo simulado termine por encima del importe autorizado.
   */
  progress(id: string, dto: DispenseProgressDto) {
    const amount = new Prisma.Decimal(dto.amount);
    const gallons = new Prisma.Decimal(dto.gallons);
    if (amount.lt(0) || gallons.lt(0))
      throw new BadRequestException('El avance no puede ser negativo');
    return this.repo.atomic(async (tx) => {
      const authorization = await this.repo.byId(id, tx);
      if (!authorization)
        throw new NotFoundException('Autorización de saldo no encontrada');
      if (
        authorization.status !== AuthorizationStatus.RESERVED &&
        authorization.status !== AuthorizationStatus.DISPENSING
      )
        throw new ConflictException(
          'La autorización ya fue liquidada o liberada',
        );
      if (!authorization.unitPrice)
        throw new ConflictException(
          'Precio histórico desconocido; requiere intervención',
        );
      const expectedGallons = amount
        .div(authorization.unitPrice)
        .toDecimalPlaces(3);
      if (!gallons.eq(expectedGallons))
        throw new BadRequestException(
          'El volumen no coincide con el precio autorizado',
        );
      if (amount.gt(authorization.authorizedAmount))
        throw new BadRequestException(
          'El consumo supera el importe reservado; autoriza de nuevo antes de abastecer',
        );
      // El avance nunca retrocede: respeta el orden real de la manguera.
      if (
        amount.lt(authorization.dispensedAmount) ||
        gallons.lt(authorization.dispensedGallons)
      )
        return authorizationResponse(authorization);

      const updated = await this.repo.settle(
        id,
        {
          dispensedAmount: amount,
          dispensedGallons: gallons,
          status: AuthorizationStatus.DISPENSING,
        },
        tx,
      );
      return authorizationResponse(updated);
    });
  }

  /**
   * Cierra la reserva: cobra solo lo consumido y devuelve el excedente.
   *
   * Es el camino que usa la confirmación de compra. El saldo ya se descontó al
   * reservar, así que aquí solo se libera lo que no se consumió. La suma de
   * ambos efectos es exactamente el consumo real.
   */
  async settle(
    id: string,
    consumed: Prisma.Decimal,
    outcome: AuthorizationOutcome,
  ) {
    return this.repo.atomic(async (tx) => {
      const authorization = await this.repo.byId(id, tx);
      if (!authorization)
        throw new NotFoundException('Autorización de saldo no encontrada');
      if (
        authorization.status !== AuthorizationStatus.RESERVED &&
        authorization.status !== AuthorizationStatus.DISPENSING
      )
        throw new ConflictException(
          'La autorización ya fue liquidada o liberada',
        );
      if (!consumed.eq(authorization.dispensedAmount))
        throw new BadRequestException(
          'El cierre no coincide con el avance registrado',
        );
      if (consumed.lt(0))
        throw new BadRequestException('El consumo no puede ser negativo');
      if (consumed.gt(authorization.reservedAmount))
        throw new BadRequestException(
          'El consumo supera el importe reservado; autoriza de nuevo antes de abastecer',
        );

      if (!authorization.membershipId || authorization.mode !== 'POSTPAGO')
        throw new ConflictException(
          'Requiere intervención para liquidar prepago',
        );
      await this.wallet.lockMembership(authorization.membershipId, tx);
      const membership = await tx.membership.findUnique({
        where: { id: authorization.membershipId },
      });
      if (!membership) throw new NotFoundException('Membresía no encontrada');

      const excess = authorization.reservedAmount.minus(consumed);
      let balanceAfter = membership.balance;
      if (excess.gt(0)) {
        balanceAfter = membership.balance.plus(excess);
        await this.wallet.setBalance(
          authorization.membershipId,
          balanceAfter,
          tx,
        );
        await this.wallet.movement(
          {
            membershipId: authorization.membershipId,
            kind: WalletMovementKind.RELEASE,
            amount: excess,
            balanceAfter,
            authorizationId: id,
            note:
              outcome === AuthorizationOutcome.CANCELLED
                ? 'Reserva liberada: el cliente detuvo antes de despachar'
                : 'Excedente liberado tras el consumo postpago',
          },
          tx,
        );
      }
      const settled = await this.repo.settle(
        id,
        {
          consumedAmount: consumed,
          releasedAmount: excess,
          balanceAfter,
          dispensedAmount: consumed,
          status: AuthorizationStatus.SETTLED,
          outcome,
        },
        tx,
      );
      return {
        authorization: authorizationResponse(settled),
        excess,
        balanceAfter,
      };
    });
  }

  /**
   * Libera una reserva vigente sin consumo. Se usa cuando el cliente abandona
   * antes de abastecer, o cuando Detener ocurre con 0 galones.
   */
  release(id: string) {
    return this.repo.atomic(async (tx) => {
      const authorization = await this.repo.byId(id, tx);
      if (!authorization)
        throw new NotFoundException('Autorización no encontrada');
      if (
        authorization.status !== AuthorizationStatus.RESERVED &&
        authorization.status !== AuthorizationStatus.DISPENSING
      )
        throw new ConflictException('La autorización ya no está reservada');

      if (!authorization.membershipId || authorization.mode !== 'POSTPAGO')
        throw new ConflictException(
          'Requiere intervención para liquidar prepago',
        );
      await this.wallet.lockMembership(authorization.membershipId, tx);
      const fresh = await tx.membership.findUnique({
        where: { id: authorization.membershipId },
      });
      if (!fresh) throw new NotFoundException('Membresía no encontrada');

      if (authorization.dispensedAmount?.gt(0))
        throw new BadRequestException(
          'Confirma el consumo antes de cerrar la reserva',
        );
      const balanceAfter = fresh.balance.plus(authorization.reservedAmount);
      await this.wallet.setBalance(
        authorization.membershipId,
        balanceAfter,
        tx,
      );
      const released = await this.repo.settle(
        id,
        {
          releasedAmount: authorization.reservedAmount,
          balanceAfter,
          status: AuthorizationStatus.RELEASED,
          outcome: AuthorizationOutcome.CANCELLED,
        },
        tx,
      );
      if (authorization.reservedAmount.gt(0))
        await this.wallet.movement(
          {
            membershipId: authorization.membershipId,
            kind: WalletMovementKind.RELEASE,
            amount: authorization.reservedAmount,
            balanceAfter,
            authorizationId: id,
            note: 'Reserva liberada sin consumo',
          },
          tx,
        );
      return authorizationResponse(released);
    });
  }

  private checkPrice(confirmed: string | undefined, actual: Prisma.Decimal) {
    if (confirmed && !actual.eq(confirmed))
      throw new ConflictException(
        'El precio cambió; confirma nuevamente la solicitud',
      );
  }

  /** DEMO: el pago se confirma en una transacción ANTERIOR a la autorización. */
  private async createPrepaid(dto: CreateAuthorizationDto) {
    const plate = normalizePlate(dto.plate) as string;
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0) || amount.gt('999999.99'))
      throw new BadRequestException('Monto inválido');
    const method = dto.paymentMethod;
    if (!method) throw new BadRequestException('Indica el medio de pago');
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          ...dto,
          plate: normalizePlate(dto.plate),
          amount: amount.toFixed(2),
        }),
      )
      .digest('hex');
    // Una respuesta perdida reutiliza este pago; no vuelve a cobrar.
    const paid = await this.repo.atomic(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { operationId: dto.operationId },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException('operationId ya usado con otros datos');
        return existing;
      }
      const fuel = await tx.fuel.findUnique({ where: { id: dto.fuelId } });
      if (!fuel?.active)
        throw new NotFoundException('Combustible no disponible');
      this.checkPrice(dto.unitPrice, fuel.pricePerGallon);
      const result = await this.payments.authorize(amount, method, 'PREPAGO');
      return tx.payment.create({
        data: {
          ...result,
          operationId: dto.operationId,
          requestHash,
          unitPrice: fuel.pricePerGallon,
        },
      });
    });
    return this.repo.atomic(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paid.id } });
      if (
        !payment ||
        payment.status !== 'CAPTURED' ||
        !payment.amount.eq(amount) ||
        !payment.unitPrice
      )
        throw new ConflictException(
          'Pago no aprobado; no se autoriza abastecimiento. Requiere intervención',
        );
      const existing = await this.repo.byOperation(dto.operationId, tx);
      if (existing) {
        if (
          existing.requestHash !== requestHash ||
          existing.mode !== 'PREPAGO' ||
          existing.paymentId !== payment.id
        )
          throw new ConflictException(
            'operationId ya usado con otra autorización',
          );
        return {
          authorization: authorizationResponse(existing),
          replayed: true,
        };
      }
      const vehicle = await tx.vehicle.findUnique({
        where: { plate: normalizePlate(dto.plate) as string },
        include: { membership: true },
      });
      if (
        dto.membershipCode &&
        vehicle?.membership?.number !== dto.membershipCode
      )
        throw new BadRequestException(
          'El código de membresía no corresponde al vehículo',
        );
      const station = await tx.station.findUnique({
        where: { id: dto.stationId },
      });
      const fuel = await tx.fuel.findUnique({ where: { id: dto.fuelId } });
      if (!station?.active || !fuel?.active)
        throw new ConflictException(
          'Estación o combustible no disponible; requiere intervención',
        );
      const authorization = await this.repo.create(
        {
          operationId: dto.operationId,
          requestHash,
          plate,
          vehicleId: vehicle?.id,
          membershipId: vehicle?.membershipId,
          stationId: station.id,
          fuelId: fuel.id,
          mode: 'PREPAGO',
          paymentId: payment.id,
          unitPrice: payment.unitPrice,
          authorizedAmount: payment.amount,
          reservedAmount: new Prisma.Decimal(0),
          releasedAmount: new Prisma.Decimal(0),
          balanceAfter: new Prisma.Decimal(0),
          status: 'RESERVED',
        },
        tx,
      );
      return {
        authorization: authorizationResponse(authorization),
        replayed: false,
      };
    });
  }

  intervention(id: string) {
    return this.repo.atomic(async (tx) => {
      const auth = await this.repo.byId(id, tx);
      if (!auth) throw new NotFoundException('Autorización no encontrada');
      if (
        ['SETTLED', 'RELEASED', 'INTERVENTION_REQUIRED'].includes(auth.status)
      )
        return authorizationResponse(auth);
      return authorizationResponse(
        await this.repo.settle(
          id,
          {
            status: 'INTERVENTION_REQUIRED',
            interventionReason:
              'Fallo crítico reportado por terminal; revisar estado antes de continuar',
          },
          tx,
        ),
      );
    });
  }

  /** Consulta una reserva por id (kiosk), para recuperar operaciones interrumpidas. */
  async status(id: string) {
    const authorization = await this.repo.byId(id, this.repo.client());
    if (!authorization)
      throw new NotFoundException('Autorización no encontrada');
    return authorizationResponse(authorization);
  }

  /**
   * Reservas antiguas sin liquidar. No las libera: las devuelve para revisión.
   * Liberar saldo es siempre una decisión explícita por id.
   */
  async pendingBefore(minutes: number) {
    const before = new Date(Date.now() - minutes * 60_000);
    const rows = await this.repo.pendingOlderThan(before, this.repo.client());
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      authorizedAmount: row.authorizedAmount.toFixed(2),
      dispensedAmount: row.dispensedAmount.toFixed(2),
      dispensedGallons: row.dispensedGallons.toFixed(3),
      createdAt: row.createdAt,
    }));
  }
}
