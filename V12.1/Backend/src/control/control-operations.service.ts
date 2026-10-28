import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminControlPermission,
  InventoryActivationStatus,
  InventoryMovementKind,
  Prisma,
  PurchaseMode,
  TerminalOperationStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { InventoryReconciliationService } from '../inventory/inventory-reconciliation';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from '../auth/access';

type ControlActor = Extract<Actor, { kind: 'control' }>;
type DateRange = { from?: Date; to?: Date };

@Injectable()
export class ControlOperationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly reconciliationService: InventoryReconciliationService,
  ) {}

  private async scope(
    actor: ControlActor,
    stationId: string | undefined,
    permission: AdminControlPermission,
  ) {
    if (!actor.permissions.includes(permission))
      throw new ForbiddenException('Permiso administrativo insuficiente');
    if (stationId && !actor.global && !actor.stationIds.includes(stationId))
      throw new ForbiddenException('Estación fuera del alcance autorizado');
    const ids = stationId
      ? [stationId]
      : actor.global
        ? undefined
        : actor.stationIds;
    if (!actor.global && ids?.length === 0)
      throw new ForbiddenException('No hay estaciones asignadas');
    return ids;
  }

  private dateRange(from?: Date, to?: Date): DateRange {
    if (from && to && from > to)
      throw new BadRequestException('El rango de fechas no es válido');
    return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  }

  async operations(
    actor: ControlActor,
    filters: {
      stationId?: string;
      status?: string;
      mode?: PurchaseMode;
      from?: Date;
      to?: Date;
    },
  ) {
    const ids = await this.scope(
      actor,
      filters.stationId,
      AdminControlPermission.ADMIN_OPERATION_VIEW,
    );
    const range = this.dateRange(filters.from, filters.to);
    const station = ids ? { stationId: { in: ids } } : {};
    const createdAt =
      range.from || range.to
        ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) }
        : undefined;
    const [authorizations, transactions, emptyOperations] = await Promise.all([
      this.db.fuelAuthorization.findMany({
        where: {
          ...station,
          ...(createdAt ? { createdAt } : {}),
          ...(filters.mode ? { mode: filters.mode } : {}),
        },
        include: {
          station: { select: { id: true, code: true, name: true } },
          fuel: { select: { id: true, code: true, name: true } },
          terminal: { select: { id: true, code: true } },
          pump: { select: { id: true, code: true, name: true } },
          terminalOperation: { select: { id: true, status: true, openedAt: true, closedAt: true } },
          payment: { select: { id: true, status: true, method: true, amount: true, refundedAmount: true } },
          transaction: { select: { id: true, status: true, amount: true, gallons: true, createdAt: true } },
          inventoryReservation: { select: { id: true, status: true, initialLiters: true, remainingLiters: true, consumedLiters: true, releasedLiters: true } },
          operationalIncidents: { select: { id: true, code: true, status: true, summary: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.db.transaction.findMany({
        where: {
          ...station,
          authorizationId: null,
          ...(createdAt ? { createdAt } : {}),
          ...(filters.mode ? { mode: filters.mode } : {}),
        },
        include: {
          station: { select: { id: true, code: true, name: true } },
          fuel: { select: { id: true, code: true, name: true } },
          terminal: { select: { id: true, code: true } },
          pump: { select: { id: true, code: true, name: true } },
          terminalOperation: { select: { id: true, status: true, openedAt: true, closedAt: true } },
          payment: { select: { id: true, status: true, method: true, amount: true, refundedAmount: true } },
          operationalIncidents: { select: { id: true, code: true, status: true, summary: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.db.terminalOperation.findMany({
        where: {
          ...station,
          authorizations: { none: {} },
          transaction: null,
          ...(filters.status && ['ACTIVE', 'INTERVENTION_REQUIRED', 'CLOSED'].includes(filters.status)
            ? { status: filters.status as TerminalOperationStatus }
            : {}),
          ...(range.from || range.to
            ? { openedAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
            : {}),
        },
        include: {
          station: { select: { id: true, code: true, name: true } },
          terminal: { select: { id: true, code: true } },
          pump: { select: { id: true, code: true, name: true } },
          operationalIncidents: { select: { id: true, code: true, status: true, summary: true } },
        },
        orderBy: { openedAt: 'desc' },
        take: 200,
      }),
    ]);

    const rows = [
      ...authorizations.map((authorization) => ({
        operationId: authorization.operationId,
        station: authorization.station,
        terminal: authorization.terminal,
        pump: authorization.pump,
        fuel: authorization.fuel,
        mode: authorization.mode,
        status: authorization.terminalOperation?.status ?? authorization.status,
        financialStatus: authorization.payment?.status ?? authorization.transaction?.status ?? null,
        payment: authorization.payment,
        amount: authorization.transaction?.amount ?? authorization.payment?.amount ?? authorization.authorizedAmount,
        dispensedAmount: authorization.dispensedAmount,
        dispensedGallons: authorization.dispensedGallons,
        occurredAt: authorization.terminalOperation?.openedAt ?? authorization.createdAt,
        incident: authorization.operationalIncidents[0] ?? null,
      })),
      ...transactions.map((transaction) => ({
        operationId: transaction.operationId,
        station: transaction.station,
        terminal: transaction.terminal,
        pump: transaction.pump,
        fuel: transaction.fuel,
        mode: transaction.mode,
        status: transaction.terminalOperation?.status ?? transaction.status,
        financialStatus: transaction.payment?.status ?? transaction.status,
        payment: transaction.payment,
        amount: transaction.amount,
        dispensedAmount: transaction.amount,
        dispensedGallons: transaction.gallons,
        occurredAt: transaction.terminalOperation?.openedAt ?? transaction.createdAt,
        incident: transaction.operationalIncidents[0] ?? null,
      })),
      ...emptyOperations.map((operation) => ({
        operationId: operation.operationId,
        station: operation.station,
        terminal: operation.terminal,
        pump: operation.pump,
        fuel: null,
        mode: null,
        status: operation.status,
        financialStatus: null,
        payment: null,
        amount: null,
        dispensedAmount: null,
        dispensedGallons: null,
        occurredAt: operation.openedAt,
        incident: operation.operationalIncidents[0] ?? null,
      })),
    ].filter((row) => !filters.status || row.status === filters.status);

    const unique = new Map(rows.map((row) => [row.operationId, row]));
    return [...unique.values()]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 200);
  }

  async operationDetail(actor: ControlActor, operationId: string) {
    if (!actor.permissions.includes(AdminControlPermission.ADMIN_OPERATION_VIEW))
      throw new ForbiddenException('Permiso administrativo insuficiente');
    const [authorization, transaction, terminalOperation, reservation, incident] = await Promise.all([
      this.db.fuelAuthorization.findUnique({
        where: { operationId },
        include: {
          station: { select: { id: true, code: true, name: true } },
          fuel: { select: { id: true, code: true, name: true } },
          payment: { select: { id: true, status: true, method: true, amount: true, refundedAmount: true } },
        },
      }),
      this.db.transaction.findUnique({
        where: { operationId },
        select: { id: true, status: true, amount: true, gallons: true, mode: true, stationId: true, fuelId: true, createdAt: true, authorizationId: true, payment: { select: { id: true, status: true, method: true, amount: true, refundedAmount: true } } },
      }),
      this.db.terminalOperation.findUnique({
        where: { operationId },
        include: {
          station: { select: { id: true, code: true, name: true } },
          terminal: { select: { id: true, code: true } },
          pump: { select: { id: true, code: true, name: true } },
        },
      }),
      this.db.inventoryReservation.findUnique({
        where: { operationId },
        include: { movements: { orderBy: { sequence: 'asc' }, select: { id: true, kind: true, physicalDeltaLiters: true, reservedDeltaLiters: true, litersAfter: true, reservedLitersAfter: true, createdAt: true } } },
      }),
      this.db.operationalIncident.findFirst({ where: { operationId }, select: { id: true, code: true, status: true, summary: true, resolution: true, createdAt: true, resolvedAt: true } }),
    ]);
    const stationId = authorization?.stationId ?? terminalOperation?.stationId ?? transaction?.stationId;
    if (!stationId) throw new NotFoundException('Operación no encontrada');
    await this.scope(actor, stationId, AdminControlPermission.ADMIN_OPERATION_VIEW);
    if (authorization) {
      return {
        operationId,
        station: authorization.station,
        terminalOperation,
        fuel: authorization.fuel,
        authorization: {
          id: authorization.id,
          mode: authorization.mode,
          status: authorization.status,
          authorizedAmount: authorization.authorizedAmount,
          dispensedAmount: authorization.dispensedAmount,
          dispensedGallons: authorization.dispensedGallons,
        },
        payment: authorization.payment ?? transaction?.payment ?? null,
        transaction,
        reservation,
        incident,
      };
    }
    return { operationId, station: terminalOperation?.station ?? null, terminalOperation, transaction, authorization: null, payment: transaction?.payment ?? null, reservation: null, incident };
  }

  async terminals(actor: ControlActor, stationId?: string) {
    const ids = await this.scope(actor, stationId, AdminControlPermission.ADMIN_TERMINAL_VIEW);
    const where = ids ? { stationId: { in: ids } } : {};
    const [terminals, pumps] = await Promise.all([
      this.db.terminal.findMany({
        where,
        include: {
          station: { select: { id: true, code: true, name: true } },
          assignments: { where: { endedAt: null }, include: { pump: { select: { id: true, code: true, name: true, active: true } } } },
          enablements: { where: { disabledAt: null }, include: { shift: { select: { id: true, status: true } } } },
          operations: { where: { closedAt: null }, select: { id: true, operationId: true, status: true, openedAt: true } },
          credentials: { select: { lastUsedAt: true }, orderBy: { issuedAt: 'desc' }, take: 1 },
        },
        orderBy: [{ stationId: 'asc' }, { code: 'asc' }],
      }),
      this.db.pump.findMany({
        where: { ...where, active: true },
        include: { station: { select: { id: true, code: true, name: true } }, assignments: { where: { endedAt: null }, include: { terminal: { select: { id: true, code: true, operationalStatus: true } } } } },
        orderBy: [{ stationId: 'asc' }, { code: 'asc' }],
      }),
    ]);
    return { terminals, pumps };
  }

  async terminalStatus(actor: ControlActor, terminalId: string, action: 'OUT_OF_SERVICE' | 'RESTORE') {
    if (!actor.permissions.includes(AdminControlPermission.ADMIN_TERMINAL_MANAGE))
      throw new ForbiddenException('Permiso administrativo insuficiente');
    return this.db.atomic(async (tx) => {
      const found = await tx.terminal.findUnique({ where: { id: terminalId } });
      if (!found || found.lifecycle !== 'REGISTRADA') throw new NotFoundException('Terminal registrada no encontrada');
      await this.scope(actor, found.stationId, AdminControlPermission.ADMIN_TERMINAL_MANAGE);
      await tx.$queryRaw`SELECT "id" FROM "Terminal" WHERE "id"=${terminalId}::uuid FOR UPDATE`;
      const terminal = await tx.terminal.findUniqueOrThrow({ where: { id: terminalId } });
      const operation = await tx.terminalOperation.findFirst({ where: { terminalId, closedAt: null } });
      if (operation) throw new ConflictException('Resuelve la operación activa antes de cambiar el estado administrativo');
      if (action === 'OUT_OF_SERVICE') {
        if (terminal.operationalStatus === 'FUERA_DE_SERVICIO') return terminal;
        await tx.terminalEnablement.updateMany({ where: { terminalId, disabledAt: null }, data: { disabledAt: new Date(), disableReason: 'ADMIN_ACTION' } });
      } else if (terminal.operationalStatus !== 'FUERA_DE_SERVICIO') {
        throw new ConflictException('Solo se puede restaurar una terminal fuera de servicio');
      }
      const updated = await tx.terminal.update({ where: { id: terminalId }, data: { operationalStatus: action === 'OUT_OF_SERVICE' ? 'FUERA_DE_SERVICIO' : 'BLOQUEADA', statusVersion: { increment: 1 } } });
      await tx.operationalAuditEvent.create({ data: { eventKey: `control-terminal:${terminalId}:${randomUUID()}`, actorKind: 'USER', actorUserId: actor.userId, stationId: terminal.stationId, terminalId, action: action === 'OUT_OF_SERVICE' ? 'ADMIN_TERMINAL_OUT_OF_SERVICE' : 'ADMIN_TERMINAL_RESTORED', targetId: terminalId, outcome: 'SUCCESS', details: { previousStatus: terminal.operationalStatus, status: updated.operationalStatus } } });
      return updated;
    });
  }

  async inventory(actor: ControlActor, stationId?: string) {
    const ids = await this.scope(actor, stationId, AdminControlPermission.ADMIN_INVENTORY_VIEW);
    return this.db.fuelInventory.findMany({
      where: { ...(ids ? { stationId: { in: ids } } : {}), station: { active: true } },
      include: { station: { select: { id: true, code: true, name: true } }, fuel: { select: { id: true, code: true, name: true } }, activation: { select: { status: true, reason: true, reconciledAt: true, updatedAt: true } } },
      orderBy: [{ stationId: 'asc' }, { fuelId: 'asc' }],
    }).then((rows) => rows.map((row) => ({ ...row, availableLiters: row.liters.minus(row.reservedLiters) })));
  }

  async movements(actor: ControlActor, filters: { stationId: string; fuelId?: string; kind?: InventoryMovementKind; from?: Date; to?: Date }) {
    await this.scope(actor, filters.stationId, AdminControlPermission.ADMIN_INVENTORY_MOVEMENT_VIEW);
    const range = this.dateRange(filters.from, filters.to);
    return this.db.inventoryMovement.findMany({
      where: { stationId: filters.stationId, ...(filters.fuelId ? { fuelId: filters.fuelId } : {}), ...(filters.kind ? { kind: filters.kind } : {}), ...(range.from || range.to ? { createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {}) },
      include: { inventory: { include: { fuel: { select: { id: true, code: true, name: true } } } }, reservation: { select: { operationId: true } } },
      orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    }).then((rows) => rows.map((row) => ({ ...row, fuel: row.inventory.fuel })));
  }

  async receiveInventory(actor: ControlActor, input: { requestId: string; stationId: string; fuelId: string; liters: string; reference?: string }) {
    await this.scope(actor, input.stationId, AdminControlPermission.ADMIN_INVENTORY_RECEIVE);
    const liters = new Prisma.Decimal(input.liters);
    if (!liters.gt(0) || liters.decimalPlaces() > 6 || liters.gt('1000000'))
      throw new BadRequestException('Los litros deben ser mayores que 0 y no superar 1,000,000');
    const eventKey = `control-supply:${actor.userId}:${input.requestId}`;
    const reason = (input.reference?.trim() ? `Abastecimiento Control: ${input.reference.trim()}` : 'Abastecimiento académico Primax Control').slice(0, 200);
    return this.db.atomic(async (tx) => {
      const replay = await tx.inventoryMovement.findUnique({ where: { eventKey } });
      if (replay) {
        if (replay.actorId !== actor.userId || replay.stationId !== input.stationId || replay.fuelId !== input.fuelId || !replay.physicalDeltaLiters.eq(liters) || replay.reason !== reason)
          throw new ConflictException('El identificador de abastecimiento ya se usó con otros datos');
        return { movement: replay, replayed: true };
      }
      await tx.$queryRaw`SELECT "stationId" FROM "FuelInventory" WHERE "stationId"=${input.stationId}::uuid AND "fuelId"=${input.fuelId}::uuid FOR UPDATE`;
      const inventory = await tx.fuelInventory.findUnique({ where: { stationId_fuelId: { stationId: input.stationId, fuelId: input.fuelId } }, include: { station: { select: { active: true } }, fuel: { select: { active: true } }, activation: true } });
      if (!inventory || !inventory.station.active || !inventory.fuel.active) throw new NotFoundException('Par estación/combustible activo no encontrado');
      if (!inventory.activation) throw new ConflictException('Par de inventario sin estado de activación');
      if (inventory.activation.status === InventoryActivationStatus.REVIEW) throw new ConflictException('Inventario en REVIEW; inspecciona y concilia antes de registrar el abastecimiento');
      if (inventory.reservedLiters.gt(inventory.liters)) throw new ConflictException('Inventario reservado inconsistente');
      const movements = await tx.inventoryMovement.findMany({ where: { stationId: input.stationId, fuelId: input.fuelId }, orderBy: { sequence: 'desc' }, take: 1 });
      const previous = movements[0];
      if (!previous || !previous.litersAfter.eq(inventory.liters) || !previous.reservedLitersAfter.eq(inventory.reservedLiters)) throw new ConflictException('El ledger no coincide con el inventario; solicita conciliación');
      const updatedLiters = inventory.liters.plus(liters);
      if (updatedLiters.gt('99999999.999999')) throw new BadRequestException('El volumen supera la capacidad numérica del inventario');
      await tx.fuelInventory.update({ where: { stationId_fuelId: { stationId: input.stationId, fuelId: input.fuelId } }, data: { liters: updatedLiters } });
      const movement = await tx.inventoryMovement.create({ data: { eventKey, stationId: input.stationId, fuelId: input.fuelId, sequence: previous.sequence + 1n, kind: 'ADJUST_IN', physicalDeltaLiters: liters, reservedDeltaLiters: 0, litersAfter: updatedLiters, reservedLitersAfter: inventory.reservedLiters, actorKind: 'USER', actorId: actor.userId, reason } });
      await tx.operationalAuditEvent.create({ data: { eventKey: `control-audit:${movement.id}`, actorKind: 'USER', actorUserId: actor.userId, stationId: input.stationId, action: 'INVENTORY_SUPPLY_RECEIVED', targetId: movement.id, outcome: 'SUCCESS', details: { fuelId: input.fuelId, liters: liters.toFixed(6), reference: input.reference?.trim() || null, reservedLiters: inventory.reservedLiters.toFixed(6) } } });
      return { movement, replayed: false };
    });
  }

  async reconciliation(actor: ControlActor, stationId: string, fuelId: string) {
    await this.scope(actor, stationId, AdminControlPermission.ADMIN_INVENTORY_VIEW);
    return this.reconciliationServiceInspect(stationId, fuelId);
  }

  private reconciliationServiceInspect(stationId: string, fuelId: string) {
    return this.reconciliationService.inspect(stationId, fuelId);
  }

  async reconcile(actor: ControlActor, stationId: string, fuelId: string) {
    await this.scope(actor, stationId, AdminControlPermission.ADMIN_INVENTORY_RECONCILE);
    const before = await this.reconciliationService.inspect(stationId, fuelId);
    try {
      const result = await this.reconciliationService.reconcile(stationId, fuelId);
      await this.db.operationalAuditEvent.create({ data: { eventKey: `control-reconcile:${stationId}:${fuelId}:${randomUUID()}`, actorKind: 'USER', actorUserId: actor.userId, stationId, action: 'INVENTORY_RECONCILIATION_ATTEMPT', targetId: `${stationId}:${fuelId}`, outcome: 'SUCCESS', details: { previousStatus: before.status, status: result.status, issueCount: result.issues.length } } });
      return result;
    } catch (error) {
      await this.db.operationalAuditEvent.create({ data: { eventKey: `control-reconcile:${stationId}:${fuelId}:${randomUUID()}`, actorKind: 'USER', actorUserId: actor.userId, stationId, action: 'INVENTORY_RECONCILIATION_ATTEMPT', targetId: `${stationId}:${fuelId}`, outcome: 'ERROR', details: { previousStatus: before.status, message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' } } });
      throw error;
    }
  }

  async audit(actor: ControlActor, filters: { stationId?: string; actorUserId?: string; action?: string; from?: Date; to?: Date }) {
    const ids = await this.scope(actor, filters.stationId, AdminControlPermission.ADMIN_AUDIT_VIEW);
    const range = this.dateRange(filters.from, filters.to);
    return this.db.operationalAuditEvent.findMany({
      where: { ...(ids ? { stationId: { in: ids } } : {}), ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}), ...(filters.action ? { action: { contains: filters.action, mode: 'insensitive' } } : {}), ...(range.from || range.to ? { createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {}) },
      include: { actorUser: { select: { id: true, name: true, email: true } }, station: { select: { id: true, code: true, name: true } }, terminal: { select: { id: true, code: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
