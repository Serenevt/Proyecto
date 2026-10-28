import {
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
import { InventoryActivationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;
const openStatuses = ['PENDING_PAYMENT', 'ACTIVE', 'REVIEW'] as const;
const openAuthorizations = ['RESERVED', 'DISPENSING', 'INTERVENTION_REQUIRED'] as const;

@Injectable()
export class InventoryReconciliationService {
  constructor(private readonly db: PrismaService) {}

  private async audit(tx: Tx, stationId: string, fuelId: string) {
    const pair = { stationId, fuelId };
    const inventory = await tx.fuelInventory.findUnique({
      where: { stationId_fuelId: pair },
    });
    if (!inventory) throw new NotFoundException('Inventario no encontrado');
    const activation = await tx.inventoryActivation.findUniqueOrThrow({
      where: { stationId_fuelId: pair },
    });
    const [reservations, movements, unmanaged, managedWithoutReservation] = await Promise.all([
      tx.inventoryReservation.findMany({
        where: pair,
        include: { authorization: true, transaction: true, terminalOperation: true },
      }),
      tx.inventoryMovement.findMany({
        where: pair,
        orderBy: { sequence: 'asc' },
      }),
      tx.fuelAuthorization.findMany({
        where: {
          ...pair,
          status: { in: [...openAuthorizations] },
          inventoryReservation: null,
        },
        select: { id: true },
      }),
      tx.fuelAuthorization.findMany({
        where: { ...pair, inventoryManaged: true, inventoryReservation: null },
        select: { id: true },
      }),
    ]);
    const issues: string[] = [];
    const reservationById = new Map(reservations.map((reservation) => [reservation.id, reservation]));
    const opening = movements.filter((m) => m.kind === 'OPENING_BALANCE');
    if (opening.length !== 1 || movements[0]?.kind !== 'OPENING_BALANCE')
      issues.push('OPENING_BALANCE_MISSING_OR_DUPLICATE');
    let physical = new Prisma.Decimal(0);
    let reserved = new Prisma.Decimal(0);
    for (const movement of movements) {
      physical = physical.plus(movement.physicalDeltaLiters);
      reserved = reserved.plus(movement.reservedDeltaLiters);
      if (
        !physical.eq(movement.litersAfter) ||
        !reserved.eq(movement.reservedLitersAfter)
      ) {
        issues.push(`LEDGER_BALANCE:${movement.id}`);
        break;
      }
      const linked = movement.reservationId
        ? reservationById.get(movement.reservationId)
        : null;
      if (
        (movement.reservationId && !linked) ||
        (['RESERVE', 'DISPENSE', 'RELEASE'].includes(movement.kind) && !linked) ||
        (movement.kind === 'LEGACY_DISPENSE' &&
          (!movement.authorizationId || movement.reservationId)) ||
        (movement.kind === 'DISPENSE' &&
          (!movement.authorizationId ||
            linked?.authorizationId !== movement.authorizationId)) ||
        (linked &&
          ((movement.authorizationId && linked.authorizationId !== movement.authorizationId) ||
            (movement.terminalOperationId && linked.terminalOperationId !== movement.terminalOperationId) ||
            (movement.transactionId && linked.transactionId !== movement.transactionId)))
      ) issues.push(`MOVEMENT_LINK:${movement.id}`);
    }
    if (!physical.eq(inventory.liters) || !reserved.eq(inventory.reservedLiters))
      issues.push('LEDGER_INVENTORY_DIVERGENCE');

    let openCommitment = new Prisma.Decimal(0);
    for (const reservation of reservations) {
      if (openStatuses.includes(reservation.status as typeof openStatuses[number]))
        openCommitment = openCommitment.plus(reservation.remainingLiters);
      if (!reservation.initialLiters.eq(
        reservation.remainingLiters.plus(reservation.consumedLiters).plus(reservation.releasedLiters),
      )) issues.push(`RESERVATION_BALANCE:${reservation.id}`);
      if (
        reservation.authorizationId &&
        (!reservation.authorization ||
          reservation.authorization.operationId !== reservation.operationId ||
          reservation.authorization.stationId !== stationId ||
          reservation.authorization.fuelId !== fuelId ||
          reservation.authorization.terminalOperationId !== reservation.terminalOperationId)
      ) issues.push(`AUTHORIZATION_LINK:${reservation.id}`);
      if (
        reservation.transactionId &&
        (!reservation.transaction ||
          reservation.transaction.operationId !== reservation.operationId ||
          reservation.transaction.stationId !== stationId ||
          reservation.transaction.fuelId !== fuelId ||
          reservation.transaction.authorizationId !== reservation.authorizationId ||
          reservation.status !== 'CLOSED')
      ) issues.push(`TRANSACTION_LINK:${reservation.id}`);
      if (reservation.status === 'CLOSED' && !reservation.transactionId)
        issues.push(`CLOSED_WITHOUT_TRANSACTION:${reservation.id}`);
      if (
        reservation.terminalOperationId &&
        (!reservation.terminalOperation ||
          reservation.terminalOperation.operationId !== reservation.operationId ||
          reservation.terminalOperation.stationId !== stationId)
      ) issues.push(`TERMINAL_OPERATION_LINK:${reservation.id}`);
      if (
        reservation.authorization?.inventoryManaged &&
        ['SETTLED', 'RELEASED'].includes(reservation.authorization.status) &&
        !['CLOSED', 'CANCELLED'].includes(reservation.status)
      ) issues.push(`UNFINISHED_RESERVATION:${reservation.id}`);
    }
    if (!openCommitment.eq(inventory.reservedLiters))
      issues.push('RESERVED_LITERS_DIVERGENCE');
    for (const authorization of unmanaged)
      issues.push(`OPEN_LEGACY_AUTHORIZATION:${authorization.id}`);
    for (const authorization of managedWithoutReservation)
      issues.push(`MANAGED_AUTHORIZATION_MISSING_RESERVATION:${authorization.id}`);
    return {
      stationId,
      fuelId,
      status: activation.status,
      reason: activation.reason,
      physicalLiters: inventory.liters.toFixed(6),
      reservedLiters: inventory.reservedLiters.toFixed(6),
      availableLiters: inventory.liters.minus(inventory.reservedLiters).toFixed(6),
      openReservationLiters: openCommitment.toFixed(6),
      reservationCount: reservations.length,
      movementCount: movements.length,
      issues,
    };
  }

  inspect(stationId: string, fuelId: string) {
    return this.db.atomic((tx) => this.audit(tx, stationId, fuelId));
  }

  async reconcile(stationId: string, fuelId: string) {
    const pair = { stationId, fuelId };
    // Mark the pair before processing individual authorizations. Each backfill
    // transaction is short; a failed/uncertain case keeps REVIEW committed.
    const ids = await this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "InventoryActivation"
        WHERE "stationId"=${stationId}::uuid AND "fuelId"=${fuelId}::uuid FOR UPDATE`;
      const candidates = await tx.fuelAuthorization.findMany({
        where: {
          ...pair,
          status: { in: [...openAuthorizations] },
          inventoryReservation: null,
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      if (candidates.length)
        await tx.inventoryActivation.update({
          where: { stationId_fuelId: pair },
          data: {
            status: 'REVIEW',
            reason: 'Open legacy authorizations require reconciliation',
            reconciledAt: null,
          },
        });
      return candidates.map((candidate) => candidate.id);
    });
    for (const id of ids)
      await this.db.atomic(async (tx) => {
        await tx.$queryRaw`SELECT inventory_backfill_legacy(${id}::uuid)`;
      });
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "InventoryActivation"
        WHERE "stationId"=${stationId}::uuid AND "fuelId"=${fuelId}::uuid FOR UPDATE`;
      const report = await this.audit(tx, stationId, fuelId);
      const status: InventoryActivationStatus = report.issues.length
        ? 'REVIEW'
        : report.status === 'REQUIRED'
          ? 'REQUIRED'
          : 'RECONCILED';
      await tx.inventoryActivation.update({
        where: { stationId_fuelId: pair },
        data: {
          status,
          reason: report.issues.length ? report.issues[0].slice(0, 200) : null,
          reconciledAt: report.issues.length ? null : new Date(),
        },
      });
      return { ...report, status, reason: report.issues[0] ?? null };
    });
  }

  activate(stationId: string, fuelId: string) {
    const pair = { stationId, fuelId };
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "InventoryActivation"
        WHERE "stationId"=${stationId}::uuid AND "fuelId"=${fuelId}::uuid FOR UPDATE`;
      const report = await this.audit(tx, stationId, fuelId);
      if (report.status === 'REQUIRED') return report;
      if (report.status !== 'RECONCILED' || report.issues.length)
        throw new ConflictException('El inventario requiere conciliación antes de activar reservas obligatorias');
      await tx.inventoryActivation.update({
        where: { stationId_fuelId: pair },
        data: { status: 'REQUIRED', reason: null },
      });
      return { ...report, status: 'REQUIRED', reason: null };
    });
  }
}

@Controller('inventory')
export class InventoryReconciliationController {
  constructor(private readonly service: InventoryReconciliationService) {}

  @Get(':stationId/:fuelId/reconciliation')
  @SetMetadata('access', 'admin')
  inspect(
    @Param('stationId', new ParseUUIDPipe()) stationId: string,
    @Param('fuelId', new ParseUUIDPipe()) fuelId: string,
  ) {
    return this.service.inspect(stationId, fuelId);
  }

  @Post(':stationId/:fuelId/reconcile')
  @SetMetadata('access', 'admin')
  reconcile(
    @Param('stationId', new ParseUUIDPipe()) stationId: string,
    @Param('fuelId', new ParseUUIDPipe()) fuelId: string,
  ) {
    return this.service.reconcile(stationId, fuelId);
  }

  @Post(':stationId/:fuelId/activate')
  @SetMetadata('access', 'admin')
  activate(
    @Param('stationId', new ParseUUIDPipe()) stationId: string,
    @Param('fuelId', new ParseUUIDPipe()) fuelId: string,
  ) {
    return this.service.activate(stationId, fuelId);
  }
}
