import '../src/config/load-env';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryReconciliationService } from '../src/inventory/inventory-reconciliation';
import { reserveInventory } from '../src/inventory/inventory-reservations';
import { setupApp } from '../src/setup-app';

describe('Fase 1B-3: legacy abierto, activación y conciliación local', () => {
  const original = process.env.DATABASE_URL!;
  const schema = 'e2e_inventory_reconcile_' + randomUUID().replaceAll('-', '');
  let db: PrismaService;
  let app: INestApplication;
  let adminToken: string;
  let membershipId: string;
  let reconciliation: InventoryReconciliationService;
  type Pair = { stationId: string; fuelId: string };

  async function pair(liters = '1000.000000'): Promise<Pair> {
    const code = randomUUID().slice(0, 8);
    const stationId = (await db.station.create({
      data: { code: 'S' + code, name: 'Local test station', address: 'Local' },
    })).id;
    const fuelId = (await db.fuel.create({
      data: { code: 'F' + code, name: 'Local test fuel', pricePerGallon: '20.00' },
    })).id;
    await db.fuelInventory.create({ data: { stationId, fuelId, liters } });
    return { stationId, fuelId };
  }

  async function authorization(
    scope: Pair,
    options: { price?: string | null; amount?: string; gallons?: string; status?: 'RESERVED' | 'INTERVENTION_REQUIRED' } = {},
  ) {
    return db.fuelAuthorization.create({
      data: {
        operationId: randomUUID(), requestHash: 'a'.repeat(64),
        plate: 'NEW-123', membershipId, ...scope,
        unitPrice: options.price === undefined ? '20.00' : options.price,
        authorizedAmount: options.amount ?? '60.00',
        reservedAmount: '0.00', releasedAmount: '0.00', balanceAfter: '0.00',
        dispensedGallons: options.gallons ?? '0.000',
        status: options.status ?? 'RESERVED', mode: 'POSTPAGO',
        inventoryManaged: false,
      },
    });
  }

  async function physical(scope: Pair) {
    return db.fuelInventory.findUniqueOrThrow({
      where: { stationId_fuelId: scope },
    });
  }

  const url = (scope: Pair, suffix: 'reconcile' | 'activate' | 'reconciliation') =>
    `/api/v1/inventory/${scope.stationId}/${scope.fuelId}/${suffix}`;

  beforeAll(async () => {
    const originalUrl = new URL(original);
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(originalUrl.hostname) ||
      originalUrl.pathname !== '/primax_v12_1b3_test'
    )
      throw Error('Se requiere PostgreSQL local de prueba');
    const testUrl = new URL(originalUrl);
    testUrl.searchParams.set('schema', schema);
    process.env.DATABASE_URL = testUrl.toString();
    process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      env: process.env, stdio: 'pipe',
    });
    db = new PrismaService();
    await db.$connect();
    reconciliation = new InventoryReconciliationService(db);
    const { AppModule } = await import('../src/app.module');
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile())
      .createNestApplication();
    app.useLogger(['error']);
    setupApp(app);
    await app.init();
    const config = app.get(ConfigService);
    config.set('APP_MODE', 'local');
    config.set('SHOW_DEMO_ADMIN_CREDENTIALS', 'true');
    config.set('DEMO_ADMIN_USER', 'inventory-test-admin');
    config.set('DEMO_ADMIN_PASSWORD', 'InventoryTestOnly123!');
    adminToken = (await request(app.getHttpServer())
      .post('/api/v1/admin/login')
      .send({ username: 'inventory-test-admin', password: 'InventoryTestOnly123!' })
      .expect(201)).body.accessToken;
    const user = await db.user.create({
      data: {
        email: randomUUID() + '@example.test', name: 'Legacy fixture',
        passwordHash: 'local-fixture',
        membership: { create: { number: 'LEGACY-' + randomUUID().slice(0, 8) } },
      }, include: { membership: true },
    });
    membershipId = user.membership!.id;
  }, 90000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    process.env.DATABASE_URL = original;
    process.env.DATABASE_URL_UNPOOLED = original;
    console.log('Inventory reconciliation evidence schema:', schema);
  });

  it('opens one baseline for new inventory and activates pairs independently', async () => {
    const first = await pair();
    const second = await pair();
    const third = await pair();
    expect(await db.inventoryMovement.count({ where: { ...first, kind: 'OPENING_BALANCE' } })).toBe(1);
    expect((await reconciliation.reconcile(first.stationId, first.fuelId)).status).toBe('RECONCILED');
    expect((await reconciliation.activate(first.stationId, first.fuelId)).status).toBe('REQUIRED');
    expect((await reconciliation.activate(first.stationId, first.fuelId)).status).toBe('REQUIRED');
    expect((await db.inventoryActivation.findUniqueOrThrow({ where: { stationId_fuelId: second } })).status).toBe('LEGACY');
    expect((await db.inventoryActivation.findUniqueOrThrow({ where: { stationId_fuelId: third } })).status).toBe('LEGACY');
    expect(await db.inventoryMovement.count({ where: { ...first, kind: 'OPENING_BALANCE' } })).toBe(1);
  });

  it('keeps every new inventory mutation primitive unavailable to PUBLIC', async () => {
    const rows = await db.$queryRaw<Array<{ name: string; publicCanExecute: boolean }>>`
      SELECT p.proname AS name,
        EXISTS (
          SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) grant_entry
          WHERE grant_entry.grantee = 0 AND grant_entry.privilege_type = 'EXECUTE'
        ) AS "publicCanExecute"
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = current_schema()
        AND p.proname IN (
          'inventory_initialize_pair', 'inventory_create_reservation',
          'inventory_create_reservation_unchecked', 'inventory_require_reservation',
          'inventory_mark_pair_review', 'inventory_backfill_legacy'
        )`;
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.publicCanExecute === false)).toBe(true);
  });

  it('backfills open legacy without delivery once; new commitments respect its available stock', async () => {
    const scope = await pair('15.000000');
    const legacy = await authorization(scope);
    const before = await physical(scope);
    const report = await reconciliation.reconcile(scope.stationId, scope.fuelId);
    expect(report).toMatchObject({ status: 'RECONCILED', issues: [] });
    const reservation = await db.inventoryReservation.findUniqueOrThrow({ where: { operationId: legacy.operationId } });
    expect(reservation.source).toBe('LEGACY');
    expect(reservation.consumedLiters.isZero()).toBe(true);
    expect(reservation.remainingLiters.gt(0)).toBe(true);
    expect((await physical(scope)).liters.eq(before.liters)).toBe(true);
    await reconciliation.reconcile(scope.stationId, scope.fuelId);
    expect(await db.inventoryReservation.count({ where: { operationId: legacy.operationId } })).toBe(1);
    expect(await db.inventoryMovement.count({ where: { eventKey: `legacy-backfill:${legacy.id}` } })).toBe(1);
    await expect(db.atomic((tx) => reserveInventory(tx, {
      operationId: randomUUID(), ...scope, terminalOperationId: null,
      source: 'LEGACY', maxGallons: new Prisma.Decimal('2.000'),
      requestHash: 'b'.repeat(64), status: 'ACTIVE',
    }))).rejects.toThrow();
    expect((await physical(scope)).liters.eq(before.liters)).toBe(true);
  });

  it('backfills partial and fully dispensed legacy from complete progress without a second debit', async () => {
    const scope = await pair();
    const partial = await authorization(scope);
    const full = await authorization(scope, { amount: '20.00' });
    await db.fuelAuthorization.update({ where: { id: partial.id }, data: { dispensedGallons: '1.000', dispensedAmount: '20.00', status: 'DISPENSING' } });
    await db.fuelAuthorization.update({ where: { id: full.id }, data: { dispensedGallons: '1.000', dispensedAmount: '20.00', status: 'DISPENSING' } });
    const before = await physical(scope);
    const report = await reconciliation.reconcile(scope.stationId, scope.fuelId);
    expect(report.issues).toEqual([]);
    for (const auth of [partial, full]) {
      const reservation = await db.inventoryReservation.findUniqueOrThrow({ where: { operationId: auth.operationId } });
      const legacyDebit = await db.inventoryMovement.aggregate({
        where: { authorizationId: auth.id, kind: 'LEGACY_DISPENSE' },
        _sum: { physicalDeltaLiters: true },
      });
      expect(reservation.consumedLiters.eq(legacyDebit._sum.physicalDeltaLiters!.negated())).toBe(true);
      expect(reservation.initialLiters.eq(reservation.consumedLiters.plus(reservation.remainingLiters))).toBe(true);
      expect((await db.fuelAuthorization.findUniqueOrThrow({ where: { id: auth.id } })).inventoryManaged).toBe(true);
    }
    expect((await physical(scope)).liters.eq(before.liters)).toBe(true);
    expect(await db.inventoryMovement.count({ where: { ...scope, kind: 'LEGACY_DISPENSE' } })).toBe(2);
    expect(await db.inventoryMovement.count({ where: { ...scope, kind: 'DISPENSE' } })).toBe(0);
  });

  it('missing price or pre-ledger physical progress leaves REVIEW and blocks new operations', async () => {
    const missingPrice = await pair();
    await authorization(missingPrice, { price: null });
    const report = await reconciliation.reconcile(missingPrice.stationId, missingPrice.fuelId);
    expect(report.status).toBe('REVIEW');
    expect(report.issues.some((issue) => issue.startsWith('OPEN_LEGACY_AUTHORIZATION'))).toBe(true);
    await expect(db.atomic((tx) => reserveInventory(tx, {
      operationId: randomUUID(), ...missingPrice, terminalOperationId: null,
      source: 'LEGACY', maxGallons: new Prisma.Decimal('1.000'),
      requestHash: 'b'.repeat(64), status: 'ACTIVE',
    }))).rejects.toThrow();
    const missingHistory = await pair();
    await authorization(missingHistory, { gallons: '1.000' });
    expect((await reconciliation.reconcile(missingHistory.stationId, missingHistory.fuelId)).status).toBe('REVIEW');
    expect((await physical(missingHistory)).reservedLiters.isZero()).toBe(true);
  });

  it('insufficient inventory and physical uncertainty remain in REVIEW without altering liters', async () => {
    const scope = await pair('1.000000');
    await authorization(scope);
    const before = await physical(scope);
    expect((await reconciliation.reconcile(scope.stationId, scope.fuelId)).status).toBe('REVIEW');
    expect((await physical(scope)).liters.eq(before.liters)).toBe(true);
    expect((await physical(scope)).reservedLiters.isZero()).toBe(true);
    const intervention = await pair();
    await authorization(intervention, { status: 'INTERVENTION_REQUIRED' });
    expect((await reconciliation.reconcile(intervention.stationId, intervention.fuelId)).status).toBe('REVIEW');
  });

  it('concurrent backfill is replay safe and detected divergence is never self-corrected', async () => {
    const scope = await pair();
    const legacy = await authorization(scope);
    const [a, b] = await Promise.all([
      reconciliation.reconcile(scope.stationId, scope.fuelId),
      reconciliation.reconcile(scope.stationId, scope.fuelId),
    ]);
    expect([a.status, b.status]).toEqual(['RECONCILED', 'RECONCILED']);
    expect(await db.inventoryReservation.count({ where: { operationId: legacy.operationId } })).toBe(1);
    expect(await db.inventoryMovement.count({ where: { eventKey: `legacy-backfill:${legacy.id}` } })).toBe(1);
    const before = await physical(scope);
    await db.fuelInventory.update({
      where: { stationId_fuelId: scope },
      data: { reservedLiters: before.reservedLiters.plus('0.000001') },
    });
    const report = await reconciliation.reconcile(scope.stationId, scope.fuelId);
    expect(report.status).toBe('REVIEW');
    expect(report.issues).toContain('RESERVED_LITERS_DIVERGENCE');
    expect((await physical(scope)).reservedLiters.eq(before.reservedLiters.plus('0.000001'))).toBe(true);
    expect((await physical(scope)).liters.eq(before.liters)).toBe(true);
  });

  it('detects a movement without its required authorization link', async () => {
    const scope = await pair();
    const before = await physical(scope);
    await db.inventoryMovement.create({
      data: {
        eventKey: `invalid-legacy:${randomUUID()}`, ...scope, sequence: BigInt(2),
        kind: 'LEGACY_DISPENSE', physicalDeltaLiters: '0', reservedDeltaLiters: '0',
        litersAfter: before.liters, reservedLitersAfter: before.reservedLiters,
        actorKind: 'SYSTEM', reason: 'Broken link fixture',
      },
    });
    const report = await reconciliation.reconcile(scope.stationId, scope.fuelId);
    expect(report.status).toBe('REVIEW');
    expect(report.issues.some((issue) => issue.startsWith('MOVEMENT_LINK:'))).toBe(true);
    expect((await physical(scope)).liters.eq(before.liters)).toBe(true);
  });

  it('ledger failure rolls back the entire legacy commitment', async () => {
    const scope = await pair();
    const legacy = await authorization(scope);
    const before = await physical(scope);
    await db.inventoryMovement.create({
      data: {
        eventKey: `legacy-backfill:${legacy.id}`, ...scope, sequence: BigInt(2),
        kind: 'ADJUST_IN', physicalDeltaLiters: '0', reservedDeltaLiters: '0',
        litersAfter: before.liters, reservedLitersAfter: before.reservedLiters,
        actorKind: 'SYSTEM', reason: 'Collision fixture',
      },
    });
    await expect(reconciliation.reconcile(scope.stationId, scope.fuelId)).rejects.toThrow();
    expect((await physical(scope)).liters.eq(before.liters)).toBe(true);
    expect((await physical(scope)).reservedLiters.eq(before.reservedLiters)).toBe(true);
    expect(await db.inventoryReservation.count({ where: { operationId: legacy.operationId } })).toBe(0);
    expect((await db.fuelAuthorization.findUniqueOrThrow({ where: { id: legacy.id } })).inventoryManaged).toBe(false);
  });

  it('admin routes are protected; REQUIRED blocks a newly found unreserved legacy progress', async () => {
    const scope = await pair();
    await request(app.getHttpServer()).post(url(scope, 'reconcile')).expect(401);
    await request(app.getHttpServer()).post(url(scope, 'reconcile'))
      .set('x-kiosk-key', process.env.KIOSK_API_KEY!).expect(401);
    expect((await request(app.getHttpServer()).post(url(scope, 'reconcile'))
      .auth(adminToken, { type: 'bearer' }).expect(201)).body.status).toBe('RECONCILED');
    expect((await request(app.getHttpServer()).post(url(scope, 'activate'))
      .auth(adminToken, { type: 'bearer' }).expect(201)).body.status).toBe('REQUIRED');
    const auth = await authorization(scope);
    const before = await physical(scope);
    await expect(db.fuelAuthorization.update({
      where: { id: auth.id }, data: { dispensedGallons: '1.000' },
    })).rejects.toThrow();
    expect((await physical(scope)).liters.eq(before.liters)).toBe(true);
    expect((await request(app.getHttpServer()).get(url(scope, 'reconciliation'))
      .auth(adminToken, { type: 'bearer' }).expect(200)).body.issues).toContain(`OPEN_LEGACY_AUTHORIZATION:${auth.id}`);
  });
});
