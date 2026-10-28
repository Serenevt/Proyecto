import { reserveWelcome } from '../payments/welcome';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PaymentsService } from '../payments/payments.service';
import { creditCapacity, funding } from '../wallet/debt';
import { createHash } from 'node:crypto';
import {
  AuthorizationOutcome,
  AuthorizationStatus,
  OperationalIncident,
  Prisma,
  WalletMovementKind,
} from '@prisma/client';
import { normalizePlate } from '../vehicles/plate.dto';
import { WalletRepository } from '../wallet/wallet.repository';
import { AuthorizationsRepository } from './authorizations.repository';
import { CreateAuthorizationDto } from './create-authorization.dto';
import { DispenseProgressDto } from './dispense-progress.dto';
import { terminalOperationFor, terminalSnapshot } from './operational-context';
import { assertAuthorizationContext } from './operational-context';
import {
  activateInventoryReservation,
  releaseInventoryReservation,
  reserveInventory,
  reviewInventoryReservation,
} from '../inventory/inventory-reservations';
import { TransactionsService } from './transactions.service';
import { IncidentsService } from '../incidents/incidents.service';

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
  inventoryReservation?: {
    status: string;
    initialLiters: Prisma.Decimal;
    remainingLiters: Prisma.Decimal;
    consumedLiters: Prisma.Decimal;
    releasedLiters: Prisma.Decimal;
  } | null;
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
    inventoryReservation: value.inventoryReservation
      ? {
          status: value.inventoryReservation.status,
          initialLiters: value.inventoryReservation.initialLiters.toFixed(6),
          remainingLiters: value.inventoryReservation.remainingLiters.toFixed(6),
          consumedLiters: value.inventoryReservation.consumedLiters.toFixed(6),
          releasedLiters: value.inventoryReservation.releasedLiters.toFixed(6),
        }
      : null,
    expiresAt: new Date(
      value.createdAt.getTime() + RESERVATION_TTL_MINUTES * 60_000,
    ),
    createdAt: value.createdAt,
  };
}

@Injectable()
export class AuthorizationsService {
  private readonly prepaidInFlight = new Map<
    string,
    {
      fingerprint: string;
      promise: Promise<{
        authorization: ReturnType<typeof authorizationResponse>;
        replayed?: boolean;
        membershipNumber?: string;
      }>;
    }
  >();

  constructor(
    private readonly repo: AuthorizationsRepository,
    private readonly wallet: WalletRepository,
    private readonly payments: PaymentsService,
    @Optional() private readonly transactions?: TransactionsService,
    @Optional() private readonly incidents?: IncidentsService,
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
    if (dto.mode === 'PREPAGO') {
      const fingerprint = JSON.stringify(dto);
      const running = this.prepaidInFlight.get(dto.operationId);
      if (running) {
        if (running.fingerprint !== fingerprint)
          return Promise.reject(
            new ConflictException('operationId ya usado con otros datos'),
          );
        return running.promise;
      }
      const pending = this.createPrepaidV12_1(dto).finally(() => {
        if (this.prepaidInFlight.get(dto.operationId)?.promise === pending)
          this.prepaidInFlight.delete(dto.operationId);
      });
      this.prepaidInFlight.set(dto.operationId, { fingerprint, promise: pending });
      return pending;
    }
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
      const terminalOperation = await terminalOperationFor(
        tx,
        dto.operationId,
        dto.stationId,
        !existing,
      );
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException('operationId ya usado con otros datos');
        assertAuthorizationContext(
          existing,
          dto.operationId,
          dto.stationId,
          dto.fuelId,
          terminalOperation,
        );
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
      const stock = await tx.fuelInventory.findUnique({
        where: {
          stationId_fuelId: { stationId: dto.stationId, fuelId: dto.fuelId },
        },
      });
      if (!stock)
        throw new BadRequestException('Inventario de combustible no disponible');
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
      const maxGallons = amount.div(fuel.pricePerGallon).toDecimalPlaces(3);
      if (maxGallons.lte(0))
        throw new BadRequestException('El monto no cubre el mínimo de volumen');
      const inventoryReservation = await reserveInventory(tx, {
        operationId: dto.operationId,
        stationId: dto.stationId,
        fuelId: dto.fuelId,
        terminalOperationId: terminalOperation?.id ?? null,
        source: terminalOperation ? 'TERMINAL' : 'LEGACY',
        maxGallons,
        requestHash,
        status: 'ACTIVE',
      });
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
          inventoryManaged: true,
          ...(terminalOperation ? terminalSnapshot(terminalOperation) : {}),
        },
        tx,
      );
      await tx.inventoryReservation.update({
        where: { id: inventoryReservation.id },
        data: { authorizationId: authorization.id },
      });
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
      const linkedAuthorization = await this.repo.byId(authorization.id, tx);
      return {
        authorization: authorizationResponse(linkedAuthorization ?? authorization),
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
      if (authorization.inventoryManaged) {
        const reservation = await tx.inventoryReservation.findUnique({
          where: { authorizationId: authorization.id },
        });
        if (
          !reservation ||
          reservation.status !== 'ACTIVE' ||
          reservation.operationId !== authorization.operationId ||
          reservation.requestHash.trim() !== authorization.requestHash ||
          reservation.stationId !== authorization.stationId ||
          reservation.fuelId !== authorization.fuelId
        )
          throw new ConflictException(
            'No existe una reserva de inventario activa para despacho',
          );
      }
      if (authorization.terminalOperationId) {
        const operation = await terminalOperationFor(
          tx,
          authorization.operationId,
          authorization.stationId,
        );
        assertAuthorizationContext(
          authorization,
          authorization.operationId,
          authorization.stationId,
          authorization.fuelId,
          operation,
        );
      }
      // A retry after a lost response returns persisted progress without firing
      // a redundant UPDATE. The SQL trigger remains the only physical debit.
      if (
        amount.eq(authorization.dispensedAmount) &&
        gallons.eq(authorization.dispensedGallons)
      )
        return authorizationResponse(authorization);
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
  async release(id: string) {
    const snapshot = await this.repo.byId(id, this.repo.client());
    if (!snapshot) throw new NotFoundException('Autorización no encontrada');
    if (
      snapshot.status === 'RELEASED' ||
      (snapshot.status === 'SETTLED' && snapshot.outcome === 'CANCELLED')
    )
      return authorizationResponse(snapshot);
    if (snapshot.dispensedAmount?.gt(0)) {
      if (!this.transactions)
        throw new ConflictException('El despacho parcial requiere cierre financiero');
      const prepaidPayment =
        snapshot.mode === 'PREPAGO' && snapshot.paymentId
          ? await this.repo.client().payment.findUnique({
              where: { id: snapshot.paymentId },
            })
          : null;
      if (snapshot.mode === 'PREPAGO' && !prepaidPayment)
        throw new ConflictException('Pago prepago no disponible para cierre');
      // The transaction service owns financial settlement and closes the
      // reservation in the same transaction as Transaction creation.
      return this.transactions.create({
        operationId: snapshot.operationId,
        plate: snapshot.plate,
        amount: snapshot.dispensedAmount.toFixed(2),
        gallons: snapshot.dispensedGallons.toFixed(3),
        stationId: snapshot.stationId,
        fuelId: snapshot.fuelId,
        mode: snapshot.mode,
        paymentMethod:
          snapshot.mode === 'POSTPAGO'
            ? 'SALDO_PRIME'
            : prepaidPayment!.method,
        authorizationId: snapshot.id,
        receiptType: 'BOLETA',
        outcome: 'MANUAL',
      });
    }
    return this.repo.atomic(async (tx) => {
      const authorization = await this.repo.byId(id, tx);
      if (!authorization)
        throw new NotFoundException('Autorización no encontrada');
      if (authorization.status === 'RELEASED')
        return authorizationResponse(authorization);
      if (
        authorization.status === 'SETTLED' &&
        authorization.outcome === 'CANCELLED'
      )
        return authorizationResponse(authorization);
      if (
        authorization.status !== AuthorizationStatus.RESERVED &&
        authorization.status !== AuthorizationStatus.DISPENSING
      )
        throw new ConflictException('La autorización ya no está reservada');

      if (authorization.mode === 'PREPAGO') {
        if (authorization.dispensedAmount.gt(0))
          throw new ConflictException('Confirma primero el consumo despachado');
        const paid = authorization.paymentId
          ? await tx.payment.findUnique({
              where: { id: authorization.paymentId },
            })
          : null;
        if (!paid || paid.status !== 'CAPTURED' || paid.provider !== 'DEMO')
          throw new ConflictException(
            'Requiere reembolso confirmado del proveedor',
          );
        await tx.payment.update({
          where: { id: paid.id },
          data: {
            status: 'REFUNDED',
            refundedAmount: { increment: paid.amount },
          },
        });
        await tx.paymentEvent.create({
          data: {
            eventKey: 'refund:' + paid.id,
            paymentId: paid.id,
            kind: 'REFUNDED',
            detail: 'Cancelacion sin consumo; devolucion simulada, no bancaria',
          },
        });
        if (authorization.inventoryManaged) {
          const reservation = await tx.inventoryReservation.findUnique({
            where: { authorizationId: id },
          });
          if (!reservation)
            throw new ConflictException('Reserva de inventario no encontrada');
          await releaseInventoryReservation(
            tx,
            reservation,
            `cancel:${authorization.operationId}`,
            'Confirmed prepaid cancellation before dispense',
          );
        }
        await tx.membership.updateMany({
          where: { welcomeReservedOperationId: authorization.operationId },
          data: { welcomeReservedOperationId: null },
        });
        return authorizationResponse(
          await this.repo.settle(
            id,
            {
              status: 'RELEASED',
              outcome: 'CANCELLED',
              releasedAmount: new Prisma.Decimal(0),
            },
            tx,
          ),
        );
      }
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
        throw new ConflictException('El avance cambió; reintenta para liquidar el consumo');
      if (authorization.inventoryManaged) {
        const reservation = await tx.inventoryReservation.findUnique({
          where: { authorizationId: id },
        });
        if (!reservation)
          throw new ConflictException('Reserva de inventario no encontrada');
        await releaseInventoryReservation(
          tx,
          reservation,
          `cancel:${authorization.operationId}`,
          'Cancellation before dispense',
        );
      }
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

  /** Reserve stock before simulated/external payment; never hold a DB transaction across payment. */
  private async createPrepaidV12_1(dto: CreateAuthorizationDto): Promise<{
    authorization: ReturnType<typeof authorizationResponse>;
    replayed?: boolean;
    membershipNumber?: string;
  }> {
    const plate = normalizePlate(dto.plate) as string;
    const amount = new Prisma.Decimal(dto.amount);
    const method = dto.paymentMethod;
    if (amount.lte(0) || amount.gt('999999.99'))
      throw new BadRequestException('Monto inválido');
    if (!method || method === 'SALDO_PRIME')
      throw new BadRequestException('El prepago requiere un medio externo');
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ ...dto, plate, amount: amount.toFixed(2) }))
      .digest('hex');

    const intent = await this.repo.atomic(async (tx) => {
      const existingAuth = await this.repo.byOperation(dto.operationId, tx);
      if (existingAuth) {
        if (existingAuth.requestHash !== requestHash)
          throw new ConflictException('operationId ya usado con otros datos');
        return { existingAuth, payment: null };
      }
      const operation = await terminalOperationFor(
        tx,
        dto.operationId,
        dto.stationId,
      );
      const [station, fuel] = await Promise.all([
        tx.station.findUnique({ where: { id: dto.stationId } }),
        tx.fuel.findUnique({ where: { id: dto.fuelId } }),
      ]);
      if (!station?.active || !fuel?.active)
        throw new NotFoundException('Estación o combustible no disponible');
      this.checkPrice(dto.unitPrice, fuel.pricePerGallon);
      const vehicle = await tx.vehicle.findUnique({
        where: { plate },
        include: { membership: true },
      });
      if (dto.membershipCode && vehicle?.membership?.number !== dto.membershipCode)
        throw new BadRequestException('El código de membresía no corresponde al vehículo');

      let payment = await tx.payment.findUnique({
        where: { operationId: dto.operationId },
      });
      let authorizeDemo = false;
      if (payment) {
        if (
          payment.requestHash !== requestHash || payment.method !== method ||
          !(payment.originalAmount ?? payment.amount).eq(amount) ||
          !payment.unitPrice?.eq(fuel.pricePerGallon)
        )
          throw new ConflictException('operationId ya usado con otros datos');
      } else {
        if (method === 'YAPE' || method === 'PLIN')
          throw new ConflictException('Crea primero la orden de pago');
        const pricing = await reserveWelcome(tx, dto);
        payment = await tx.payment.create({
          data: {
            ...pricing,
            operationId: dto.operationId,
            requestHash,
            method,
            status: 'PENDING',
            provider: 'DEMO',
            unitPrice: fuel.pricePerGallon,
          },
        });
        authorizeDemo = true;
      }
      if (payment.status === 'REJECTED' || payment.status === 'CANCELLED') {
        const reservation = await tx.inventoryReservation.findUnique({
          where: { operationId: dto.operationId },
        });
        return { existingAuth: null, payment, reservation, authorizeDemo };
      }
      const maxGallons = (payment.originalAmount ?? payment.amount)
        .div(fuel.pricePerGallon)
        .toDecimalPlaces(3);
      if (maxGallons.lte(0))
        throw new BadRequestException('El monto no cubre el mínimo de volumen');
      const reservation = await reserveInventory(tx, {
        operationId: dto.operationId,
        stationId: dto.stationId,
        fuelId: dto.fuelId,
        terminalOperationId: operation?.id ?? null,
        source: operation ? 'TERMINAL' : 'LEGACY',
        maxGallons,
        requestHash,
        status: 'PENDING_PAYMENT',
      });
      return { existingAuth: null, payment, reservation, authorizeDemo };
    });
    if (intent.existingAuth)
      return {
        authorization: authorizationResponse(intent.existingAuth),
        replayed: true,
      };
    let payment = intent.payment;
    if (!payment) throw new ConflictException('Pago no disponible');

    if (
      intent.authorizeDemo &&
      payment.status === 'PENDING' &&
      payment.provider === 'DEMO'
    ) {
      try {
        const approved = this.payments.authorize(payment.amount, method, 'PREPAGO');
        payment = await this.repo.atomic((tx) =>
          tx.payment.update({
            where: { id: payment!.id },
            data: { status: approved.status, provider: approved.provider },
          }),
        );
      } catch (error) {
        if (error instanceof BadRequestException) {
          await this.repo.atomic(async (tx) => {
            await tx.payment.update({ where: { id: payment!.id }, data: { status: 'REJECTED' } });
            const reservation = await tx.inventoryReservation.findUnique({ where: { operationId: dto.operationId } });
            if (reservation)
              await releaseInventoryReservation(tx, reservation, `payment-rejected:${dto.operationId}`, 'Confirmed payment rejection');
          });
        } else {
          await this.repo.atomic(async (tx) => {
            const reservation = await tx.inventoryReservation.findUnique({ where: { operationId: dto.operationId } });
            if (reservation)
              await reviewInventoryReservation(tx, reservation.id, 'Payment result is ambiguous');
          });
        }
        throw error;
      }
    }
    if (payment.status === 'REJECTED' || payment.status === 'CANCELLED') {
      await this.repo.atomic(async (tx) => {
        const reservation = await tx.inventoryReservation.findUnique({
          where: { operationId: dto.operationId },
        });
        if (reservation)
          await releaseInventoryReservation(
            tx,
            reservation,
            `payment-rejected:${dto.operationId}`,
            'Payment provider confirmed rejection',
          );
      });
      throw new ConflictException('Pago rechazado; la reserva fue liberada');
    }
    if (payment.status !== 'CAPTURED') {
      if (payment.provider === 'DEMO')
        await this.repo.atomic(async (tx) => {
          const reservation = await tx.inventoryReservation.findUnique({
            where: { operationId: dto.operationId },
          });
          if (reservation)
            await reviewInventoryReservation(
              tx,
              reservation.id,
              'Payment result is ambiguous',
            );
        });
      throw new ConflictException(
        'Pago pendiente o ambiguo; la reserva permanece comprometida',
      );
    }

    return this.repo.atomic(async (tx) => {
      const operation = await terminalOperationFor(
        tx,
        dto.operationId,
        dto.stationId,
      );
      const existingAuth = await this.repo.byOperation(dto.operationId, tx);
      if (existingAuth) {
        if (existingAuth.requestHash !== requestHash || existingAuth.paymentId !== payment!.id)
          throw new ConflictException('operationId ya usado con otros datos');
        assertAuthorizationContext(existingAuth, dto.operationId, dto.stationId, dto.fuelId, operation);
        return { authorization: authorizationResponse(existingAuth), replayed: true };
      }
      if (method === 'YAPE' || method === 'PLIN') {
        const order = await tx.onlineOrder.findUnique({ where: { paymentId: payment!.id } });
        if (!order || order.status !== 'CAPTURED')
          throw new ConflictException('Orden no confirmada para despacho');
      }
      const reservation = await tx.inventoryReservation.findUnique({
        where: { operationId: dto.operationId },
      });
      if (
        !reservation || reservation.requestHash.trim() !== requestHash ||
        reservation.stationId !== dto.stationId || reservation.fuelId !== dto.fuelId
      )
        throw new ConflictException('Reserva de inventario incompatible');
      await activateInventoryReservation(tx, reservation.id);
      const vehicle = await tx.vehicle.findUnique({
        where: { plate },
        include: { membership: true },
      });
      const authorization = await this.repo.create(
        {
          operationId: dto.operationId,
          requestHash,
          plate,
          vehicleId: vehicle?.id,
          membershipId: vehicle?.membershipId,
          stationId: dto.stationId,
          fuelId: dto.fuelId,
          mode: 'PREPAGO',
          paymentId: payment!.id,
          unitPrice: payment!.unitPrice,
          authorizedAmount: payment!.originalAmount ?? payment!.amount,
          reservedAmount: new Prisma.Decimal(0),
          releasedAmount: new Prisma.Decimal(0),
          balanceAfter: new Prisma.Decimal(0),
          status: 'RESERVED',
          inventoryManaged: true,
          ...(operation ? terminalSnapshot(operation) : {}),
        },
        tx,
      );
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { authorizationId: authorization.id },
      });
      const linkedAuthorization = await this.repo.byId(authorization.id, tx);
      return {
        authorization: authorizationResponse(linkedAuthorization ?? authorization),
        replayed: false,
      };
    });
  }

  intervention(
    id: string,
  ): Promise<ReturnType<typeof authorizationResponse> & { incident?: OperationalIncident | null }> {
    return this.repo.atomic(async (tx) => {
      const auth = await this.repo.byId(id, tx);
      if (!auth) throw new NotFoundException('Autorización no encontrada');
      if (['SETTLED', 'RELEASED'].includes(auth.status))
        return authorizationResponse(auth);
      const updated = auth.status === 'INTERVENTION_REQUIRED'
        ? auth
        : await this.repo.settle(
          id,
          {
            status: 'INTERVENTION_REQUIRED',
            interventionReason:
              'Fallo crítico reportado por terminal; revisar estado antes de continuar',
          },
          tx,
        );
      if (updated.terminalOperationId) {
        const operationUpdate = await tx.terminalOperation.updateMany({
          where: {
            id: updated.terminalOperationId,
            operationId: updated.operationId,
            stationId: updated.stationId,
            status: 'ACTIVE',
            closedAt: null,
          },
          data: { status: 'INTERVENTION_REQUIRED', version: { increment: 1 } },
        });
        if (operationUpdate.count) {
          await tx.operationalAuditEvent.create({
            data: {
              eventKey: `operation:${updated.operationId}:intervention-required`,
              actorKind: 'TERMINAL',
              stationId: updated.stationId,
              terminalId: updated.terminalId,
              action: 'OPERATION_INTERVENTION_REQUIRED',
              targetId: updated.terminalOperationId,
              outcome: 'SUCCESS',
            },
          });
        }
      }
      if (auth.inventoryManaged && auth.status !== 'INTERVENTION_REQUIRED') {
        const reservation = await tx.inventoryReservation.findUnique({
          where: { authorizationId: id },
        });
        if (reservation)
          await reviewInventoryReservation(
            tx,
            reservation.id,
            updated.interventionReason ?? 'Operational intervention required',
          );
      }
      const incident = this.incidents
        ? await this.incidents.recordConfirmedPaymentWithoutDispense(tx, updated)
        : null;
      return {
        ...authorizationResponse(updated),
        ...(incident ? { incident } : {}),
      };
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
