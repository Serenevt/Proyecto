import '../src/config/load-env';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthorizationsService } from '../src/transactions/authorizations.service';
import { OperationsService } from '../src/operations/operations.service';
import { setupApp } from '../src/setup-app';
import { reserveInventory } from '../src/inventory/inventory-reservations';

describe('Operational incidents PostgreSQL', () => {
  const original = process.env.DATABASE_URL!;
  const schema = 'e2e_incidents_' + randomUUID().replaceAll('-', '');
  let db: PrismaClient;
  let app: INestApplication;
  let authorizationService: AuthorizationsService;
  let jwt: JwtService;
  let stationA: string;
  let stationB: string;
  let fuelId: string;
  let supervisorA: { id: string; token: string };
  let supervisorB: { id: string; token: string };
  let operationA: string;
  let authorizationA: string;

  async function makeAuthorization({
    operationId = randomUUID(),
    stationId,
    paymentStatus = 'CAPTURED',
    status = 'RESERVED',
    dispensedAmount = '0.00',
    terminalOperationId,
    inventoryManaged = false,
  }: {
    operationId?: string;
    stationId: string;
    paymentStatus?: 'CAPTURED' | 'PENDING' | 'REJECTED';
    status?: 'RESERVED' | 'SETTLED';
    dispensedAmount?: string;
    terminalOperationId?: string;
    inventoryManaged?: boolean;
  }) {
    const requestHash = randomUUID().replaceAll('-', '').padEnd(64, 'a');
    const payment = await db.payment.create({
      data: {
        operationId,
        amount: '40.00',
        method: 'YAPE',
        status: paymentStatus,
        provider: 'DEMO',
      },
    });
    if (inventoryManaged) {
      await db.$transaction((tx) =>
        reserveInventory(tx, {
          operationId,
          stationId,
          fuelId,
          terminalOperationId: terminalOperationId ?? null,
          source: terminalOperationId ? 'TERMINAL' : 'LEGACY',
          maxGallons: new Prisma.Decimal('2.000'),
          requestHash,
          status: 'ACTIVE',
        }),
      );
    }
    const terminalOperation = terminalOperationId
      ? await db.terminalOperation.findUniqueOrThrow({
          where: { id: terminalOperationId },
        })
      : null;
    const authorization = await db.fuelAuthorization.create({
      data: {
        operationId,
        requestHash,
        plate: 'INC-001',
        stationId,
        fuelId,
        paymentId: payment.id,
        authorizedAmount: '40.00',
        reservedAmount: '0.00',
        balanceAfter: '0.00',
        dispensedAmount,
        dispensedGallons: dispensedAmount === '0.00' ? '0.000' : '1.000',
        mode: 'PREPAGO',
        status,
        inventoryManaged,
        terminalOperationId,
        terminalId: terminalOperation?.terminalId,
        pumpId: terminalOperation?.pumpId,
        terminalPumpAssignmentId: terminalOperation?.terminalPumpAssignmentId,
      },
    });
    if (inventoryManaged)
      await db.inventoryReservation.update({
        where: { operationId },
        data: { authorizationId: authorization.id },
      });
    return { operationId, payment, authorization };
  }

  async function userWithStation(stationId: string, label: string) {
    const user = await db.user.create({
      data: {
        email: `${label}-${randomUUID()}@example.test`,
        name: label,
        passwordHash: 'test-only',
      },
    });
    await db.supervisorStationAssignment.create({
      data: { userId: user.id, stationId, reason: 'Incidents E2E' },
    });
    const token = await jwt.signAsync({ sub: user.id, ver: user.authVersion });
    return { id: user.id, token };
  }

  beforeAll(async () => {
    const url = new URL(original);
    if (url.protocol !== 'postgresql:' || url.pathname !== '/primax_v11_1')
      throw new Error('Se requiere la base PostgreSQL local primax_v11_1');
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.DATABASE_URL_UNPOOLED = url.toString();
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: process.env,
        stdio: 'pipe',
        timeout: 90000,
      },
    );
    db = new PrismaClient();
    await db.$connect();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(['error']);
    setupApp(app);
    await app.init();
    authorizationService = app.get(AuthorizationsService);
    jwt = app.get(JwtService);

    const [stationOne, stationTwo] = await Promise.all([
      db.station.create({
        data: {
          code: `INCA-${randomUUID().slice(0, 6)}`,
          name: 'Incidents A',
          address: 'Local',
        },
      }),
      db.station.create({
        data: {
          code: `INCB-${randomUUID().slice(0, 6)}`,
          name: 'Incidents B',
          address: 'Local',
        },
      }),
    ]);
    stationA = stationOne.id;
    stationB = stationTwo.id;
    const fuel = await db.fuel.create({
      data: {
        code: `INCF-${randomUUID().slice(0, 6)}`,
        name: 'Incident fuel',
        pricePerGallon: '20.00',
      },
    });
    fuelId = fuel.id;
    await Promise.all(
      [stationA, stationB].map((stationId) =>
        db.fuelInventory.create({
          data: { stationId, fuelId, liters: '500.000000' },
        }),
      ),
    );
    supervisorA = await userWithStation(stationA, 'incident-a');
    supervisorB = await userWithStation(stationB, 'incident-b');
  }, 90000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    process.env.DATABASE_URL = original;
    process.env.DATABASE_URL_UNPOOLED = original;
    if (/^e2e_incidents_[a-f0-9]{32}$/.test(schema)) {
      const cleanup = new PrismaClient({
        datasources: { db: { url: original } },
      });
      try {
        await cleanup.$executeRawUnsafe(
          `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
        );
      } finally {
        await cleanup.$disconnect();
      }
    }
  });

  it('confirmed payment and definitive zero-progress intervention opens one INC-001 without changing payment or liters', async () => {
    const operations = app.get(OperationsService);
    const pump = await operations.createPump(
      stationA,
      `IP-${randomUUID().slice(0, 6)}`,
      'Incident test pump',
    );
    const terminal = await operations.createTerminal(
      stationA,
      `IT-${randomUUID().slice(0, 6)}`,
    );
    await operations.assignTerminal(terminal.id, pump.id);
    const shift = await operations.openShift(supervisorA.id, stationA);
    await operations.enable(supervisorA.id, terminal.id, shift.id);
    const terminalOperation = await operations.startOperation(
      terminal.id,
      randomUUID(),
    );
    const before = await makeAuthorization({
      operationId: terminalOperation.operationId,
      stationId: stationA,
      inventoryManaged: true,
      terminalOperationId: terminalOperation.id,
    });
    const inventoryBefore = await db.fuelInventory.findUniqueOrThrow({
      where: { stationId_fuelId: { stationId: stationA, fuelId } },
    });
    operationA = before.operationId;
    authorizationA = before.authorization.id;
    const [first, replay] = await Promise.all([
      authorizationService.intervention(authorizationA),
      authorizationService.intervention(authorizationA),
    ]);
    const incident = first.incident!;
    expect(incident).toMatchObject({
      code: 'INC_001',
      status: 'OPEN',
      operationId: operationA,
      authorizationId: authorizationA,
      paymentId: before.payment.id,
      stationId: stationA,
      terminalOperationId: terminalOperation.id,
      terminalId: terminal.id,
      pumpId: pump.id,
    });
    expect(replay.incident!.id).toBe(incident.id);
    expect(
      await db.operationalIncident.count({
        where: { operationId: operationA },
      }),
    ).toBe(1);
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: before.payment.id } }))
        .status,
    ).toBe('CAPTURED');
    expect(
      (
        await db.payment.findUniqueOrThrow({ where: { id: before.payment.id } })
      ).refundedAmount.toFixed(2),
    ).toBe('0.00');
    expect(
      await db.transaction.count({ where: { operationId: operationA } }),
    ).toBe(0);
    expect(
      await db.operationalAuditEvent.count({
        where: { action: 'INCIDENT_OPENED', targetId: incident.id },
      }),
    ).toBe(1);
    const inventoryAfter = await db.fuelInventory.findUniqueOrThrow({
      where: { stationId_fuelId: { stationId: stationA, fuelId } },
    });
    expect(inventoryAfter.liters.eq(inventoryBefore.liters)).toBe(true);
    expect(
      inventoryAfter.reservedLiters.eq(inventoryBefore.reservedLiters),
    ).toBe(true);
    expect(
      (
        await db.inventoryReservation.findUniqueOrThrow({
          where: { operationId: operationA },
        })
      ).status,
    ).toBe('REVIEW');
    expect(
      (
        await db.terminalOperation.findUniqueOrThrow({
          where: { id: terminalOperation.id },
        })
      ).status,
    ).toBe('INTERVENTION_REQUIRED');
  });

  it('does not create INC-001 for rejected, ambiguous, already dispatched, or completed operations', async () => {
    const rejected = await makeAuthorization({
      stationId: stationA,
      paymentStatus: 'REJECTED',
    });
    const pending = await makeAuthorization({
      stationId: stationA,
      paymentStatus: 'PENDING',
    });
    const dispatched = await makeAuthorization({
      stationId: stationA,
      dispensedAmount: '20.00',
    });
    const completed = await makeAuthorization({
      stationId: stationA,
      status: 'SETTLED',
      dispensedAmount: '20.00',
    });
    await Promise.all([
      authorizationService.intervention(rejected.authorization.id),
      authorizationService.intervention(pending.authorization.id),
      authorizationService.intervention(dispatched.authorization.id),
      authorizationService.intervention(completed.authorization.id),
    ]);
    expect(
      await db.operationalIncident.count({
        where: {
          operationId: {
            in: [
              rejected.operationId,
              pending.operationId,
              dispatched.operationId,
              completed.operationId,
            ],
          },
        },
      }),
    ).toBe(0);
  });

  it('keeps incidents independent across stations and operations', async () => {
    const second = await makeAuthorization({ stationId: stationB });
    await authorizationService.intervention(second.authorization.id);
    const [one, two] = await Promise.all([
      db.operationalIncident.findUniqueOrThrow({
        where: {
          code_operationId: { code: 'INC_001', operationId: operationA },
        },
      }),
      db.operationalIncident.findUniqueOrThrow({
        where: {
          code_operationId: {
            code: 'INC_001',
            operationId: second.operationId,
          },
        },
      }),
    ]);
    expect(one.stationId).toBe(stationA);
    expect(two.stationId).toBe(stationB);
    expect(one.id).not.toBe(two.id);
  });

  it('lists and details incidents only for assigned supervisors, and resolves idempotently with audit', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/v1/incidents?stationId=${stationA}`)
      .auth(supervisorA.token, { type: 'bearer' })
      .expect(200);
    const incident = await db.operationalIncident.findUniqueOrThrow({
      where: { code_operationId: { code: 'INC_001', operationId: operationA } },
    });
    expect(
      list.body.some((row: { id: string }) => row.id === incident.id),
    ).toBe(true);
    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incident.id}`)
      .auth(supervisorA.token, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incident.id}`)
      .auth(supervisorB.token, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incident.id}`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incident.id}/status`)
      .auth(supervisorA.token, { type: 'bearer' })
      .send({
        status: 'IN_REVIEW',
        reason: 'Personal revisando el comprobante',
      })
      .expect(201);
    const resolved = await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incident.id}/status`)
      .auth(supervisorA.token, { type: 'bearer' })
      .send({ status: 'RESOLVED', reason: 'Atención registrada y conciliada' })
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incident.id}/status`)
      .auth(supervisorA.token, { type: 'bearer' })
      .send({ status: 'RESOLVED', reason: 'Reintento' })
      .expect(201);
    expect(resolved.body.id).toBe(replay.body.id);
    expect(replay.body.resolution).toBe('Atención registrada y conciliada');
    expect(
      await db.operationalAuditEvent.count({
        where: { action: 'INCIDENT_RESOLVED', targetId: incident.id },
      }),
    ).toBe(1);
    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incident.id}/status`)
      .auth(supervisorA.token, { type: 'bearer' })
      .send({ status: 'DISMISSED', reason: 'Intento incompatible' })
      .expect(409);
  });
});
