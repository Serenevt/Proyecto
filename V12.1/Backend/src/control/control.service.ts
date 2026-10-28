import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AdminControlPermission,
  AdminControlRole,
  AdminControlStatus,
  OperationalIncidentStatus,
} from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RecoveryDelivery } from '../auth/recovery-delivery';
import { Actor } from '../auth/access';

const ALL_PERMISSIONS = Object.values(AdminControlPermission);
type ControlActor = Extract<Actor, { kind: 'control' }>;

@Injectable()
export class ControlService {
  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly delivery: RecoveryDelivery,
  ) {}

  async requestAccess(input: {
    email: string;
    name: string;
    password: string;
    role: AdminControlRole;
  }) {
    if (input.role === 'SUPER_ADMIN')
      throw new ForbiddenException(
        'SUPER_ADMIN se asigna mediante SYSTEM_ADMIN',
      );
    const email = input.email.trim().toLowerCase();
    const existing = await this.db.user.findUnique({ where: { email } });
    if (existing)
      throw new ConflictException('Ya existe una cuenta con ese correo');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    const userId = randomUUID();
    await this.db.atomic(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email,
          name: input.name.trim(),
          passwordHash: await hash(input.password, 12),
        },
      });
      await tx.adminControlAccount.create({
        data: { userId, role: input.role, status: 'PENDING_EMAIL' },
      });
      await tx.adminEmailVerification.create({
        data: {
          userId,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt,
        },
      });
    });
    await this.delivery.sendAdminVerification(email, token, expiresAt);
    return {
      message:
        'Solicitud creada. Revisa tu correo para verificar la dirección.',
    };
  }

  async verifyEmail(token: string) {
    if (!token || token.length > 200)
      throw new BadRequestException('Enlace inválido o vencido');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.db.atomic(async (tx) => {
      const row = await tx.adminEmailVerification.findUnique({
        where: { tokenHash },
      });
      if (!row || row.verifiedAt || row.expiresAt <= new Date())
        throw new BadRequestException('Enlace inválido o vencido');
      const now = new Date();
      await tx.adminEmailVerification.update({
        where: { id: row.id },
        data: { verifiedAt: now },
      });
      await tx.adminControlAccount.update({
        where: { userId: row.userId },
        data: { status: 'PENDING_APPROVAL', emailVerifiedAt: now },
      });
      return {
        message:
          'Correo verificado. La solicitud espera aprobación administrativa.',
      };
    });
  }

  async resendVerification(email: string) {
    const user = await this.db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { adminControlAccount: true },
    });
    const response = {
      message:
        'Si existe una solicitud pendiente de verificación, enviaremos un nuevo enlace.',
    };
    if (!user?.active || user.adminControlAccount?.status !== 'PENDING_EMAIL')
      return response;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    await this.db.adminEmailVerification.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt,
      },
      update: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt,
        verifiedAt: null,
      },
    });
    await this.delivery.sendAdminVerification(user.email, token, expiresAt);
    return response;
  }

  async login(email: string, password: string) {
    const user = await this.db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    const valid = await compare(
      password,
      user?.passwordHash ?? (await hash('control-invalid-account', 12)),
    );
    if (!user?.active || !valid)
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    const systemAdmin = await this.db.userPermissionGrant.findFirst({
      where: { userId: user.id, permission: 'SYSTEM_ADMIN', revokedAt: null },
    });
    const account = await this.db.adminControlAccount.findUnique({
      where: { userId: user.id },
    });
    if (
      !systemAdmin &&
      (!account || account.status !== 'APPROVED' || !account.emailVerifiedAt)
    )
      throw new ForbiddenException(
        'Acceso administrativo pendiente o revocado',
      );
    const token = await this.jwt.signAsync(
      { sub: user.id, ver: user.authVersion },
      { expiresIn: '8h' },
    );
    return { token, context: await this.sessionFor(user.id) };
  }

  async session(actor: ControlActor) {
    return this.sessionFor(actor.userId);
  }
  private async sessionFor(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    const account = await this.db.adminControlAccount.findUnique({
      where: { userId },
      include: {
        stations: {
          where: { endedAt: null, station: { active: true } },
          include: {
            station: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    const grants = await this.db.adminControlGrant.findMany({
      where: { userId, revokedAt: null },
    });
    const root = Boolean(
      await this.db.userPermissionGrant.findFirst({
        where: { userId, permission: 'SYSTEM_ADMIN', revokedAt: null },
      }),
    );
    return {
      user,
      role: root ? 'SUPER_ADMIN' : account?.role,
      permissions: root ? ALL_PERMISSIONS : grants.map((x) => x.permission),
      global: root,
      stations: root
        ? await this.db.station.findMany({
            where: { active: true },
            select: { id: true, code: true, name: true },
            orderBy: { name: 'asc' },
          })
        : (account?.stations.map((x) => x.station) ?? []),
    };
  }

  private async assertGlobal(actor: ControlActor) {
    if (!actor.global || actor.role !== 'SUPER_ADMIN')
      throw new ForbiddenException('Solo SUPER_ADMIN puede aprobar cuentas');
  }
  async createSupervisor(actor: ControlActor, input: { name: string; email: string; password: string; stationIds: string[] }) {
    await this.assertGlobal(actor);
    const email = input.email.trim().toLowerCase();
    const stationIds = [...new Set(input.stationIds)];
    if (!stationIds.length) throw new BadRequestException('Asigna al menos una estación');
    const stations = await this.db.station.findMany({ where: { id: { in: stationIds }, active: true }, select: { id: true } });
    if (stations.length !== stationIds.length) throw new BadRequestException('Estación inválida');
    if (await this.db.user.findUnique({ where: { email } })) throw new ConflictException('Ya existe una cuenta con ese correo');
    return this.db.atomic(async tx => {
      const user = await tx.user.create({ data: { name: input.name.trim(), email, passwordHash: await hash(input.password, 12) } });
      for (const stationId of stationIds) await tx.supervisorStationAssignment.create({ data: { userId: user.id, stationId, grantedByUserId: actor.userId, reason: 'Alta de Supervisor desde Primax Control' } });
      return { id: user.id, name: user.name, email: user.email, stationIds };
    });
  }
  async supervisors(actor: ControlActor) {
    await this.assertGlobal(actor);
    return this.db.supervisorStationAssignment.findMany({ where: { endedAt: null }, include: { user: { select: { id: true, name: true, email: true, active: true } }, station: { select: { id: true, name: true, code: true } } }, orderBy: { assignedAt: 'desc' } });
  }
  async pending(actor: ControlActor) {
    await this.assertGlobal(actor);
    const accounts = await this.db.adminControlAccount.findMany({
      where: {
        status: {
          in: [
            'PENDING_EMAIL',
            'PENDING_APPROVAL',
            'APPROVED',
            'DISABLED',
            'REJECTED',
          ],
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true, active: true } },
        stations: {
          where: { endedAt: null },
          include: {
            station: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const grants = await this.db.adminControlGrant.findMany({
      where: { userId: { in: accounts.map((account) => account.userId) }, revokedAt: null },
      select: { userId: true, permission: true },
    });
    const permissionsByUser = new Map<string, string[]>();
    for (const grant of grants) {
      permissionsByUser.set(grant.userId, [
        ...(permissionsByUser.get(grant.userId) ?? []),
        grant.permission,
      ]);
    }
    return accounts.map((account) => ({
      ...account,
      grants: permissionsByUser.get(account.userId) ?? [],
    }));
  }
  async approve(
    actor: ControlActor,
    userId: string,
    input: {
      role: AdminControlRole;
      permissions: AdminControlPermission[];
      stationIds: string[];
    },
    updateExisting = false,
  ) {
    await this.assertGlobal(actor);
    if (userId === actor.userId)
      throw new ForbiddenException('No puedes modificar tu propio acceso administrativo');
    const account = await this.db.adminControlAccount.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (
      !account ||
      (updateExisting
        ? !['APPROVED', 'DISABLED'].includes(account.status)
        : account.status !== 'PENDING_APPROVAL') ||
      !account.emailVerifiedAt ||
      !account.user.active
    )
      throw new ConflictException(
        updateExisting
          ? 'La cuenta no está aprobada y verificada'
          : 'La cuenta no está pendiente y verificada',
      );
    if (input.role === 'SUPER_ADMIN')
      throw new ForbiddenException(
        'SUPER_ADMIN se asigna mediante SYSTEM_ADMIN',
      );
    const stationIds = [...new Set(input.stationIds)];
    if (stationIds.length === 0)
      throw new BadRequestException('La cuenta requiere al menos una estación autorizada');
    const stations = await this.db.station.findMany({
      where: { id: { in: stationIds }, active: true },
      select: { id: true },
    });
    if (stations.length !== stationIds.length)
      throw new BadRequestException('Estación inválida o inactiva');
    if (
      !input.permissions.includes('ADMIN_CONTROL_ACCESS') ||
      !input.permissions.includes('ADMIN_DASHBOARD_VIEW')
    )
      throw new BadRequestException('Faltan permisos base de Control');
    await this.db.atomic(async (tx) => {
      await tx.adminControlAccount.update({
        where: { userId },
        data: {
          status: 'APPROVED',
          role: input.role,
          ...(updateExisting
            ? {}
            : { approvedAt: new Date(), approvedByUserId: actor.userId }),
          rejectionReason: null,
        },
      });
      await tx.adminControlGrant.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      for (const permission of [...new Set(input.permissions)])
        await tx.adminControlGrant.create({
          data: {
            userId,
            permission,
            grantedByUserId: actor.userId,
            reason: updateExisting
              ? 'Actualización de permisos de Primax Control'
              : 'Aprobación de acceso a Primax Control',
          },
        });
      await tx.adminStationAssignment.updateMany({
        where: { userId, endedAt: null },
        data: { endedAt: new Date() },
      });
      for (const stationId of stationIds)
        await tx.adminStationAssignment.create({
          data: {
            userId,
            accountId: account.id,
            stationId,
            grantedByUserId: actor.userId,
            reason: updateExisting
              ? 'Actualización de alcance de Primax Control'
              : 'Aprobación de acceso a Primax Control',
          },
        });
      await tx.operationalAuditEvent.create({
        data: {
          eventKey: `admin-control:${updateExisting ? 'access-updated' : 'approve'}:${userId}:${randomUUID()}`,
          actorKind: 'USER',
          actorUserId: actor.userId,
          action: updateExisting
            ? 'ADMIN_ACCOUNT_ACCESS_UPDATED'
            : 'ADMIN_ACCOUNT_APPROVED',
          targetId: userId,
          outcome: 'SUCCESS',
          details: {
            role: input.role,
            permissions: [...new Set(input.permissions)],
            stationIds,
          },
        },
      });
    });
    return { status: 'APPROVED' };
  }
  async setStatus(
    actor: ControlActor,
    userId: string,
    status: 'REJECTED' | 'DISABLED',
    reason: string,
  ) {
    await this.assertGlobal(actor);
    if (userId === actor.userId)
      throw new ForbiddenException('No puedes cambiar tu propio estado administrativo');
    const current = await this.db.adminControlAccount.findUnique({
      where: { userId },
    });
    if (!current)
      throw new NotFoundException('Cuenta administrativa no encontrada');
    if (current.status === status) return { status };
    if (
      status === 'REJECTED' &&
      !['PENDING_EMAIL', 'PENDING_APPROVAL'].includes(current.status)
    )
      throw new ConflictException(
        'Solo puede rechazarse una solicitud pendiente',
      );
    if (status === 'DISABLED' && current.status !== 'APPROVED')
      throw new ConflictException(
        'Solo puede deshabilitarse una cuenta aprobada',
      );
    await this.db.atomic(async (tx) => {
      await tx.adminControlAccount.update({
        where: { userId },
        data: {
          status,
          rejectionReason: reason,
          user: { update: { authVersion: { increment: 1 } } },
        },
      });
      if (status === 'DISABLED' || status === 'REJECTED') {
        await tx.adminControlGrant.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.adminStationAssignment.updateMany({
          where: { userId, endedAt: null },
          data: { endedAt: new Date() },
        });
      }
      await tx.operationalAuditEvent.create({
        data: {
          eventKey: `admin-control:${status.toLowerCase()}:${userId}:${randomUUID()}`,
          actorKind: 'USER',
          actorUserId: actor.userId,
          action:
            status === 'REJECTED'
              ? 'ADMIN_ACCOUNT_REJECTED'
              : 'ADMIN_ACCOUNT_DISABLED',
          targetId: userId,
          outcome: 'SUCCESS',
          details: { reason },
        },
      });
    });
    return { status };
  }

  private async stationsFor(
    actor: ControlActor,
    stationId?: string,
    permission = 'ADMIN_DASHBOARD_VIEW',
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
  async dashboard(actor: ControlActor, stationId?: string) {
    const ids = await this.stationsFor(actor, stationId);
    const where = ids ? { stationId: { in: ids } } : {};
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const [
      stations,
      operationsToday,
      activeOperations,
      terminalGroups,
      openIncidents,
      inventory,
      activeCustomers,
      activeMemberships,
      capturedRevenue,
    ] = await Promise.all([
      this.db.station.findMany({
        where: { active: true, ...(ids ? { id: { in: ids } } : {}) },
        select: { id: true, code: true, name: true },
      }),
      this.db.transaction.count({
        where: { ...where, createdAt: { gte: since } },
      }),
      this.db.terminalOperation.count({
        where: { ...where, status: 'ACTIVE' },
      }),
      this.db.terminal.groupBy({
        by: ['operationalStatus'],
        where: {
          station: { active: true, ...(ids ? { id: { in: ids } } : {}) },
        },
        _count: { _all: true },
      }),
      this.db.operationalIncident.count({
        where: { ...where, status: { in: ['OPEN', 'IN_REVIEW'] } },
      }),
      this.db.fuelInventory.findMany({
        where: {
          station: { active: true, ...(ids ? { id: { in: ids } } : {}) },
        },
        select: {
          stationId: true,
          fuelId: true,
          liters: true,
          reservedLiters: true,
          fuel: { select: { code: true, name: true } },
          activation: { select: { status: true, reason: true } },
        },
        orderBy: [{ stationId: 'asc' }, { fuelId: 'asc' }],
      }),
      actor.permissions.includes('ADMIN_CUSTOMER_VIEW')
        ? this.db.user.count({
            where: {
              active: true,
              membership: {
                is: ids
                  ? {
                      OR: [
                        { transactions: { some: { stationId: { in: ids } } } },
                        { authorizations: { some: { stationId: { in: ids } } } },
                      ],
                    }
                  : {},
              },
            },
          })
        : Promise.resolve(null),
      actor.permissions.includes('ADMIN_MEMBERSHIP_VIEW')
        ? this.db.membership.count({
            where: {
              status: 'ACTIVE',
              ...(ids
                ? {
                    OR: [
                      { transactions: { some: { stationId: { in: ids } } } },
                      { authorizations: { some: { stationId: { in: ids } } } },
                    ],
                  }
                : {}),
            },
          })
        : Promise.resolve(null),
      actor.permissions.includes('ADMIN_TRANSACTION_VIEW')
        ? this.db.transaction.aggregate({
            where: { ...where, createdAt: { gte: since }, payment: { is: { status: 'CAPTURED' } } },
            _sum: { amount: true },
          })
        : Promise.resolve(null),
    ]);
    const inventoryRows = inventory.map((row) => ({
      ...row,
      availableLiters: row.liters.minus(row.reservedLiters),
    }));
    return {
      stations,
      operationsToday,
      activeOperations,
      terminals: terminalGroups.map((x) => ({
        status: x.operationalStatus,
        count: x._count._all,
      })),
      openIncidents,
      activeCustomers,
      activeMemberships,
      capturedRevenueToday: capturedRevenue?._sum.amount?.toFixed(2) ?? null,
      inventory: inventoryRows,
      reviewPairs: inventoryRows.filter((row) => row.activation?.status === 'REVIEW').length,
    };
  }
  async incidents(
    actor: ControlActor,
    stationId: string,
    status?: OperationalIncidentStatus,
  ) {
    await this.stationsFor(actor, stationId, 'ADMIN_INCIDENT_VIEW');
    return this.db.operationalIncident.findMany({
      where: { stationId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
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
        summary: true,
        resolution: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
  async incident(actor: ControlActor, id: string) {
    if (!actor.permissions.includes('ADMIN_INCIDENT_VIEW'))
      throw new ForbiddenException('Permiso insuficiente');
    const row = await this.db.operationalIncident.findUnique({
      where: { id },
      include: {
        payment: {
          select: {
            status: true,
            method: true,
            amount: true,
            refundedAmount: true,
          },
        },
        authorization: {
          select: { status: true, mode: true, dispensedAmount: true },
        },
        transaction: { select: { status: true, amount: true, gallons: true } },
      },
    });
    if (!row) throw new NotFoundException('Incidencia no encontrada');
    await this.stationsFor(actor, row.stationId, 'ADMIN_INCIDENT_VIEW');
    return row;
  }
  async incidentStatus(
    actor: ControlActor,
    id: string,
    status: OperationalIncidentStatus,
    reason: string,
  ) {
    if (!actor.permissions.includes('ADMIN_INCIDENT_MANAGE'))
      throw new ForbiddenException('Permiso insuficiente');
    const row = await this.db.operationalIncident.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Incidencia no encontrada');
    await this.stationsFor(actor, row.stationId, 'ADMIN_INCIDENT_MANAGE');
    if (row.status === status) return row;
    if (
      ['RESOLVED', 'DISMISSED'].includes(row.status) ||
      status === 'OPEN' ||
      (status === 'RESOLVED' && row.status !== 'IN_REVIEW')
    )
      throw new ConflictException('Transición de incidencia inválida');
    return this.db.atomic(async (tx) => {
      const updated = await tx.operationalIncident.update({
        where: { id },
        data: {
          status,
          resolution: ['RESOLVED', 'DISMISSED'].includes(status)
            ? reason
            : row.resolution,
          resolvedAt: ['RESOLVED', 'DISMISSED'].includes(status)
            ? new Date()
            : null,
          resolvedByUserId: ['RESOLVED', 'DISMISSED'].includes(status)
            ? actor.userId
            : null,
        },
      });
      await tx.operationalAuditEvent.create({
        data: {
          eventKey: `incident:${id}:control:${randomUUID()}`,
          actorKind: 'USER',
          actorUserId: actor.userId,
          stationId: row.stationId,
          action: 'INCIDENT_STATUS_CHANGED',
          targetId: id,
          outcome: 'SUCCESS',
          details: { previousStatus: row.status, status, reason },
        },
      });
      return updated;
    });
  }
}
