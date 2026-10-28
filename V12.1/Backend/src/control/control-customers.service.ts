import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminControlPermission,
  PaymentStatus,
  Prisma,
  PurchaseMode,
  TransactionStatus,
} from '@prisma/client';
import { Actor } from '../auth/access';
import { PrismaService } from '../prisma/prisma.service';

type ControlActor = Extract<Actor, { kind: 'control' }>;
type Filter = { stationId?: string; q?: string; from?: Date; to?: Date; status?: string; mode?: PurchaseMode; method?: string };

@Injectable()
export class ControlCustomersService {
  constructor(private readonly db: PrismaService) {}

  private async scope(actor: ControlActor, stationId: string | undefined, permission: AdminControlPermission) {
    if (!actor.permissions.includes(permission)) throw new ForbiddenException('Permiso administrativo insuficiente');
    if (stationId && !actor.global && !actor.stationIds.includes(stationId)) throw new ForbiddenException('Estación fuera del alcance autorizado');
    const ids = stationId ? [stationId] : actor.global ? undefined : actor.stationIds;
    if (!actor.global && ids?.length === 0) throw new ForbiddenException('No hay estaciones asignadas');
    return ids;
  }

  private range(from?: Date, to?: Date) {
    if (from && to && from > to) throw new BadRequestException('El rango de fechas no es válido');
    return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  }

  private membershipStationFilter(ids?: string[]): Prisma.MembershipWhereInput {
    if (!ids) return {};
    return { OR: [
      { transactions: { some: { stationId: { in: ids } } } },
      { authorizations: { some: { stationId: { in: ids } } } },
    ] };
  }

  private vehicleStationFilter(ids?: string[]): Prisma.VehicleWhereInput {
    if (!ids) return {};
    return { OR: [
      { transactions: { some: { stationId: { in: ids } } } },
      { authorizations: { some: { stationId: { in: ids } } } },
    ] };
  }

  private operationSearch(q?: string) {
    const value = q?.trim();
    if (!value) return {};
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
      ? { operationId: value }
      : { plate: { contains: value, mode: 'insensitive' as const } };
  }

  async customers(actor: ControlActor, filters: Filter) {
    const ids = await this.scope(actor, filters.stationId, AdminControlPermission.ADMIN_CUSTOMER_VIEW);
    const q = filters.q?.trim();
    const members = await this.db.membership.findMany({
      where: {
        ...this.membershipStationFilter(ids),
        ...(q ? { OR: [
          { number: { contains: q, mode: 'insensitive' } },
          { user: { name: { contains: q, mode: 'insensitive' } } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
          { vehicles: { some: { plate: { contains: q, mode: 'insensitive' }, ...this.vehicleStationFilter(ids) } } },
        ] } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true, active: true, createdAt: true } },
        vehicles: { where: this.vehicleStationFilter(ids), select: { id: true, plate: true, label: true } },
        transactions: { where: ids ? { stationId: { in: ids } } : {}, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        authorizations: { where: ids ? { stationId: { in: ids } } : {}, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const canMembership = actor.permissions.includes(AdminControlPermission.ADMIN_MEMBERSHIP_VIEW);
    return members.filter((membership) => membership.user.active).map((membership) => ({
      id: membership.user.id,
      name: membership.user.name,
      email: actor.global ? membership.user.email : this.maskEmail(membership.user.email),
      active: membership.user.active,
      registeredAt: membership.user.createdAt,
      membership: canMembership ? {
        id: membership.id,
        number: membership.number,
        status: membership.status,
        ...(actor.global ? { balance: membership.balance.toFixed(2) } : {}),
      } : null,
      vehicles: actor.permissions.includes(AdminControlPermission.ADMIN_VEHICLE_VIEW) ? membership.vehicles : [],
      lastActivityAt: [membership.transactions[0]?.createdAt, membership.authorizations[0]?.createdAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null,
    }));
  }

  async customer(actor: ControlActor, userId: string) {
    const ids = await this.scope(actor, undefined, AdminControlPermission.ADMIN_CUSTOMER_VIEW);
    const membership = await this.db.membership.findFirst({
      where: { userId, ...this.membershipStationFilter(ids) },
      include: {
        user: { select: { id: true, name: true, email: true, active: true, createdAt: true } },
        vehicles: { where: this.vehicleStationFilter(ids), select: { id: true, plate: true, label: true } },
      },
    });
    if (!membership) throw new NotFoundException('Cliente no encontrado en el alcance autorizado');
    const [points, transactions, authorizations] = await Promise.all([
      actor.permissions.includes(AdminControlPermission.ADMIN_MEMBERSHIP_VIEW)
        ? this.db.rewardMovement.aggregate({ where: { membershipId: membership.id }, _sum: { points: true } })
        : Promise.resolve({ _sum: { points: null } }),
      actor.permissions.includes(AdminControlPermission.ADMIN_OPERATION_VIEW)
        ? this.db.transaction.findMany({
            where: { membershipId: membership.id, ...(ids ? { stationId: { in: ids } } : {}) },
            include: { station: { select: { id: true, code: true, name: true } }, fuel: { select: { name: true } }, vehicle: { select: { plate: true, label: true } }, payment: { select: { status: true, method: true, amount: true, refundedAmount: true } }, operationalIncidents: { select: { code: true, status: true } } },
            orderBy: { createdAt: 'desc' }, take: 50,
          })
        : Promise.resolve([]),
      actor.permissions.includes(AdminControlPermission.ADMIN_OPERATION_VIEW)
        ? this.db.fuelAuthorization.findMany({
            where: { membershipId: membership.id, ...(ids ? { stationId: { in: ids } } : {}), transaction: null },
            include: { station: { select: { id: true, code: true, name: true } }, fuel: { select: { name: true } }, vehicle: { select: { plate: true, label: true } }, payment: { select: { status: true, method: true, amount: true, refundedAmount: true } }, operationalIncidents: { select: { code: true, status: true } } },
            orderBy: { createdAt: 'desc' }, take: 50,
          })
        : Promise.resolve([]),
    ]);
    const recent = [
      ...transactions.map((row) => this.transactionProjection(row, actor)),
      ...authorizations.map((row) => this.authorizationProjection(row, actor)),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 50);
    const canMembership = actor.permissions.includes(AdminControlPermission.ADMIN_MEMBERSHIP_VIEW);
    return {
      id: membership.user.id,
      name: membership.user.name,
      email: actor.global ? membership.user.email : this.maskEmail(membership.user.email),
      active: membership.user.active,
      registeredAt: membership.user.createdAt,
      membership: canMembership ? {
        id: membership.id,
        number: membership.number,
        status: membership.status,
        createdAt: membership.createdAt,
        ...(actor.global ? { balance: membership.balance.toFixed(2), points: points._sum.points ?? 0 } : {}),
      } : null,
      vehicles: actor.permissions.includes(AdminControlPermission.ADMIN_VEHICLE_VIEW) ? membership.vehicles : [],
      operations: recent,
    };
  }

  async memberships(actor: ControlActor, filters: Filter) {
    const ids = await this.scope(actor, filters.stationId, AdminControlPermission.ADMIN_MEMBERSHIP_VIEW);
    const q = filters.q?.trim();
    const rows = await this.db.membership.findMany({
      where: {
        ...this.membershipStationFilter(ids),
        ...(filters.status ? { status: filters.status as 'ACTIVE' | 'SUSPENDED' } : {}),
        ...(q ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { user: { name: { contains: q, mode: 'insensitive' } } }, { user: { email: { contains: q, mode: 'insensitive' } } }] } : {}),
      },
      include: { user: { select: { id: true, name: true, email: true, active: true } }, transactions: { where: ids ? { stationId: { in: ids } } : {}, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } }, authorizations: { where: ids ? { stationId: { in: ids } } : {}, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    return rows.map((row) => ({ id: row.id, number: row.number, status: row.status, customer: { id: row.user.id, name: row.user.name, email: actor.global ? row.user.email : this.maskEmail(row.user.email) }, ...(actor.global ? { balance: row.balance.toFixed(2) } : {}), createdAt: row.createdAt, lastActivityAt: [row.transactions[0]?.createdAt, row.authorizations[0]?.createdAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null }));
  }

  async membership(actor: ControlActor, membershipId: string) {
    await this.scope(actor, undefined, AdminControlPermission.ADMIN_MEMBERSHIP_VIEW);
    const row = await this.db.membership.findUnique({ where: { id: membershipId }, select: { userId: true } });
    if (!row) throw new NotFoundException('Membresía no encontrada');
    const customer = await this.customer({ ...actor, permissions: [...actor.permissions, AdminControlPermission.ADMIN_CUSTOMER_VIEW] }, row.userId);
    if (!customer.membership) throw new NotFoundException('Membresía no encontrada en el alcance autorizado');
    return customer.membership;
  }

  async vehicles(actor: ControlActor, filters: Filter) {
    const ids = await this.scope(actor, filters.stationId, AdminControlPermission.ADMIN_VEHICLE_VIEW);
    const q = filters.q?.trim();
    const rows = await this.db.vehicle.findMany({
      where: { AND: [
        ...(q ? [{ OR: [{ plate: { contains: q, mode: 'insensitive' as const } }, { label: { contains: q, mode: 'insensitive' as const } }, { membership: { is: { user: { name: { contains: q, mode: 'insensitive' as const } } } } }] }] : []),
        ...(ids ? [this.vehicleStationFilter(ids)] : []),
      ] },
      include: { membership: { select: { id: true, number: true, status: true, user: { select: { id: true, name: true } } } }, transactions: { where: ids ? { stationId: { in: ids } } : {}, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, plate: true, createdAt: true, station: { select: { id: true, code: true, name: true } } } }, authorizations: { where: ids ? { stationId: { in: ids } } : {}, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, plate: true, createdAt: true, station: { select: { id: true, code: true, name: true } } } } },
      orderBy: { updatedAt: 'desc' }, take: 100,
    });
    return rows.map((row) => ({ id: row.id, plate: row.plate, label: row.label, status: 'REGISTERED', customer: row.membership ? { id: row.membership.user.id, name: row.membership.user.name } : null, membership: row.membership ? { number: row.membership.number, status: row.membership.status } : null, lastActivityAt: [row.transactions[0]?.createdAt, row.authorizations[0]?.createdAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null, plateEvidence: row.transactions[0] || row.authorizations[0] ? 'REGISTRATION_USED_IN_OPERATION' : 'REGISTERED' }));
  }

  async transactions(actor: ControlActor, filters: Filter) {
    const ids = await this.scope(actor, filters.stationId, AdminControlPermission.ADMIN_TRANSACTION_VIEW);
    const createdAt = this.range(filters.from, filters.to);
    const q = filters.q?.trim();
    const stationFilter = ids ? { stationId: { in: ids } } : {};
    const [transactions, authorizations] = await Promise.all([
      this.db.transaction.findMany({
        where: { ...stationFilter, ...(createdAt ? { createdAt } : {}), ...(filters.mode ? { mode: filters.mode } : {}), ...this.operationSearch(q) },
        include: { station: { select: { id: true, code: true, name: true } }, fuel: { select: { id: true, code: true, name: true } }, vehicle: { select: { id: true, plate: true, label: true } }, membership: { select: { id: true, number: true, status: true, user: { select: { id: true, name: true } } } }, payment: { select: { id: true, status: true, method: true, amount: true, refundedAmount: true } }, authorization: { select: { id: true, status: true, mode: true, dispensedAmount: true, dispensedGallons: true } }, terminal: { select: { code: true } }, pump: { select: { code: true } }, operationalIncidents: { select: { code: true, status: true } } }, orderBy: { createdAt: 'desc' }, take: 150,
      }),
      this.db.fuelAuthorization.findMany({
        where: { ...stationFilter, transaction: null, ...(createdAt ? { createdAt } : {}), ...(filters.mode ? { mode: filters.mode } : {}), ...this.operationSearch(q) },
        include: { station: { select: { id: true, code: true, name: true } }, fuel: { select: { id: true, code: true, name: true } }, vehicle: { select: { id: true, plate: true, label: true } }, membership: { select: { number: true, user: { select: { id: true, name: true } } } }, payment: { select: { id: true, status: true, method: true, amount: true, refundedAmount: true } }, terminal: { select: { code: true } }, pump: { select: { code: true } }, operationalIncidents: { select: { code: true, status: true } } }, orderBy: { createdAt: 'desc' }, take: 150,
      }),
    ]);
    const rows = [...transactions.map((row) => this.transactionProjection(row, actor)), ...authorizations.map((row) => this.authorizationProjection(row, actor))].filter((row) => (!filters.status || row.financialStatus === filters.status || row.physicalStatus === filters.status || row.reviewStatus === filters.status) && (!filters.method || row.method === filters.method)).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 100);
    return rows;
  }

  async transaction(actor: ControlActor, transactionId: string) {
    const row = await this.db.transaction.findUnique({ where: { id: transactionId }, include: { station: { select: { id: true, code: true, name: true } }, fuel: { select: { id: true, code: true, name: true } }, vehicle: { select: { id: true, plate: true, label: true } }, membership: { select: { id: true, number: true, user: { select: { id: true, name: true } } } }, payment: { select: { id: true, status: true, method: true, amount: true, refundedAmount: true } }, authorization: { select: { id: true, status: true, mode: true, dispensedAmount: true, dispensedGallons: true } }, operationalIncidents: { select: { id: true, code: true, status: true, summary: true } } } });
    if (!row) throw new NotFoundException('Transacción no encontrada');
    await this.scope(actor, row.stationId, AdminControlPermission.ADMIN_TRANSACTION_VIEW);
    return this.transactionProjection(row, actor);
  }

  async receipt(actor: ControlActor, transactionId: string) {
    const row = await this.db.transaction.findUnique({ where: { id: transactionId }, include: { station: { select: { id: true, name: true } }, fuel: { select: { name: true } }, vehicle: { select: { plate: true } }, terminal: { select: { code: true } }, pump: { select: { code: true } }, payment: { select: { status: true, method: true } }, debt: { select: { amountPending: true } } } });
    if (!row) throw new NotFoundException('Comprobante no encontrado');
    await this.scope(actor, row.stationId, AdminControlPermission.ADMIN_RECEIPT_VIEW);
    if (!row.gallons?.gt(0) || !row.plate)
      throw new ConflictException('La operación no contiene cantidad y placa confirmadas para emitir una copia del comprobante.');
    return {
      schemaVersion: 2,
      id: row.id,
      documentType: row.receiptType,
      demo: true,
      issuedAt: row.createdAt.toISOString(),
      station: row.station.name,
      pump: row.pump?.code ?? null,
      plate: row.plate,
      dni: row.receiptType === 'BOLETA' ? row.receiptDni || '' : '',
      ruc: row.receiptType === 'FACTURA' ? row.receiptRuc || '' : '',
      businessName: row.receiptType === 'FACTURA' ? row.receiptBusinessName || '' : '',
      fuel: row.fuel.name,
      gallons: row.gallons?.toFixed(3) ?? '0.000',
      unitPrice: row.unitPrice.toFixed(2),
      subtotal: (row.originalAmount ?? row.amount).toFixed(2),
      discount: row.discountAmount.toFixed(2),
      total: row.amount.toFixed(2),
      mode: row.mode,
      paymentMethod: row.payment?.method ?? (row.mode === 'POSTPAGO' ? 'SALDO_PRIME' : 'Sin informar'),
      state: this.receiptState(row.status, row.payment?.status, row.debt?.amountPending),
      pending: (row.debt?.amountPending ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }

  private receiptState(transaction: TransactionStatus, payment?: PaymentStatus, pending?: Prisma.Decimal) {
    if (payment === 'REFUNDED' || transaction === 'REFUNDED') return 'Reembolsado';
    if (payment === 'CANCELLED') return 'Cancelado';
    if (payment === 'REJECTED') return 'Rechazado';
    if (payment === 'ERROR') return 'Error de pago';
    if (pending?.gt(0)) return 'Saldo pendiente';
    if (payment === 'PARTIAL') return 'Saldo pendiente';
    if (payment === 'PENDING' || transaction === 'PAYMENT_PENDING') return 'Pago pendiente';
    if (transaction === 'PAID' && (!payment || payment === 'CAPTURED')) return 'Pagado';
    return 'Pago por verificar';
  }

  private maskEmail(email: string) {
    const [name, domain] = email.split('@');
    if (!domain) return '•••';
    return `${name.slice(0, 1)}•••@•••`;
  }

  private transactionProjection(row: any, actor: ControlActor) {
    const incidents = row.operationalIncidents ?? [];
    const physicalStatus = row.authorization?.status ?? row.terminalOperation?.status ?? row.status;
    const financialStatus = row.payment?.status ?? row.status;
    return {
      id: row.id,
      transactionId: row.id,
      operationId: row.operationId,
      occurredAt: row.createdAt,
      station: row.station,
      fuel: row.fuel,
      vehicle: actor.permissions.includes(AdminControlPermission.ADMIN_VEHICLE_VIEW) ? row.vehicle : null,
      plate: row.plate,
      plateEvidence: actor.permissions.includes(AdminControlPermission.ADMIN_VEHICLE_VIEW) ? (row.vehicle ? 'MATCHED_REGISTERED_VEHICLE' : 'UNLINKED_PLATE') : 'PLATE_CAPTURED',
      customer: actor.permissions.includes(AdminControlPermission.ADMIN_CUSTOMER_VIEW) && row.membership ? { id: row.membership.user.id, name: row.membership.user.name, membershipNumber: row.membership.number } : null,
      mode: row.mode,
      amount: row.amount.toFixed(2),
      unitPrice: row.unitPrice.toFixed(2),
      gallons: row.gallons?.toFixed(3) ?? null,
      method: row.payment?.method ?? (row.mode === 'POSTPAGO' ? 'SALDO_PRIME' : null),
      financialStatus,
      physicalStatus,
      reviewStatus: physicalStatus === 'INTERVENTION_REQUIRED' || incidents.some((incident: { status: string }) => ['OPEN', 'IN_REVIEW'].includes(incident.status)) ? 'REVIEW' : null,
      authorization: row.authorization ? { id: row.authorization.id, status: row.authorization.status, dispensedAmount: row.authorization.dispensedAmount?.toFixed(2), dispensedGallons: row.authorization.dispensedGallons?.toFixed(3) } : null,
      incidents,
      receiptType: row.receiptType,
      receiptAvailable: true,
    };
  }

  private authorizationProjection(row: any, actor: ControlActor) {
    const incidents = row.operationalIncidents ?? [];
    return {
      id: row.id,
      transactionId: null,
      operationId: row.operationId,
      occurredAt: row.createdAt,
      station: row.station,
      fuel: row.fuel,
      vehicle: actor.permissions.includes(AdminControlPermission.ADMIN_VEHICLE_VIEW) ? row.vehicle : null,
      plate: row.plate,
      plateEvidence: actor.permissions.includes(AdminControlPermission.ADMIN_VEHICLE_VIEW) ? (row.vehicle ? 'MATCHED_REGISTERED_VEHICLE' : 'UNLINKED_PLATE') : 'PLATE_CAPTURED',
      customer: actor.permissions.includes(AdminControlPermission.ADMIN_CUSTOMER_VIEW) && row.membership ? { id: row.membership.user.id, name: row.membership.user.name, membershipNumber: row.membership.number } : null,
      mode: row.mode,
      amount: row.payment?.amount?.toFixed(2) ?? row.authorizedAmount.toFixed(2),
      unitPrice: row.unitPrice?.toFixed(2) ?? null,
      gallons: row.dispensedGallons.toFixed(3),
      method: row.payment?.method ?? null,
      financialStatus: row.payment?.status ?? (row.status === 'INTERVENTION_REQUIRED' ? 'REVIEW' : row.status),
      physicalStatus: row.status,
      reviewStatus: row.status === 'INTERVENTION_REQUIRED' || incidents.some((incident: { status: string }) => ['OPEN', 'IN_REVIEW'].includes(incident.status)) ? 'REVIEW' : null,
      authorization: { id: row.id, status: row.status, dispensedAmount: row.dispensedAmount.toFixed(2), dispensedGallons: row.dispensedGallons.toFixed(3) },
      incidents,
      receiptType: null,
      receiptAvailable: false,
    };
  }
}
