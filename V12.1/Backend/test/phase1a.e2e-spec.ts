import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperationsService } from '../src/operations/operations.service';
import { AccessGuard } from '../src/auth/access.guard';
import { Actor } from '../src/auth/access';
import { UsersService } from '../src/users/users.service';
import { setupApp } from '../src/setup-app';
import { KioskService } from '../src/kiosk/kiosk.service';
import { AuthorizationsService } from '../src/transactions/authorizations.service';
import { AuthorizationsRepository } from '../src/transactions/authorizations.repository';
import { TransactionsService } from '../src/transactions/transactions.service';
import { TransactionsRepository } from '../src/transactions/transactions.repository';
import { WalletRepository } from '../src/wallet/wallet.repository';
import { PaymentsService } from '../src/payments/payments.service';
import { PointsPolicyService } from '../src/rewards/points-policy.service';

const isolated = process.env.PHASE1A_TEST_DATABASE_URL;
const suite = isolated ? describe : describe.skip;

suite('Phase 1A on isolated PostgreSQL', () => {
  let db: PrismaService;
  let operations: OperationsService;
  let guard: AccessGuard;
  let jwt: JwtService;
  const ids: Record<string, string> = {};
  const key = 'phase1a-local-kiosk-key';

  const auth = async (access: string, token?: string, cookie?: string) => {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (cookie) {
      headers['x-terminal-session'] = cookie;
      headers['x-kiosk-signature'] = 'test-signature';
    }
    const request: {
      header: (name: string) => string | undefined;
      body: object;
      method: string;
      originalUrl: string;
      params: object;
      actor?: Actor;
    } = {
      header: (name: string) => headers[name.toLowerCase()],
      body: {},
      method: 'GET',
      originalUrl: '/api/v1/terminal/me',
      params: {},
    };
    const context = {
      getHandler: () => ({}),
      getClass: () => class Test {},
      switchToHttp: () => ({ getRequest: () => request }),
    };
    (guard as unknown as { reflector: Reflector }).reflector = {
      getAllAndOverride: () => access,
    } as unknown as Reflector;
    await guard.canActivate(context as unknown as ExecutionContext);
    return request.actor as {
      kind: string;
      userId: string;
      terminalId: string;
    };
  };
  const signed = async (id: string, seconds = 3600) =>
    jwt.signAsync({ sub: id, ver: 0 }, { expiresIn: seconds });

  beforeAll(async () => {
    const testUrl = isolated ? new URL(isolated) : null;
    if (
      !testUrl ||
      testUrl.protocol !== 'postgresql:' ||
      testUrl.pathname !== '/primax_phase1a' ||
      testUrl.search ||
      ![
        '127.0.0.1:26555',
        'primax-v12-phase1a-test:5432',
        ...(process.env.APP_MODE === 'local' ? ['postgres:5432'] : []),
      ].includes(testUrl.host)
    )
      throw new Error(
        'PHASE1A_TEST_DATABASE_URL must point to the dedicated local test database',
      );
    process.env.DATABASE_URL = isolated;
    db = new PrismaService();
    await db.$connect();
    operations = new OperationsService(db);
    jwt = new JwtService({ secret: 'phase1a-test-jwt' });
    const config = {
      get: (name: string) => (name === 'APP_MODE' ? 'local' : undefined),
      getOrThrow: (name: string) =>
        name === 'KIOSK_API_KEY' ? key : undefined,
    } as ConfigService;
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
    for (const role of ['client', 'supervisor', 'admin', 'multi']) {
      const user = await db.user.create({
        data: {
          email: `phase1a-${role}-${randomUUID()}@example.test`,
          name: role,
          passwordHash: 'test',
        },
      });
      ids[role] = user.id;
    }
    for (const station of ['a', 'b']) {
      const row = await db.station.create({
        data: {
          code: `T${randomUUID().slice(0, 7)}`,
          name: `Phase1A ${station}`,
          address: 'Prueba aislada',
        },
      });
      ids[`station_${station}`] = row.id;
    }
    const assignment = await operations.assignSupervisor(
      ids.supervisor,
      ids.station_a,
      'Phase 1A test',
    );
    ids.assignment = assignment.id;
    await operations.assignSupervisor(
      ids.multi,
      ids.station_a,
      'Phase 1A test',
    );
    const grant = await operations.grantAdmin(ids.admin, 'Phase 1A test');
    ids.grant = grant.id;
    await operations.grantAdmin(ids.multi, 'Phase 1A test');
    const pump = await operations.createPump(
      ids.station_a,
      'P01',
      'Surtidor 01',
    );
    ids.pump = pump.id;
    const otherPump = await operations.createPump(
      ids.station_b,
      'P02',
      'Surtidor 02',
    );
    ids.otherPump = otherPump.id;
    const terminal = await operations.createTerminal(ids.station_a, 'T01');
    ids.terminal = terminal.id;
    const terminal2 = await operations.createTerminal(ids.station_a, 'T02');
    ids.terminal2 = terminal2.id;
    const otherTerminal = await operations.createTerminal(ids.station_b, 'T03');
    ids.otherTerminal = otherTerminal.id;
    const link = await operations.assignTerminal(ids.terminal, ids.pump);
    ids.link = link.id;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it('retains manually authored PostgreSQL indexes, scope FKs and state checks', async () => {
    const indexes = await db.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema()`;
    const byIndex = new Map(
      indexes.map((row) => [row.indexname, row.indexdef]),
    );
    for (const [name, predicate] of [
      ['TerminalPumpAssignment_one_terminal', '"endedAt" IS NULL'],
      ['TerminalPumpAssignment_one_pump', '"endedAt" IS NULL'],
      ['TerminalEnablement_one_active', '"disabledAt" IS NULL'],
      ['TerminalOperation_one_active', '"closedAt" IS NULL'],
      ['TerminalCredential_one_active', '"revokedAt" IS NULL'],
      ['SupervisorShift_one_open', '"closedAt" IS NULL'],
      ['SupervisorStationAssignment_one_active', '"endedAt" IS NULL'],
      ['UserPermissionGrant_one_active', '"revokedAt" IS NULL'],
    ])
      expect(byIndex.get(name)).toContain(predicate);
    const constraints = await db.$queryRaw<
      Array<{ conname: string; contype: string }>
    >`
      SELECT c.conname,c.contype FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=current_schema()`;
    const byConstraint = new Map(
      constraints.map((row) => [row.conname, row.contype]),
    );
    for (const name of [
      'TerminalPumpAssignment_terminal_station',
      'TerminalPumpAssignment_pump_station',
      'SupervisorShift_assignment_scope',
      'TerminalEnablement_terminal_station',
      'TerminalEnablement_shift_station',
      'TerminalEnablement_supervisor_scope',
      'TerminalEnablement_assignment_scope',
      'TerminalOperation_assignment_scope',
      'TerminalOperation_enablement_terminal',
      'FuelAuthorization_operation_scope',
      'FuelAuthorization_assignment_scope',
      'Transaction_operation_scope',
      'Transaction_assignment_scope',
    ])
      expect(byConstraint.get(name)).toBe('f');
    for (const name of [
      'TerminalPumpAssignment_dates',
      'SupervisorShift_dates',
      'TerminalEnablement_dates',
      'TerminalCredential_dates',
      'Terminal_lifecycle_dates',
      'TerminalOperation_dates',
      'FuelAuthorization_terminal_snapshot',
      'Transaction_terminal_snapshot',
    ])
      expect(byConstraint.get(name)).toBe('c');
  });

  it('keeps client-only, client+supervisor, client+admin, and all three permissions independent', async () => {
    for (const role of ['client', 'supervisor', 'admin', 'multi'])
      expect((await auth('either', await signed(ids[role]))).userId).toBe(
        ids[role],
      );
    await expect(
      auth('supervisor', await signed(ids.client)),
    ).rejects.toThrow();
    await expect(auth('admin', await signed(ids.client))).rejects.toThrow();
    expect(
      (await auth('supervisor', await signed(ids.supervisor))).userId,
    ).toBe(ids.supervisor);
    expect((await auth('admin', await signed(ids.admin))).userId).toBe(
      ids.admin,
    );
    expect((await auth('supervisor', await signed(ids.multi))).userId).toBe(
      ids.multi,
    );
    expect((await auth('admin', await signed(ids.multi))).userId).toBe(
      ids.multi,
    );
  });

  it('denies another station and cross-station terminal/pump links', async () => {
    await expect(
      db.terminal.update({
        where: { id: ids.terminal },
        data: { lifecycle: 'REVOCADA' },
      }),
    ).rejects.toThrow();
    await expect(
      db.terminalPumpAssignment.update({
        where: { id: ids.link },
        data: { endedAt: new Date(0) },
      }),
    ).rejects.toThrow();
    await expect(
      operations.openShift(ids.supervisor, ids.station_b),
    ).rejects.toThrow();
    await expect(
      operations.terminals(ids.supervisor, ids.station_b),
    ).rejects.toThrow();
    await expect(
      operations.assignTerminal(ids.terminal2, ids.otherPump),
    ).rejects.toThrow();
    await expect(
      db.terminalPumpAssignment.create({
        data: {
          stationId: ids.station_a,
          terminalId: ids.terminal2,
          pumpId: ids.otherPump,
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces one active terminal per pump and one active enablement', async () => {
    await expect(
      operations.assignTerminal(ids.terminal2, ids.pump),
    ).rejects.toThrow();
    const shift = await operations.openShift(ids.supervisor, ids.station_a);
    ids.shift = shift.id;
    await expect(
      db.supervisorShift.update({
        where: { id: shift.id },
        data: { status: 'CERRADO' },
      }),
    ).rejects.toThrow();
    expect((await operations.currentShift(ids.supervisor))?.id).toBe(shift.id);
    const enablement = await operations.enable(
      ids.supervisor,
      ids.terminal,
      ids.shift,
    );
    ids.enablement = enablement.id;
    await expect(
      db.terminalEnablement.update({
        where: { id: enablement.id },
        data: { disabledAt: new Date() },
      }),
    ).rejects.toThrow();
    await expect(
      operations.enable(ids.supervisor, ids.terminal, ids.shift),
    ).rejects.toThrow();
  });

  it('keeps terminal session after human JWT expiry, and rejects expired/rotated/revoked credentials', async () => {
    const first = await operations.issueCredential(
      ids.supervisor,
      ids.terminal,
    );
    expect((await auth('terminal', undefined, first.token)).terminalId).toBe(
      ids.terminal,
    );
    const expiredHuman = await jwt.signAsync(
      { sub: ids.supervisor, ver: 0 },
      { expiresIn: '1ms' },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(auth('supervisor', expiredHuman)).rejects.toThrow();
    expect((await auth('terminal', undefined, first.token)).terminalId).toBe(
      ids.terminal,
    );
    const rotated = await operations.issueCredential(
      ids.supervisor,
      ids.terminal,
      true,
    );
    await expect(auth('terminal', undefined, first.token)).rejects.toThrow();
    expect((await auth('terminal', undefined, rotated.token)).terminalId).toBe(
      ids.terminal,
    );
    await db.terminalCredential.updateMany({
      where: { terminalId: ids.terminal, revokedAt: null },
      data: {
        issuedAt: new Date(Date.now() - 7200000),
        expiresAt: new Date(Date.now() - 3600000),
      },
    });
    await expect(auth('terminal', undefined, rotated.token)).rejects.toThrow();
    const fresh = await operations.issueCredential(
      ids.supervisor,
      ids.terminal,
    );
    expect((await auth('terminal', undefined, fresh.token)).terminalId).toBe(
      ids.terminal,
    );
    await operations.revokeCredential(ids.supervisor, ids.terminal);
    await expect(auth('terminal', undefined, fresh.token)).rejects.toThrow();
    const replacement = await operations.issueCredential(
      ids.supervisor,
      ids.terminal,
    );
    ids.credential = replacement.token;
  });

  it('enforces one active operation, idempotency, and controlled shift close', async () => {
    const operationId = randomUUID();
    const opened = await operations.startOperation(ids.terminal, operationId);
    expect(
      (await operations.startOperation(ids.terminal, operationId)).id,
    ).toBe(opened.id);
    await expect(
      operations.startOperation(ids.terminal, randomUUID()),
    ).rejects.toThrow();
    const pending = await operations.shiftState(
      ids.supervisor,
      ids.shift,
      'close',
    );
    expect(pending.status).toBe('CIERRE_PENDIENTE');
    await expect(
      operations.startOperation(ids.terminal, randomUUID()),
    ).rejects.toThrow();
    expect((await auth('terminal', undefined, ids.credential)).terminalId).toBe(
      ids.terminal,
    );
    await operations.closeOperation(ids.terminal, operationId);
    expect(
      (await db.supervisorShift.findUniqueOrThrow({ where: { id: ids.shift } }))
        .status,
    ).toBe('CERRADO');
    expect(await operations.currentShift(ids.supervisor)).toBeNull();
    expect(
      (await db.terminal.findUniqueOrThrow({ where: { id: ids.terminal } }))
        .operationalStatus,
    ).toBe('BLOQUEADA');
  });

  it('does not allow enablement during a suspended or closed shift', async () => {
    const shift = await operations.openShift(ids.supervisor, ids.station_a);
    await operations.enable(ids.supervisor, ids.terminal, shift.id);
    const operationId = randomUUID();
    const active = await operations.startOperation(ids.terminal, operationId);
    await operations.shiftState(ids.supervisor, shift.id, 'suspend');
    expect((await operations.operation(ids.terminal, operationId)).id).toBe(
      active.id,
    );
    expect(
      (await db.terminal.findUniqueOrThrow({ where: { id: ids.terminal } }))
        .operationalStatus,
    ).toBe('EN_USO');
    await expect(
      operations.enable(ids.supervisor, ids.terminal, shift.id),
    ).rejects.toThrow();
    await expect(
      operations.startOperation(ids.terminal, randomUUID()),
    ).rejects.toThrow();
    await operations.shiftState(ids.supervisor, shift.id, 'resume');
    expect(
      (await operations.operation(ids.terminal, operationId)).closedAt,
    ).toBeNull();
    await operations.closeOperation(ids.terminal, operationId);
    await operations.shiftState(ids.supervisor, shift.id, 'close');
    await expect(
      operations.enable(ids.supervisor, ids.terminal, shift.id),
    ).rejects.toThrow();
  });

  it('keeps a pump exclusive when two terminals request it concurrently', async () => {
    const pump = await operations.createPump(
      ids.station_a,
      'P03',
      'Surtidor 03',
    );
    const first = await operations.createTerminal(ids.station_a, 'T04');
    const second = await operations.createTerminal(ids.station_a, 'T05');
    const results = await Promise.allSettled([
      operations.assignTerminal(first.id, pump.id),
      operations.assignTerminal(second.id, pump.id),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(
      await db.terminalPumpAssignment.count({
        where: { pumpId: pump.id, endedAt: null },
      }),
    ).toBe(1);
  });

  it('records operational audit events as append-only', async () => {
    const event = await db.operationalAuditEvent.findFirstOrThrow({
      where: { action: 'OPERATION_CLOSED' },
    });
    expect(event.actorKind).toBe('TERMINAL');
    await expect(
      db.operationalAuditEvent.update({
        where: { id: event.id },
        data: { outcome: 'MUTATED' },
      }),
    ).rejects.toThrow();
  });

  it('revokes a terminal and ends a supervisor assignment without removing the Prime user', async () => {
    const shift = await operations.openShift(ids.supervisor, ids.station_a);
    await operations.enable(ids.supervisor, ids.terminal, shift.id);
    const operationId = randomUUID();
    await operations.startOperation(ids.terminal, operationId);
    await operations.revokeTerminal(ids.terminal);
    await expect(
      operations.closeOperation(ids.terminal, operationId),
    ).rejects.toThrow();
    await expect(
      operations.resolveOperation(ids.client, operationId, 'Prueba de acceso'),
    ).rejects.toThrow();
    await expect(auth('terminal', undefined, ids.credential)).rejects.toThrow();
    expect(
      (
        await operations.resolveOperation(
          ids.supervisor,
          operationId,
          'Terminal revocada durante operación',
        )
      ).status,
    ).toBe('CLOSED');
    expect(
      await db.terminalPumpAssignment.count({
        where: { terminalId: ids.terminal, endedAt: null },
      }),
    ).toBe(0);
    await expect(
      operations.enable(ids.supervisor, ids.terminal, ids.shift),
    ).rejects.toThrow();
    await operations.shiftState(ids.supervisor, shift.id, 'close');
    await operations.endSupervisorAssignment(ids.assignment);
    await expect(
      auth('supervisor', await signed(ids.supervisor)),
    ).rejects.toThrow();
    expect((await auth('either', await signed(ids.supervisor))).userId).toBe(
      ids.supervisor,
    );
  });

  it('revokes an admin grant while leaving the client account active', async () => {
    await operations.revokeAdminGrant(ids.grant);
    await expect(auth('admin', await signed(ids.admin))).rejects.toThrow();
    expect((await auth('either', await signed(ids.admin))).userId).toBe(
      ids.admin,
    );
  });

  it('links a technical authorization and settlement to the same operationId', async () => {
    const user = await db.user.create({
      data: {
        email: `phase1b0-${randomUUID()}@example.test`,
        name: 'Phase 1B-0',
        passwordHash: 'test',
      },
    });
    await operations.assignSupervisor(user.id, ids.station_a, 'contract test');
    const shift = await operations.openShift(user.id, ids.station_a);
    const pump = await operations.createPump(
      ids.station_a,
      `Q${randomUUID().slice(0, 6)}`,
      'Contract pump',
    );
    const terminal = await operations.createTerminal(
      ids.station_a,
      `Q${randomUUID().slice(0, 6)}`,
    );
    await operations.assignTerminal(terminal.id, pump.id);
    await operations.enable(user.id, terminal.id, shift.id);
    const operationId = randomUUID();
    const op = await operations.startOperation(terminal.id, operationId);
    const member = await db.membership.create({
      data: {
        number: `PR-${randomUUID().slice(0, 8).toUpperCase()}`,
        userId: ids.client,
        balance: '100.00',
      },
    });
    const plate = `${randomUUID().slice(0, 3).toUpperCase()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    await db.vehicle.create({
      data: { plate, label: 'Contract vehicle', membershipId: member.id },
    });
    const fuel = await db.fuel.create({
      data: {
        code: `F${randomUUID().slice(0, 8)}`,
        name: 'Contract fuel',
        pricePerGallon: '10.00',
      },
    });
    await db.fuelInventory.create({
      data: { stationId: ids.station_a, fuelId: fuel.id, liters: '100.000000' },
    });

    const wallet = new WalletRepository(db);
    const authRepo = new AuthorizationsRepository(db);
    const authorizations = new AuthorizationsService(
      authRepo,
      wallet,
      new PaymentsService(),
    );
    const transactions = new TransactionsService(
      new TransactionsRepository(db),
      new PointsPolicyService({
        getOrThrow: () => '1',
      } as unknown as ConfigService),
      new PaymentsService(),
      authRepo,
      wallet,
    );
    const authResult = await authorizations.create({
      operationId,
      stationId: ids.station_a,
      fuelId: fuel.id,
      plate,
      membershipCode: member.number,
      amount: '20.00',
      unitPrice: '10.00',
      mode: 'POSTPAGO',
    } as never);
    const savedAuth = await db.fuelAuthorization.findUniqueOrThrow({
      where: { operationId },
    });
    await db.fuelAuthorization.update({
      where: { id: savedAuth.id },
      data: {
        terminalOperationId: null,
        terminalId: null,
        pumpId: null,
        terminalPumpAssignmentId: null,
      },
    });
    await expect(
      operations.closeOperation(terminal.id, operationId),
    ).rejects.toThrow('Autorización pendiente');
    expect(
      (await db.terminalOperation.findUniqueOrThrow({ where: { operationId } }))
        .closedAt,
    ).toBeNull();
    await db.fuelAuthorization.update({
      where: { id: savedAuth.id },
      data: {
        terminalOperationId: op.id,
        terminalId: terminal.id,
        pumpId: pump.id,
        terminalPumpAssignmentId: op.terminalPumpAssignmentId,
      },
    });
    expect(savedAuth.terminalOperationId).toBe(op.id);
    expect(savedAuth.terminalId).toBe(terminal.id);
    expect(savedAuth.pumpId).toBe(pump.id);
    expect(savedAuth.terminalPumpAssignmentId).toBe(
      op.terminalPumpAssignmentId,
    );
    await expect(
      transactions.create({
        operationId: randomUUID(),
        stationId: ids.station_a,
        fuelId: fuel.id,
        amount: '10.00',
        mode: 'POSTPAGO',
        paymentMethod: 'SALDO_PRIME',
        gallons: '1.000',
        authorizationId: savedAuth.id,
        plate,
        membershipCode: member.number,
      } as never),
    ).rejects.toThrow();
    await expect(
      transactions.create({
        operationId,
        stationId: ids.station_b,
        fuelId: fuel.id,
        amount: '10.00',
        mode: 'POSTPAGO',
        paymentMethod: 'SALDO_PRIME',
        gallons: '1.000',
        authorizationId: savedAuth.id,
        plate,
        membershipCode: member.number,
      } as never),
    ).rejects.toThrow();
    await expect(
      db.fuelAuthorization.update({
        where: { id: savedAuth.id },
        data: { terminalId: ids.otherTerminal },
      }),
    ).rejects.toThrow();
    await expect(
      db.fuelAuthorization.update({
        where: { id: savedAuth.id },
        data: { pumpId: ids.otherPump },
      }),
    ).rejects.toThrow();
    await expect(
      db.fuelAuthorization.update({
        where: { id: savedAuth.id },
        data: { terminalPumpAssignmentId: ids.link },
      }),
    ).rejects.toThrow();
    await authorizations.progress(savedAuth.id, {
      amount: '10.00',
      gallons: '1.000',
    });
    const result = await transactions.create({
      operationId,
      stationId: ids.station_a,
      fuelId: fuel.id,
      amount: '10.00',
      mode: 'POSTPAGO',
      paymentMethod: 'SALDO_PRIME',
      gallons: '1.000',
      authorizationId: savedAuth.id,
      plate,
      membershipCode: member.number,
    } as never);
    const savedTransaction = await db.transaction.findUniqueOrThrow({
      where: { operationId },
    });
    expect(savedTransaction.authorizationId).toBe(savedAuth.id);
    expect(savedTransaction.terminalOperationId).toBe(op.id);
    expect(savedTransaction.terminalId).toBe(terminal.id);
    expect(savedTransaction.pumpId).toBe(pump.id);
    expect(savedTransaction.terminalPumpAssignmentId).toBe(
      op.terminalPumpAssignmentId,
    );
    expect(result.replayed).toBe(false);
    await operations.closeOperation(terminal.id, operationId);
    expect(
      (await operations.closeOperation(terminal.id, operationId)).closedAt,
    ).not.toBeNull();
    expect(authResult.replayed).toBe(false);

    const legacyOperationId = randomUUID();
    const legacyAuth = await db.fuelAuthorization.create({
      data: {
        operationId: legacyOperationId,
        requestHash: 'a'.repeat(64),
        plate,
        vehicleId: (await db.vehicle.findUniqueOrThrow({ where: { plate } }))
          .id,
        membershipId: member.id,
        stationId: ids.station_a,
        fuelId: fuel.id,
        unitPrice: '10.00',
        authorizedAmount: '10.00',
        reservedAmount: '10.00',
        balanceAfter: '0.00',
        dispensedAmount: '10.00',
        dispensedGallons: '1.000',
        mode: 'POSTPAGO',
        status: 'DISPENSING',
      },
    });
    const legacyTx = await transactions.create({
      operationId: legacyOperationId,
      stationId: ids.station_a,
      fuelId: fuel.id,
      amount: '10.00',
      mode: 'POSTPAGO',
      paymentMethod: 'SALDO_PRIME',
      gallons: '1.000',
      authorizationId: legacyAuth.id,
      plate,
      membershipCode: member.number,
    } as never);
    const savedLegacyTx = await db.transaction.findUniqueOrThrow({
      where: { operationId: legacyOperationId },
    });
    expect(legacyTx.replayed).toBe(false);
    expect(savedLegacyTx.terminalOperationId).toBeNull();
    expect(savedLegacyTx.terminalId).toBeNull();
  });

  it('serves admin and supervisor endpoints and requires the signed gateway for pairing and terminal access', async () => {
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = module.createNestApplication();
    setupApp(app);
    await app.init();
    try {
      const human = await new JwtService({
        secret: process.env.JWT_SECRET,
      }).signAsync(
        { sub: ids.multi, ver: 0 },
        {
          expiresIn: '1h',
          issuer: 'primax-v6',
          audience: 'primax-prime',
          algorithm: 'HS256',
        },
      );
      const server = app.getHttpServer();
      const stations = await request(server)
        .get('/api/v1/supervisor/me/stations')
        .auth(human, { type: 'bearer' })
        .expect(200);
      expect(
        stations.body.some(
          (row: { stationId: string }) => row.stationId === ids.station_a,
        ),
      ).toBe(true);
      const pump = await request(server)
        .post('/api/v1/operational-admin/pumps')
        .auth(human, { type: 'bearer' })
        .send({ stationId: ids.station_a, code: 'P05', name: 'Surtidor HTTP' })
        .expect(201);
      const terminal = await request(server)
        .post('/api/v1/operational-admin/terminals')
        .auth(human, { type: 'bearer' })
        .send({ stationId: ids.station_a, code: 'T06' })
        .expect(201);
      await request(server)
        .post(
          `/api/v1/operational-admin/terminals/${terminal.body.id}/assign-pump`,
        )
        .auth(human, { type: 'bearer' })
        .send({ pumpId: pump.body.id })
        .expect(201);
      const shift = await request(server)
        .post('/api/v1/supervisor/shifts')
        .auth(human, { type: 'bearer' })
        .send({ stationId: ids.station_a })
        .expect(201);
      await request(server)
        .post(`/api/v1/supervisor/terminals/${terminal.body.id}/enable`)
        .auth(human, { type: 'bearer' })
        .send({ shiftId: shift.body.id })
        .expect(201);
      await request(server)
        .post(`/api/v1/supervisor/terminals/${terminal.body.id}/pair`)
        .auth(human, { type: 'bearer' })
        .expect(401);
      await request(server).get('/api/v1/terminal/me').expect(401);
    } finally {
      await app.close();
    }
  });
});
