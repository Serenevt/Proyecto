import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, ShiftStatus, TerminalOperationalStatus } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient;
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class OperationsService {
  constructor(private readonly db: PrismaService) {}

  private async operationalAtomic<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    try {
      return await this.db.atomic(work, { retryUnique: false });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' ||
          (error.code === 'P2010' && error.meta?.code === '23505'))
      )
        throw new ConflictException(
          'Ya existe una asignación u operación activa',
        );
      throw error;
    }
  }

  private audit(
    tx: Db,
    action: string,
    actorUserId: string | null,
    stationId: string | null,
    terminalId: string | null,
    targetId: string | null,
    shiftId: string | null = null,
    actorKind?: 'USER' | 'TERMINAL' | 'SYSTEM',
    details?: Prisma.InputJsonValue,
  ) {
    return tx.operationalAuditEvent.create({
      data: {
        eventKey: randomUUID(),
        actorKind: actorKind ?? (actorUserId ? 'USER' : 'SYSTEM'),
        actorUserId,
        stationId,
        terminalId,
        shiftId,
        action,
        targetId,
        outcome: 'SUCCESS',
        details,
      },
    });
  }

  async stations(userId: string) {
    return this.db.supervisorStationAssignment.findMany({
      where: { userId, endedAt: null, station: { active: true } },
      select: {
        stationId: true,
        station: { select: { code: true, name: true } },
      },
    });
  }

  private async assigned(tx: Db, userId: string, stationId: string) {
    const row = await tx.supervisorStationAssignment.findFirst({
      where: {
        userId,
        stationId,
        endedAt: null,
        user: { active: true },
        station: { active: true },
      },
    });
    if (!row)
      throw new ForbiddenException('Supervisor no asignado a esta estación');
    return row;
  }

  async openShift(userId: string, stationId: string) {
    return this.operationalAtomic(async (tx) => {
      const assignment = await this.assigned(tx, userId, stationId);
      const shift = await tx.supervisorShift.create({
        data: {
          supervisorUserId: userId,
          stationId,
          assignmentId: assignment.id,
        },
      });
      await this.audit(
        tx,
        'SHIFT_OPENED',
        userId,
        stationId,
        null,
        shift.id,
        shift.id,
      );
      return shift;
    });
  }

  async currentShift(userId: string) {
    return this.db.supervisorShift.findFirst({
      where: { supervisorUserId: userId, closedAt: null },
      include: { station: { select: { id: true, code: true, name: true } } },
      orderBy: { openedAt: 'desc' },
    });
  }

  private async ownedShift(tx: Db, userId: string, id: string) {
    const shift = await tx.supervisorShift.findUnique({ where: { id } });
    if (!shift || shift.supervisorUserId !== userId)
      throw new NotFoundException('Turno no encontrado');
    await this.assigned(tx, userId, shift.stationId);
    return shift;
  }

  async shiftState(
    userId: string,
    id: string,
    action: 'suspend' | 'resume' | 'close',
  ) {
    return this.operationalAtomic(async (tx) => {
      const shift = await this.ownedShift(tx, userId, id);
      const expected: Record<typeof action, ShiftStatus> = {
        suspend: 'ABIERTO',
        resume: 'SUSPENDIDO',
        close: 'ABIERTO',
      };
      if (
        shift.status !== expected[action] &&
        !(action === 'close' && shift.status === 'SUSPENDIDO')
      )
        throw new ConflictException('Estado de turno incompatible');
      if (action !== 'close') {
        const updated = await tx.supervisorShift.update({
          where: { id },
          data: {
            status: action === 'suspend' ? 'SUSPENDIDO' : 'ABIERTO',
            suspendedAt: action === 'suspend' ? new Date() : null,
            version: { increment: 1 },
          },
        });
        const enablements = await tx.terminalEnablement.findMany({
          where: { shiftId: id, disabledAt: null },
        });
        for (const enablement of enablements) {
          const active = await tx.terminalOperation.findFirst({
            where: { terminalId: enablement.terminalId, closedAt: null },
          });
          if (!active)
            await tx.terminal.update({
              where: { id: enablement.terminalId },
              data: {
                operationalStatus:
                  action === 'suspend' ? 'BLOQUEADA' : 'DISPONIBLE',
                statusVersion: { increment: 1 },
              },
            });
        }
        await this.audit(
          tx,
          action === 'suspend' ? 'SHIFT_SUSPENDED' : 'SHIFT_RESUMED',
          userId,
          shift.stationId,
          null,
          id,
          id,
        );
        return updated;
      }
      const now = new Date();
      const enablements = await tx.terminalEnablement.findMany({
        where: { shiftId: id, disabledAt: null },
      });
      for (const enablement of enablements) {
        await tx.terminalEnablement.update({
          where: { id: enablement.id },
          data: { disabledAt: now, disableReason: 'SHIFT_CLOSED' },
        });
        const active = await tx.terminalOperation.findFirst({
          where: { terminalId: enablement.terminalId, closedAt: null },
        });
        if (!active)
          await tx.terminal.update({
            where: { id: enablement.terminalId },
            data: {
              operationalStatus: 'BLOQUEADA',
              statusVersion: { increment: 1 },
            },
          });
      }
      const pending = await tx.terminalOperation.count({
        where: { enablement: { shiftId: id }, closedAt: null },
      });
      const updated = await tx.supervisorShift.update({
        where: { id },
        data: {
          status: pending ? 'CIERRE_PENDIENTE' : 'CERRADO',
          closeRequestedAt: now,
          closedAt: pending ? null : now,
          version: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        'SHIFT_CLOSE_REQUESTED',
        userId,
        shift.stationId,
        null,
        id,
        id,
      );
      return updated;
    });
  }

  async terminals(userId: string, stationId: string) {
    await this.assigned(this.db, userId, stationId);
    const terminals = await this.db.terminal.findMany({
      where: { stationId },
      include: {
        assignments: { where: { endedAt: null }, include: { pump: true } },
        enablements: { where: { disabledAt: null } },
        operations: { where: { closedAt: null } },
      },
      orderBy: { code: 'asc' },
    });
    return Promise.all(terminals.map(async terminal => ({
      ...terminal,
      operations: await Promise.all(terminal.operations.map(async operation => ({
        ...operation,
        canCancelWithoutSale: !(await this.db.fuelAuthorization.findFirst({where:{operationId:operation.operationId}})) &&
          !(await this.db.transaction.findFirst({where:{operationId:operation.operationId}})) &&
          !(await this.db.inventoryReservation.findFirst({where:{operationId:operation.operationId,status:{in:['PENDING_PAYMENT','ACTIVE','REVIEW']}}})) &&
          !(await this.db.onlineOrder.findFirst({where:{operationId:operation.operationId,status:{in:['CREATING','PENDING','CAPTURED','REFUNDING']}}})),
      }))),
    })));
  }

  async cancelUnpaidOperation(userId: string, operationId: string) {
    const operation = await this.db.terminalOperation.findUnique({where:{operationId}});
    if (!operation) throw new NotFoundException('Operación no encontrada');
    await this.assigned(this.db, userId, operation.stationId);
    if (await this.db.fuelAuthorization.findFirst({where:{operationId}}) ||
        await this.db.transaction.findFirst({where:{operationId}}) ||
        await this.db.inventoryReservation.findFirst({where:{operationId,status:{in:['PENDING_PAYMENT','ACTIVE','REVIEW']}}}) ||
        await this.db.onlineOrder.findFirst({where:{operationId,status:{in:['CREATING','PENDING','CAPTURED','REFUNDING']}}}))
      throw new ConflictException('Hay una venta o pago activo; requiere conciliación');
    return this.closeOperation(operation.terminalId, operationId, userId);
  }

  async enable(userId: string, terminalId: string, shiftId: string) {
    return this.operationalAtomic(async (tx) => {
      const shift = await this.ownedShift(tx, userId, shiftId);
      if (shift.status !== 'ABIERTO')
        throw new ConflictException('El turno no está abierto');
      const terminal = await tx.terminal.findUnique({
        where: { id: terminalId },
      });
      if (!terminal || terminal.stationId !== shift.stationId)
        throw new NotFoundException('Terminal no encontrada en estación');
      if (
        terminal.lifecycle !== 'REGISTRADA' ||
        terminal.operationalStatus === 'FUERA_DE_SERVICIO'
      )
        throw new ConflictException('Terminal no habilitable');
      const assignment = await tx.terminalPumpAssignment.findFirst({
        where: {
          terminalId,
          stationId: shift.stationId,
          endedAt: null,
          pump: { active: true },
        },
      });
      if (!assignment)
        throw new ConflictException('Terminal sin surtidor activo');
      const active = await tx.terminalOperation.findFirst({
        where: { terminalId, closedAt: null },
      });
      if (active) throw new ConflictException('Terminal con operación activa');
      const enablement = await tx.terminalEnablement.create({
        data: {
          stationId: shift.stationId,
          terminalId,
          terminalPumpAssignmentId: assignment.id,
          shiftId,
          enabledByUserId: userId,
        },
      });
      await tx.terminal.update({
        where: { id: terminalId },
        data: {
          operationalStatus: 'DISPONIBLE',
          statusVersion: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        'TERMINAL_ENABLED',
        userId,
        shift.stationId,
        terminalId,
        enablement.id,
        shiftId,
      );
      return enablement;
    });
  }

  async block(userId: string, terminalId: string) {
    return this.operationalAtomic(async (tx) => {
      const terminal = await tx.terminal.findUnique({
        where: { id: terminalId },
      });
      if (!terminal) throw new NotFoundException('Terminal no encontrada');
      await this.assigned(tx, userId, terminal.stationId);
      const enablement = await tx.terminalEnablement.findFirst({
        where: { terminalId, disabledAt: null },
      });
      if (!enablement) throw new ConflictException('Terminal ya bloqueada');
      await tx.terminalEnablement.update({
        where: { id: enablement.id },
        data: { disabledAt: new Date(), disableReason: 'SUPERVISOR_BLOCK' },
      });
      const active = await tx.terminalOperation.findFirst({
        where: { terminalId, closedAt: null },
      });
      await tx.terminal.update({
        where: { id: terminalId },
        data: {
          operationalStatus: active ? 'ASISTENCIA' : 'BLOQUEADA',
          statusVersion: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        'TERMINAL_BLOCKED',
        userId,
        terminal.stationId,
        terminalId,
        enablement.id,
        enablement.shiftId,
      );
      return {
        terminalId,
        operationalStatus: active ? 'ASISTENCIA' : 'BLOQUEADA',
      };
    });
  }

  async restore(userId: string, terminalId: string) {
    return this.operationalAtomic(async (tx) => {
      const terminal = await tx.terminal.findUnique({
        where: { id: terminalId },
      });
      if (!terminal || terminal.lifecycle !== 'REGISTRADA')
        throw new NotFoundException('Terminal no disponible');
      await this.assigned(tx, userId, terminal.stationId);
      if (
        !['ASISTENCIA', 'FUERA_DE_SERVICIO'].includes(
          terminal.operationalStatus,
        )
      )
        throw new ConflictException('Terminal no requiere recuperación');
      if (
        await tx.terminalOperation.findFirst({
          where: { terminalId, closedAt: null },
        })
      )
        throw new ConflictException('Resuelve primero la operación pendiente');
      const enabled = await tx.terminalEnablement.findFirst({
        where: { terminalId, disabledAt: null, shift: { status: 'ABIERTO' } },
      });
      const status: TerminalOperationalStatus = enabled
        ? 'DISPONIBLE'
        : 'BLOQUEADA';
      const result = await tx.terminal.update({
        where: { id: terminalId },
        data: { operationalStatus: status, statusVersion: { increment: 1 } },
      });
      await this.audit(
        tx,
        'TERMINAL_RESTORED',
        userId,
        terminal.stationId,
        terminalId,
        terminalId,
      );
      return result;
    });
  }

  async issueCredential(userId: string, terminalId: string, rotate = false) {
    return this.operationalAtomic(async (tx) => {
      const terminal = await tx.terminal.findUnique({
        where: { id: terminalId },
      });
      if (!terminal || terminal.lifecycle !== 'REGISTRADA')
        throw new NotFoundException('Terminal no disponible');
      await this.assigned(tx, userId, terminal.stationId);
      const enablement = await tx.terminalEnablement.findFirst({
        where: { terminalId, disabledAt: null, shift: { status: 'ABIERTO' } },
      });
      if (!enablement)
        throw new ConflictException('Terminal no habilitada por turno abierto');
      const previous = await tx.terminalCredential.findFirst({
        where: { terminalId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { issuedAt: 'desc' },
      });
      if (previous && !rotate)
        throw new ConflictException(
          'La terminal ya tiene sesión; usa rotación',
        );
      const now = new Date();
      const token = randomBytes(32).toString('hex');
      await tx.terminalCredential.updateMany({
        where: { terminalId, revokedAt: null },
        data: { revokedAt: now },
      });
      const credential = await tx.terminalCredential.create({
        data: {
          terminalId,
          tokenHash: tokenHash(token),
          expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
          rotatedFromId: previous?.id,
        },
      });
      await this.audit(
        tx,
        rotate ? 'TERMINAL_CREDENTIAL_ROTATED' : 'TERMINAL_CREDENTIAL_ISSUED',
        userId,
        terminal.stationId,
        terminalId,
        credential.id,
        enablement.shiftId,
      );
      return { token, expiresAt: credential.expiresAt, terminalId };
    });
  }

  async revokeCredential(userId: string, terminalId: string) {
    return this.operationalAtomic(async (tx) => {
      const terminal = await tx.terminal.findUnique({
        where: { id: terminalId },
      });
      if (!terminal) throw new NotFoundException('Terminal no encontrada');
      await this.assigned(tx, userId, terminal.stationId);
      const result = await tx.terminalCredential.updateMany({
        where: { terminalId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit(
        tx,
        'TERMINAL_CREDENTIAL_REVOKED',
        userId,
        terminal.stationId,
        terminalId,
        String(result.count),
      );
      return { revoked: result.count };
    });
  }

  async terminalMe(terminalId: string) {
    const terminal = await this.db.terminal.findUnique({
      where: { id: terminalId },
      include: {
        assignments: { where: { endedAt: null }, include: { pump: true } },
        enablements: { where: { disabledAt: null }, include: { shift: true } },
        operations: { where: { closedAt: null } },
      },
    });
    if (!terminal || terminal.lifecycle !== 'REGISTRADA')
      throw new UnauthorizedException('Terminal revocada');
    return {
      id: terminal.id,
      stationId: terminal.stationId,
      code: terminal.code,
      lifecycle: terminal.lifecycle,
      operationalStatus: terminal.operationalStatus,
      pump: terminal.assignments[0]?.pump ?? null,
      canStart:
        terminal.operationalStatus === 'DISPONIBLE' &&
        terminal.enablements[0]?.shift.status === 'ABIERTO' &&
        terminal.operations.length === 0,
    };
  }

  async startOperation(terminalId: string, operationId: string) {
    return this.operationalAtomic(async (tx) => {
      const existing = await tx.terminalOperation.findUnique({
        where: { operationId },
      });
      if (existing) {
        if (existing.terminalId !== terminalId)
          throw new NotFoundException('Operación no encontrada');
        return existing;
      }
      const terminal = await tx.terminal.findUnique({
        where: { id: terminalId },
      });
      if (
        !terminal ||
        terminal.lifecycle !== 'REGISTRADA' ||
        terminal.operationalStatus !== 'DISPONIBLE'
      )
        throw new ConflictException('Terminal no disponible');
      const enablement = await tx.terminalEnablement.findFirst({
        where: { terminalId, disabledAt: null, shift: { status: 'ABIERTO' } },
      });
      if (!enablement) throw new ForbiddenException('Terminal no habilitada');
      if (enablement.stationId !== terminal.stationId)
        throw new ConflictException('Habilitación de otra estación');
      const active = await tx.terminalOperation.findFirst({
        where: { terminalId, closedAt: null },
      });
      if (active) throw new ConflictException('Terminal con operación activa');
      const assignment = await tx.terminalPumpAssignment.findUnique({
        where: { id: enablement.terminalPumpAssignmentId },
        include: { pump: true },
      });
      if (
        !assignment ||
        assignment.endedAt ||
        !assignment.pump.active ||
        assignment.stationId !== terminal.stationId ||
        assignment.terminalId !== terminalId ||
        assignment.pump.stationId !== terminal.stationId
      )
        throw new ConflictException('Asignación de surtidor inválida');
      const operation = await tx.terminalOperation.create({
        data: {
          operationId,
          stationId: terminal.stationId,
          pumpId: assignment.pumpId,
          terminalId,
          terminalPumpAssignmentId: assignment.id,
          enablementId: enablement.id,
        },
      });
      await tx.terminal.update({
        where: { id: terminalId },
        data: { operationalStatus: 'EN_USO', statusVersion: { increment: 1 } },
      });
      await this.audit(
        tx,
        'OPERATION_OPENED',
        null,
        terminal.stationId,
        terminalId,
        operation.id,
        enablement.shiftId,
        'TERMINAL',
      );
      return operation;
    });
  }

  async operation(terminalId: string, operationId: string) {
    const operation = await this.db.terminalOperation.findUnique({
      where: { operationId },
    });
    if (!operation || operation.terminalId !== terminalId)
      throw new NotFoundException('Operación no encontrada');
    return operation;
  }

  async closeOperation(terminalId: string, operationId: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const operation = await tx.terminalOperation.findUnique({
        where: { operationId },
        include: { enablement: true },
      });
      if (!operation || operation.terminalId !== terminalId)
        throw new NotFoundException('Operación no encontrada');
      if (operation.closedAt) return operation;
      const terminal = await tx.terminal.findUniqueOrThrow({
        where: { id: terminalId },
      });
      if (terminal.lifecycle === 'REVOCADA')
        throw new UnauthorizedException(
          'Terminal revocada; requiere supervisor',
        );
      const [authorizations, transactions, inventoryReservations] = await Promise.all([
        tx.fuelAuthorization.findMany({
          where: {
            OR: [{ terminalOperationId: operation.id }, { operationId }],
          },
        }),
        tx.transaction.findMany({
          where: {
            OR: [{ terminalOperationId: operation.id }, { operationId }],
          },
        }),
        tx.inventoryReservation.findMany({
          where: { operationId },
          select: { status: true },
        }),
      ]);
      const transaction = transactions[0];
      if (transactions.length > 1 || authorizations.length > 1)
        throw new ConflictException(
          'Vínculos financieros ambiguos; requiere conciliación',
        );
      const authorization = authorizations[0];
      if (
        inventoryReservations.some((reservation) =>
          ['PENDING_PAYMENT', 'ACTIVE', 'REVIEW'].includes(reservation.status),
        )
      )
        throw new ConflictException(
          'Autorización pendiente: reserva de inventario requiere cierre o conciliación',
        );
      if (
        authorization &&
        (authorization.operationId !== operationId ||
          authorization.stationId !== operation.stationId ||
          (authorization.terminalOperationId &&
            authorization.terminalOperationId !== operation.id) ||
          (authorization.terminalId &&
            authorization.terminalId !== operation.terminalId) ||
          (authorization.pumpId && authorization.pumpId !== operation.pumpId) ||
          (authorization.terminalPumpAssignmentId &&
            authorization.terminalPumpAssignmentId !==
              operation.terminalPumpAssignmentId))
      )
        throw new ConflictException(
          'Autorización no coincide con la operación; requiere conciliación',
        );
      if (
        transaction &&
        (transaction.operationId !== operationId ||
          transaction.stationId !== operation.stationId ||
          (authorization && transaction.authorizationId !== authorization.id) ||
          (transaction.terminalOperationId &&
            transaction.terminalOperationId !== operation.id) ||
          (transaction.terminalId &&
            transaction.terminalId !== operation.terminalId) ||
          (transaction.pumpId && transaction.pumpId !== operation.pumpId) ||
          (transaction.terminalPumpAssignmentId &&
            transaction.terminalPumpAssignmentId !==
              operation.terminalPumpAssignmentId))
      )
        throw new ConflictException(
          'Transacción no coincide con la operación; requiere conciliación',
        );
      if (
        authorization &&
        ['RESERVED', 'DISPENSING', 'INTERVENTION_REQUIRED'].includes(
          authorization.status,
        )
      )
        throw new ConflictException(
          'Autorización pendiente de liquidación o conciliación',
        );
      if (authorization?.status === 'SETTLED' && !transaction)
        throw new ConflictException(
          'Autorización liquidada sin transacción; requiere conciliación',
        );
      if (!authorization && transaction)
        throw new ConflictException(
          'Transacción sin autorización asociada; requiere conciliación',
        );
      if (authorization?.status === 'RELEASED' && transaction)
        throw new ConflictException(
          'Autorización liberada con transacción; requiere conciliación',
        );
      const updated = await tx.terminalOperation.update({
        where: { id: operation.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          version: { increment: 1 },
        },
      });
      const enabled = await tx.terminalEnablement.findFirst({
        where: { terminalId, disabledAt: null, shift: { status: 'ABIERTO' } },
      });
      await tx.terminal.update({
        where: { id: terminalId },
        data: {
          operationalStatus: enabled ? 'DISPONIBLE' : 'BLOQUEADA',
          statusVersion: { increment: 1 },
        },
      });
      const shift = await tx.supervisorShift.findUnique({
        where: { id: operation.enablement.shiftId },
      });
      if (shift?.status === 'CIERRE_PENDIENTE') {
        const pending = await tx.terminalOperation.count({
          where: { enablement: { shiftId: shift.id }, closedAt: null },
        });
        if (!pending)
          await tx.supervisorShift.update({
            where: { id: shift.id },
            data: {
              status: 'CERRADO',
              closedAt: new Date(),
              version: { increment: 1 },
            },
          });
      }
      await this.audit(
        tx,
        'OPERATION_CLOSED',
        actorUserId ?? null,
        operation.stationId,
        terminalId,
        operation.id,
        operation.enablement.shiftId,
        actorUserId ? 'USER' : 'TERMINAL',
      );
      return updated;
    });
  }

  async resolveOperation(userId: string, operationId: string, reason: string) {
    return this.operationalAtomic(async (tx) => {
      const operation = await tx.terminalOperation.findUnique({
        where: { operationId },
        include: { enablement: true, terminal: true },
      });
      if (!operation) throw new NotFoundException('Operación no encontrada');
      await this.assigned(tx, userId, operation.stationId);
      if (operation.closedAt) return operation;
      if (
        operation.status !== 'INTERVENTION_REQUIRED' &&
        !['ASISTENCIA', 'FUERA_DE_SERVICIO'].includes(
          operation.terminal.operationalStatus,
        )
      )
        throw new ConflictException('Operación sin intervención requerida');
      const activeAuth = await tx.fuelAuthorization.findFirst({
        where: {
          OR: [{ terminalOperationId: operation.id }, { operationId }],
          status: { in: ['RESERVED', 'DISPENSING', 'INTERVENTION_REQUIRED'] },
        },
      });
      if (activeAuth)
        throw new ConflictException('Autorización pendiente de conciliación');
      const activeInventory = await tx.inventoryReservation.findFirst({
        where: {
          operationId,
          status: { in: ['PENDING_PAYMENT', 'ACTIVE', 'REVIEW'] },
        },
      });
      if (activeInventory)
        throw new ConflictException(
          'Autorización pendiente: reserva de inventario requiere conciliación',
        );
      const now = new Date();
      const result = await tx.terminalOperation.update({
        where: { id: operation.id },
        data: { status: 'CLOSED', closedAt: now, version: { increment: 1 } },
      });
      await tx.terminal.update({
        where: { id: operation.terminalId },
        data: {
          operationalStatus:
            operation.terminal.lifecycle === 'REVOCADA'
              ? 'FUERA_DE_SERVICIO'
              : 'ASISTENCIA',
          statusVersion: { increment: 1 },
        },
      });
      if (operation.terminal.lifecycle === 'REVOCADA')
        await tx.terminalPumpAssignment.updateMany({
          where: { terminalId: operation.terminalId, endedAt: null },
          data: {
            endedAt: now,
            endReason: 'Terminal revocada; intervención completada',
          },
        });
      const shift = await tx.supervisorShift.findUnique({
        where: { id: operation.enablement.shiftId },
      });
      if (shift?.status === 'CIERRE_PENDIENTE') {
        const pending = await tx.terminalOperation.count({
          where: { enablement: { shiftId: shift.id }, closedAt: null },
        });
        if (!pending)
          await tx.supervisorShift.update({
            where: { id: shift.id },
            data: {
              status: 'CERRADO',
              closedAt: now,
              version: { increment: 1 },
            },
          });
      }
      await this.audit(
        tx,
        'OPERATION_RESOLVED',
        userId,
        operation.stationId,
        operation.terminalId,
        operation.id,
        operation.enablement.shiftId,
        'USER',
        { reason },
      );
      return result;
    });
  }

  async grantAdmin(userId: string, reason: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user?.active) throw new NotFoundException('Usuario no encontrado');
      const grant = await tx.userPermissionGrant.create({
        data: {
          userId,
          permission: 'SYSTEM_ADMIN',
          reason,
          grantedByUserId: actorUserId,
        },
      });
      await this.audit(
        tx,
        'ADMIN_GRANTED',
        actorUserId ?? null,
        null,
        null,
        grant.id,
      );
      return grant;
    });
  }

  async revokeAdminGrant(id: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const grant = await tx.userPermissionGrant.findUnique({ where: { id } });
      if (!grant || grant.revokedAt)
        throw new NotFoundException('Permiso no vigente');
      const result = await tx.userPermissionGrant.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await this.audit(
        tx,
        'ADMIN_REVOKED',
        actorUserId ?? null,
        null,
        null,
        id,
      );
      return result;
    });
  }

  async assignSupervisor(
    userId: string,
    stationId: string,
    reason: string,
    actorUserId?: string,
  ) {
    return this.operationalAtomic(async (tx) => {
      const [user, station] = await Promise.all([
        tx.user.findUnique({ where: { id: userId } }),
        tx.station.findUnique({ where: { id: stationId } }),
      ]);
      if (!user?.active || !station?.active)
        throw new NotFoundException('Usuario o estación no disponible');
      const assignment = await tx.supervisorStationAssignment.create({
        data: { userId, stationId, reason, grantedByUserId: actorUserId },
      });
      await this.audit(
        tx,
        'SUPERVISOR_ASSIGNED',
        actorUserId ?? null,
        stationId,
        null,
        assignment.id,
      );
      return assignment;
    });
  }

  async endSupervisorAssignment(id: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const row = await tx.supervisorStationAssignment.findUnique({
        where: { id },
      });
      if (!row || row.endedAt)
        throw new NotFoundException('Asignación no vigente');
      const open = await tx.supervisorShift.count({
        where: { assignmentId: id, closedAt: null },
      });
      if (open)
        throw new ConflictException(
          'Cierra el turno antes de finalizar asignación',
        );
      const result = await tx.supervisorStationAssignment.update({
        where: { id },
        data: { endedAt: new Date() },
      });
      await this.audit(
        tx,
        'SUPERVISOR_ASSIGNMENT_ENDED',
        actorUserId ?? null,
        row.stationId,
        null,
        id,
      );
      return result;
    });
  }

  async createPump(
    stationId: string,
    code: string,
    name: string,
    actorUserId?: string,
  ) {
    return this.operationalAtomic(async (tx) => {
      const station = await tx.station.findUnique({ where: { id: stationId } });
      if (!station?.active)
        throw new NotFoundException('Estación no disponible');
      const pump = await tx.pump.create({ data: { stationId, code, name } });
      await this.audit(
        tx,
        'PUMP_CREATED',
        actorUserId ?? null,
        stationId,
        null,
        pump.id,
      );
      return pump;
    });
  }

  async createTerminal(stationId: string, code: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const station = await tx.station.findUnique({ where: { id: stationId } });
      if (!station?.active)
        throw new NotFoundException('Estación no disponible');
      const terminal = await tx.terminal.create({ data: { stationId, code } });
      await this.audit(
        tx,
        'TERMINAL_CREATED',
        actorUserId ?? null,
        stationId,
        terminal.id,
        terminal.id,
      );
      return terminal;
    });
  }

  async assignTerminal(
    terminalId: string,
    pumpId: string,
    actorUserId?: string,
  ) {
    return this.operationalAtomic(async (tx) => {
      const [terminal, pump] = await Promise.all([
        tx.terminal.findUnique({ where: { id: terminalId } }),
        tx.pump.findUnique({ where: { id: pumpId } }),
      ]);
      if (!terminal || !pump || terminal.stationId !== pump.stationId)
        throw new BadRequestException(
          'Terminal y surtidor pertenecen a estaciones distintas',
        );
      if (terminal.lifecycle !== 'REGISTRADA' || !pump.active)
        throw new ConflictException('Terminal o surtidor inactivo');
      const assignment = await tx.terminalPumpAssignment.create({
        data: {
          stationId: terminal.stationId,
          terminalId,
          pumpId,
          assignedByUserId: actorUserId,
        },
      });
      await this.audit(
        tx,
        'TERMINAL_PUMP_ASSIGNED',
        actorUserId ?? null,
        terminal.stationId,
        terminalId,
        assignment.id,
      );
      return assignment;
    });
  }

  async endTerminalAssignment(id: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const assignment = await tx.terminalPumpAssignment.findUnique({
        where: { id },
      });
      if (!assignment || assignment.endedAt)
        throw new NotFoundException('Asignación no vigente');
      if (
        await tx.terminalOperation.findFirst({
          where: { terminalPumpAssignmentId: id, closedAt: null },
        })
      )
        throw new ConflictException('Operación pendiente en esta asignación');
      if (
        await tx.terminalEnablement.findFirst({
          where: { terminalPumpAssignmentId: id, disabledAt: null },
        })
      )
        throw new ConflictException('Bloquea la terminal antes de reasignarla');
      const result = await tx.terminalPumpAssignment.update({
        where: { id },
        data: { endedAt: new Date(), endReason: 'Reasignación administrativa' },
      });
      await this.audit(
        tx,
        'TERMINAL_PUMP_UNASSIGNED',
        actorUserId ?? null,
        assignment.stationId,
        assignment.terminalId,
        id,
      );
      return result;
    });
  }

  async revokeTerminal(terminalId: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const terminal = await tx.terminal.findUnique({
        where: { id: terminalId },
      });
      if (!terminal) throw new NotFoundException('Terminal no encontrada');
      if (terminal.lifecycle === 'REVOCADA') return terminal;
      const now = new Date();
      await tx.terminalCredential.updateMany({
        where: { terminalId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.terminalEnablement.updateMany({
        where: { terminalId, disabledAt: null },
        data: { disabledAt: now, disableReason: 'TERMINAL_REVOKED' },
      });
      const active = await tx.terminalOperation.findFirst({
        where: { terminalId, closedAt: null },
      });
      if (active)
        await tx.terminalOperation.update({
          where: { id: active.id },
          data: { status: 'INTERVENTION_REQUIRED', version: { increment: 1 } },
        });
      if (!active)
        await tx.terminalPumpAssignment.updateMany({
          where: { terminalId, endedAt: null },
          data: { endedAt: now, endReason: 'Terminal revocada' },
        });
      const result = await tx.terminal.update({
        where: { id: terminalId },
        data: {
          lifecycle: 'REVOCADA',
          revokedAt: now,
          operationalStatus: active ? 'FUERA_DE_SERVICIO' : 'BLOQUEADA',
          statusVersion: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        'TERMINAL_REVOKED',
        actorUserId ?? null,
        terminal.stationId,
        terminalId,
        terminalId,
      );
      return result;
    });
  }
}
