import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OperationalIncident,
  OperationalIncidentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient;

@Injectable()
export class IncidentsService {
  constructor(private readonly db: PrismaService) {}

  /** Creates the single stable INC-001 for a confirmed prepaid operation halted at zero progress. */
  async recordConfirmedPaymentWithoutDispense(
    tx: Db,
    authorization: {
      id: string;
      operationId: string;
      stationId: string;
      terminalOperationId: string | null;
      terminalId: string | null;
      pumpId: string | null;
      paymentId: string | null;
      mode: string;
      status: string;
      dispensedAmount: Prisma.Decimal;
    },
  ) {
    if (
      authorization.mode !== 'PREPAGO' ||
      authorization.status !== 'INTERVENTION_REQUIRED' ||
      !authorization.dispensedAmount.isZero() ||
      !authorization.paymentId
    )
      return null;

    const existing = await tx.operationalIncident.findUnique({
      where: {
        code_operationId: {
          code: 'INC_001',
          operationId: authorization.operationId,
        },
      },
    });
    if (existing) return existing;

    const payment = await tx.payment.findUnique({
      where: { id: authorization.paymentId },
    });
    if (
      !payment ||
      payment.operationId !== authorization.operationId ||
      payment.status !== 'CAPTURED' ||
      payment.amount.lte(0) ||
      !payment.refundedAmount.isZero()
    )
      return null;
    const transaction = await tx.transaction.findUnique({
      where: { operationId: authorization.operationId },
    });
    if (transaction) return null;

    const operation = authorization.terminalOperationId
      ? await tx.terminalOperation.findUnique({
          where: { id: authorization.terminalOperationId },
        })
      : null;
    if (
      operation &&
      (operation.operationId !== authorization.operationId ||
        operation.stationId !== authorization.stationId ||
        (authorization.terminalId && operation.terminalId !== authorization.terminalId) ||
        (authorization.pumpId && operation.pumpId !== authorization.pumpId))
    )
      throw new ConflictException('Vínculos de operación incompatibles');

    const incident = await tx.operationalIncident.create({
      data: {
        eventKey: `INC-001:${authorization.operationId}`,
        code: 'INC_001',
        severity: 'HIGH',
        stationId: authorization.stationId,
        terminalId: operation?.terminalId ?? authorization.terminalId,
        pumpId: operation?.pumpId ?? authorization.pumpId,
        operationId: authorization.operationId,
        terminalOperationId: operation?.id,
        authorizationId: authorization.id,
        paymentId: payment.id,
        summary:
          'Pago confirmado con despacho detenido antes de registrar combustible.',
        context: {
          paymentStatus: payment.status,
          paymentMethod: payment.method,
          authorizationStatus: authorization.status,
          dispensedAmount: authorization.dispensedAmount.toFixed(2),
          refundedAmount: payment.refundedAmount.toFixed(2),
        },
      },
    });
    await tx.operationalAuditEvent.create({
      data: {
        eventKey: `incident:${incident.id}:opened`,
        actorKind: 'SYSTEM',
        stationId: incident.stationId,
        terminalId: incident.terminalId,
        action: 'INCIDENT_OPENED',
        targetId: incident.id,
        outcome: 'SUCCESS',
        details: { code: incident.code, operationId: incident.operationId },
      },
    });
    return incident;
  }

  private async assigned(userId: string, stationId: string) {
    const assignment = await this.db.supervisorStationAssignment.findFirst({
      where: {
        userId,
        stationId,
        endedAt: null,
        user: { active: true },
        station: { active: true },
      },
    });
    if (!assignment)
      throw new ForbiddenException('Supervisor no asignado a esta estación');
  }

  async list(
    userId: string,
    stationId: string,
    status?: OperationalIncidentStatus,
  ) {
    await this.assigned(userId, stationId);
    return this.db.operationalIncident.findMany({
      where: { stationId, ...(status ? { status } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        code: true,
        status: true,
        severity: true,
        stationId: true,
        terminalId: true,
        pumpId: true,
        operationId: true,
        terminalOperationId: true,
        authorizationId: true,
        transactionId: true,
        paymentId: true,
        summary: true,
        context: true,
        resolution: true,
        resolvedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async detail(userId: string, id: string) {
    const incident = await this.db.operationalIncident.findUnique({
      where: { id },
      include: {
        payment: {
          select: {
            id: true,
            status: true,
            method: true,
            amount: true,
            refundedAmount: true,
          },
        },
        authorization: {
          select: {
            id: true,
            status: true,
            mode: true,
            dispensedAmount: true,
            dispensedGallons: true,
          },
        },
        transaction: {
          select: { id: true, status: true, amount: true, gallons: true },
        },
      },
    });
    if (!incident) throw new NotFoundException('Incidente no encontrado');
    await this.assigned(userId, incident.stationId);
    return incident;
  }

  async changeStatus(
    userId: string,
    id: string,
    status: OperationalIncidentStatus,
    reason: string,
  ): Promise<OperationalIncident> {
    const incident = await this.db.operationalIncident.findUnique({
      where: { id },
    });
    if (!incident) throw new NotFoundException('Incidente no encontrado');
    await this.assigned(userId, incident.stationId);
    if (incident.status === status) return incident;
    if (incident.status === 'RESOLVED' || incident.status === 'DISMISSED')
      throw new ConflictException('El incidente ya tiene un estado final');
    if (status === 'OPEN')
      throw new ConflictException('El incidente no admite reapertura');
    if (status === 'RESOLVED' && incident.status !== 'IN_REVIEW')
      throw new ConflictException(
        'El incidente debe estar en revisión para resolverse',
      );

    return this.db.atomic(async (tx) => {
      const current = await tx.operationalIncident.findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException('Incidente no encontrado');
      if (current.status === status) return current;
      if (current.status === 'RESOLVED' || current.status === 'DISMISSED')
        throw new ConflictException('El incidente ya tiene un estado final');
      if (status === 'RESOLVED' && current.status !== 'IN_REVIEW')
        throw new ConflictException(
          'El incidente debe estar en revisión para resolverse',
        );
      const final = status === 'RESOLVED' || status === 'DISMISSED';
      const updated = await tx.operationalIncident.update({
        where: { id },
        data: {
          status,
          resolution: final ? reason : current.resolution,
          resolvedAt: final ? new Date() : null,
          resolvedByUserId: final ? userId : null,
        },
      });
      await tx.operationalAuditEvent.create({
        data: {
          eventKey: `incident:${id}:${status.toLowerCase()}`,
          actorKind: 'USER',
          actorUserId: userId,
          stationId: incident.stationId,
          terminalId: incident.terminalId,
          action: `INCIDENT_${status}`,
          targetId: id,
          outcome: 'SUCCESS',
          details: { reason },
        },
      });
      return updated;
    });
  }
}
