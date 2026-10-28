import { createHash, randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { AdminControlPermission } from '@prisma/client';
import { AccessGuard } from '../src/auth/access.guard';
import { Actor } from '../src/auth/access';
import { ControlService } from '../src/control/control.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { KioskService } from '../src/kiosk/kiosk.service';
import { UsersService } from '../src/users/users.service';

const isolated = process.env.CONTROL_TEST_DATABASE_URL;
const suite = isolated ? describe : describe.skip;

suite('Primax Control foundation on isolated PostgreSQL', () => {
  let db: PrismaService;
  let jwt: JwtService;
  let service: ControlService;
  let guard: AccessGuard;
  const secret = 'control-e2e-test-secret-at-least-thirty-two';
  const rootId = randomUUID();
  const encargadoId = randomUUID();
  const pendingId = randomUUID();
  const normalId = randomUUID();
  const stationA = randomUUID();
  const stationB = randomUUID();
  const incidentId = randomUUID();
  const accessRequestId = randomUUID();
  let accessRequestUserId: string | null = null;
  const delivery = { sendAdminVerification: jest.fn(async () => undefined) };

  async function auth(userId: string, cookie = false) {
    const token = await jwt.signAsync({ sub: userId, ver: 0 });
    const req = {
      headers: cookie ? { cookie: `primax_control=${token}` } : {},
      header: (name: string) =>
        !cookie && name.toLowerCase() === 'authorization'
          ? `Bearer ${token}`
          : undefined,
      path: '/api/v1/control/session',
      actor: undefined as Actor | undefined,
    };
    const context = {
      getHandler: () => ({}),
      getClass: () => class Test {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    (guard as unknown as { reflector: Reflector }).reflector = {
      getAllAndOverride: () => 'control',
    } as unknown as Reflector;
    await guard.canActivate(context);
    return req.actor as Extract<Actor, { kind: 'control' }>;
  }

  beforeAll(async () => {
    const target = new URL(isolated!);
    if (
      target.protocol !== 'postgresql:' ||
      target.pathname !== '/primax_control_test' ||
      target.search ||
      !(['127.0.0.1:26544', 'localhost:26544'].includes(target.host) ||
        (target.host === 'postgres:5432' && process.env.APP_MODE === 'local'))
    )
      throw new Error(
        'CONTROL_TEST_DATABASE_URL must point to the dedicated local control database',
      );
    process.env.DATABASE_URL = isolated;
    db = new PrismaService();
    await db.$connect();
    jwt = new JwtService({
      secret,
      signOptions: {
        issuer: 'primax-v6',
        audience: 'primax-prime',
        algorithm: 'HS256',
      },
    });
    const config = {
      get: (name: string) => (name === 'APP_MODE' ? 'local' : undefined),
      getOrThrow: (name: string) =>
        name === 'JWT_SECRET' ? secret : undefined,
    } as ConfigService;
    service = new ControlService(db, jwt, config, delivery as never);
    guard = new AccessGuard(
      {} as Reflector,
      config,
      jwt,
      {
        findById: (id: string) => db.user.findUnique({ where: { id } }),
      } as unknown as UsersService,
      {
        verifyGateway: () => undefined,
        limitTechnical: async () => undefined,
      } as unknown as KioskService,
      db,
    );
    const passwordHash = await hash('ControlTest!123', 4);
    await db.user.createMany({
      data: [
        {
          id: rootId,
          email: `root-${rootId}@primax.test`,
          name: 'Root Control',
          passwordHash,
        },
        {
          id: encargadoId,
          email: `encargado-${encargadoId}@primax.test`,
          name: 'Encargado Control',
          passwordHash,
        },
        {
          id: pendingId,
          email: `pending-${pendingId}@primax.test`,
          name: 'Pending Control',
          passwordHash,
        },
        {
          id: normalId,
          email: `normal-${normalId}@primax.test`,
          name: 'Normal Prime',
          passwordHash,
        },
      ],
    });
    await db.userPermissionGrant.create({
      data: {
        userId: rootId,
        permission: 'SYSTEM_ADMIN',
        reason: 'control test root',
      },
    });
    await db.station.createMany({
      data: [
        {
          id: stationA,
          code: `CTRL-${stationA.slice(0, 8)}`,
          name: 'Control Station A',
          address: 'Test address A',
        },
        {
          id: stationB,
          code: `CTRL-${stationB.slice(0, 8)}`,
          name: 'Control Station B',
          address: 'Test address B',
        },
      ],
    });
    const account = await db.adminControlAccount.create({
      data: {
        userId: encargadoId,
        role: 'ENCARGADO',
        status: 'PENDING_APPROVAL',
        emailVerifiedAt: new Date(),
      },
    });
    await db.adminControlAccount.create({
      data: { userId: pendingId, role: 'ADMIN', status: 'PENDING_EMAIL' },
    });
    const verifyToken = `control-verification-${pendingId}`;
    await db.adminEmailVerification.create({
      data: {
        userId: pendingId,
        tokenHash: createHash('sha256').update(verifyToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    for (const permission of [
      'ADMIN_CONTROL_ACCESS',
      'ADMIN_DASHBOARD_VIEW',
      'ADMIN_INCIDENT_VIEW',
      'ADMIN_INCIDENT_MANAGE',
    ] as AdminControlPermission[])
      await db.adminControlGrant.create({
        data: {
          userId: encargadoId,
          permission,
          reason: 'control test permission',
        },
      });
    await db.adminStationAssignment.create({
      data: {
        userId: encargadoId,
        accountId: account.id,
        stationId: stationA,
        reason: 'test scope',
      },
    });
    await db.operationalIncident.create({
      data: {
        id: incidentId,
        eventKey: `control-test:${incidentId}`,
        code: 'INC_001',
        stationId: stationA,
        operationId: randomUUID(),
        summary: 'Test captured payment without dispense',
      },
    });
  });

  afterAll(async () => {
    // OperationalAuditEvent is append-only. Keep its referenced fixture users/stations in this isolated test DB.
    await db.operationalIncident.deleteMany({ where: { id: incidentId } });
    await db.adminStationAssignment.deleteMany({
      where: { userId: { in: [rootId, encargadoId, pendingId] } },
    });
    await db.adminControlGrant.deleteMany({
      where: { userId: { in: [rootId, encargadoId, pendingId] } },
    });
    await db.adminControlAccount.deleteMany({
      where: { userId: { in: [rootId, encargadoId, pendingId] } },
    });
    await db.userPermissionGrant.deleteMany({ where: { userId: rootId } });
    await db.adminEmailVerification.deleteMany({
      where: { userId: pendingId },
    });
    if (
      accessRequestUserId &&
      (await db.user.findUnique({ where: { id: accessRequestUserId } }))
    ) {
      await db.adminEmailVerification.deleteMany({
        where: { userId: accessRequestUserId },
      });
      await db.adminControlAccount.deleteMany({
        where: { userId: accessRequestUserId },
      });
      await db.user.delete({ where: { id: accessRequestUserId } });
    }
    await db.$disconnect();
  });

  it('denies ordinary users and accounts without email verification/approval', async () => {
    await expect(
      service.login(`normal-${normalId}@primax.test`, 'ControlTest!123'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.login(`pending-${pendingId}@primax.test`, 'ControlTest!123'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a pending account and sends verification through the existing email delivery', async () => {
    const email = `request-${accessRequestId}@primax.test`;
    await service.requestAccess({
      email,
      name: 'Requested Operator',
      password: 'ControlTest!123',
      role: 'ENCARGADO',
    });
    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { adminControlAccount: true, emailVerification: true },
    });
    accessRequestUserId = user.id;
    expect(user.adminControlAccount?.status).toBe('PENDING_EMAIL');
    expect(user.emailVerification?.verifiedAt).toBeNull();
    expect(delivery.sendAdminVerification).toHaveBeenCalledWith(
      email,
      expect.any(String),
      expect.any(Date),
    );
    await service.setStatus(
      await auth(rootId),
      user.id,
      'REJECTED',
      'Request does not match station staffing needs',
    );
  });

  it('verifies email once, then SUPER_ADMIN approves with explicit grants and station scope', async () => {
    const token = `control-verification-${pendingId}`;
    await service.verifyEmail(token);
    expect(
      (
        await db.adminControlAccount.findUniqueOrThrow({
          where: { userId: pendingId },
        })
      ).status,
    ).toBe('PENDING_APPROVAL');
    await expect(service.verifyEmail(token)).rejects.toBeInstanceOf(Error);
    const root = await auth(rootId);
    await service.approve(root, pendingId, {
      role: 'ENCARGADO',
      stationIds: [stationB],
      permissions: [
        'ADMIN_CONTROL_ACCESS',
        'ADMIN_DASHBOARD_VIEW',
        'ADMIN_INCIDENT_VIEW',
      ],
    });
    const login = await service.login(
      `pending-${pendingId}@primax.test`,
      'ControlTest!123',
    );
    expect(login.context.role).toBe('ENCARGADO');
    expect(login.context.stations.map((station) => station.id)).toEqual([
      stationB,
    ]);
    expect(
      (
        await db.operationalAuditEvent.findMany({
          where: { targetId: pendingId },
        })
      ).map((row) => row.action),
    ).toContain('ADMIN_ACCOUNT_APPROVED');
    await service.setStatus(
      root,
      pendingId,
      'DISABLED',
      'Disable test account',
    );
    await expect(
      service.login(`pending-${pendingId}@primax.test`, 'ControlTest!123'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('admits approved ENCARGADO and scopes session to active assigned stations', async () => {
    await db.adminControlAccount.update({
      where: { userId: encargadoId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedByUserId: rootId,
      },
    });
    const login = await service.login(
      `encargado-${encargadoId}@primax.test`,
      'ControlTest!123',
    );
    expect(login.context.role).toBe('ENCARGADO');
    expect(login.context.stations.map((station) => station.id)).toEqual([
      stationA,
    ]);
    expect((await auth(encargadoId)).stationIds).toEqual([stationA]);
    expect((await auth(encargadoId, true)).stationIds).toEqual([stationA]);
    await expect(
      service.dashboard(await auth(encargadoId), stationB),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('gives SYSTEM_ADMIN global scope without changing Supervisor assignments', async () => {
    const actor = await auth(rootId);
    expect(actor.global).toBe(true);
    expect(actor.role).toBe('SUPER_ADMIN');
    expect(actor.permissions).toEqual(expect.arrayContaining([
      'ADMIN_TERMINAL_VIEW',
      'ADMIN_TERMINAL_MANAGE',
      'ADMIN_INVENTORY_RECEIVE',
      'ADMIN_INVENTORY_MOVEMENT_VIEW',
      'ADMIN_INVENTORY_RECONCILE',
      'ADMIN_CUSTOMER_VIEW',
      'ADMIN_MEMBERSHIP_VIEW',
      'ADMIN_VEHICLE_VIEW',
      'ADMIN_TRANSACTION_VIEW',
      'ADMIN_RECEIPT_VIEW',
    ]));
    await expect(service.approve(actor, rootId, {
      role: 'ADMIN',
      stationIds: [stationA],
      permissions: ['ADMIN_CONTROL_ACCESS', 'ADMIN_DASHBOARD_VIEW'],
    })).rejects.toBeInstanceOf(ForbiddenException);
    const result = await service.dashboard(actor, stationB);
    expect(result.stations.map((station) => station.id)).toEqual([stationB]);
  });

  it('lets scoped administrators list and view incidents, and guards resolution permission', async () => {
    const actor = await auth(encargadoId);
    expect(
      (await service.incidents(actor, stationA)).map((incident) => incident.id),
    ).toContain(incidentId);
    expect((await service.incident(actor, incidentId)).id).toBe(incidentId);
    await expect(service.incidents(actor, stationB)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const withoutManage = {
      ...actor,
      permissions: actor.permissions.filter(
        (permission) => permission !== 'ADMIN_INCIDENT_MANAGE',
      ),
    };
    await expect(
      service.incidentStatus(withoutManage, incidentId, 'IN_REVIEW', 'Review'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('audits incident transitions and returns the existing state for idempotent retries', async () => {
    const actor = await auth(encargadoId);
    const review = await service.incidentStatus(
      actor,
      incidentId,
      'IN_REVIEW',
      'Review started',
    );
    expect(review.status).toBe('IN_REVIEW');
    expect(
      (await service.incidentStatus(actor, incidentId, 'IN_REVIEW', 'Retry'))
        .status,
    ).toBe('IN_REVIEW');
    expect(
      await db.operationalAuditEvent.count({
        where: { targetId: incidentId, action: 'INCIDENT_STATUS_CHANGED' },
      }),
    ).toBe(1);
    expect(
      (
        await service.incidentStatus(
          actor,
          incidentId,
          'RESOLVED',
          'Resolved after review',
        )
      ).status,
    ).toBe('RESOLVED');
  });

  it('rejects a disabled administrative profile even when a prior JWT exists', async () => {
    const oldActor = await auth(encargadoId);
    const root = await auth(rootId);
    await service.approve(
      root,
      encargadoId,
      {
        role: 'ADMIN',
        stationIds: [stationB],
        permissions: [
          'ADMIN_CONTROL_ACCESS',
          'ADMIN_DASHBOARD_VIEW',
          'ADMIN_INCIDENT_VIEW',
        ],
      },
      true,
    );
    const changed = await auth(encargadoId);
    expect(changed.role).toBe('ADMIN');
    expect(changed.stationIds).toEqual([stationB]);
    expect(
      await db.operationalAuditEvent.count({
        where: {
          targetId: encargadoId,
          action: 'ADMIN_ACCOUNT_ACCESS_UPDATED',
        },
      }),
    ).toBe(1);
    await db.adminControlAccount.update({
      where: { userId: encargadoId },
      data: { status: 'DISABLED' },
    });
    await expect(auth(encargadoId)).rejects.toBeInstanceOf(ForbiddenException);
    await service.approve(root, encargadoId, {
      role: 'ADMIN',
      stationIds: [stationB],
      permissions: ['ADMIN_CONTROL_ACCESS', 'ADMIN_DASHBOARD_VIEW', 'ADMIN_INCIDENT_VIEW'],
    }, true);
    expect((await auth(encargadoId)).role).toBe('ADMIN');
    await db.adminControlAccount.update({
      where: { userId: encargadoId },
      data: { status: 'DISABLED' },
    });
    await expect(auth(encargadoId)).rejects.toBeInstanceOf(ForbiddenException);
    expect(oldActor.kind).toBe('control');
  });
});
