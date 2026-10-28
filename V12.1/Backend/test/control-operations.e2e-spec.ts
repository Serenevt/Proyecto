import { randomUUID } from 'node:crypto';
import { ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { AdminControlPermission, Prisma } from '@prisma/client';
import { ControlOperationsService } from '../src/control/control-operations.service';
import { InventoryReconciliationService } from '../src/inventory/inventory-reconciliation';
import { PrismaService } from '../src/prisma/prisma.service';

const isolated = process.env.CONTROL_TEST_DATABASE_URL;
const suite = isolated ? describe : describe.skip;

suite('Primax Control operational modules on isolated PostgreSQL', () => {
  let db: PrismaService;
  let service: ControlOperationsService;
  const stationA = randomUUID();
  const stationB = randomUUID();
  const userId = randomUUID();
  const fuelId = randomUUID();
  const terminalId = randomUUID();
  const requestId = randomUUID();
  const operationId = randomUUID();
  const operationIdB = randomUUID();
  const code = randomUUID().slice(0, 8).toUpperCase();
  const allPermissions = Object.values(AdminControlPermission);
  const scoped = {
    kind: 'control' as const,
    userId,
    role: 'ENCARGADO',
    permissions: allPermissions,
    stationIds: [stationA],
    global: false,
  };

  beforeAll(async () => {
    const target = new URL(isolated!);
    if (target.protocol !== 'postgresql:' || target.pathname !== '/primax_control_test' || target.search || !(['127.0.0.1:26544', 'localhost:26544'].includes(target.host) || (target.host === 'postgres:5432' && process.env.APP_MODE === 'local')))
      throw new Error('CONTROL_TEST_DATABASE_URL must point to the dedicated local control database');
    process.env.DATABASE_URL = isolated;
    db = new PrismaService();
    await db.$connect();
    service = new ControlOperationsService(db, new InventoryReconciliationService(db));
    await db.user.create({ data: { id: userId, email: `ops-${userId}@primax.test`, name: 'Control Operations Test', passwordHash: 'not-used' } });
    await db.station.createMany({ data: [
      { id: stationA, code: `OPS-${code}-A`, name: 'Operations Station A', address: 'Local test' },
      { id: stationB, code: `OPS-${code}-B`, name: 'Operations Station B', address: 'Local test' },
    ] });
    await db.fuel.create({ data: { id: fuelId, code: `OPS-${code}`, name: 'Control Test Fuel', pricePerGallon: 15 } });
    await db.fuelInventory.create({ data: { stationId: stationA, fuelId, liters: new Prisma.Decimal(100) } });
    await db.fuelInventory.create({ data: { stationId: stationB, fuelId, liters: new Prisma.Decimal(40) } });
    await db.terminal.create({ data: { id: terminalId, stationId: stationA, code: `OPS-TERM-${code}`, operationalStatus: 'BLOQUEADA' } });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('limits inventory and terminal queries to assigned stations; global scope can select another station', async () => {
    expect((await service.inventory(scoped, stationA)).map((row) => row.stationId)).toEqual([stationA]);
    await expect(service.inventory(scoped, stationB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.terminals(scoped, stationB)).rejects.toBeInstanceOf(ForbiddenException);
    const global = { ...scoped, role: 'SUPER_ADMIN', stationIds: [], global: true };
    expect((await service.inventory(global, stationB)).map((row) => row.stationId)).toEqual([stationB]);
  });

  it('lists real operations and details while enforcing the station boundary', async () => {
    const transaction = (id: string, stationId: string) => ({
      operationId: id,
      requestHash: randomUUID().replaceAll('-', '').padEnd(64, 'a'),
      plate: 'ABC-123', stationId, fuelId, amount: '30.00', unitPrice: '15.00',
      pointsRate: '0.0100', pointsEarned: 0, mode: 'PREPAGO' as const,
    });
    await db.transaction.createMany({ data: [transaction(operationId, stationA), transaction(operationIdB, stationB)] });
    const rows = await service.operations(scoped, { stationId: stationA, mode: 'PREPAGO' });
    expect(rows.some((row) => row.operationId === operationId && row.station.id === stationA)).toBe(true);
    const detail = await service.operationDetail(scoped, operationId);
    expect(detail.transaction?.status).toBe('PAID');
    await expect(service.operations(scoped, { stationId: stationB })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.operationDetail(scoped, operationIdB)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('receives physical liters atomically, preserves reserved liters, records ledger and audit, and replays idempotently', async () => {
    const before = await db.fuelInventory.findUniqueOrThrow({ where: { stationId_fuelId: { stationId: stationA, fuelId } } });
    const input = { requestId, stationId: stationA, fuelId, liters: '25.500000', reference: 'recepción local' };
    const first = await service.receiveInventory(scoped, input);
    const second = await service.receiveInventory(scoped, input);
    const after = await db.fuelInventory.findUniqueOrThrow({ where: { stationId_fuelId: { stationId: stationA, fuelId } } });
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(typeof first.movement.sequence).toBe('string');
    expect(() => JSON.stringify(first)).not.toThrow();
    expect(after.liters.toString()).toBe('125.5');
    expect(after.reservedLiters.eq(before.reservedLiters)).toBe(true);
    expect(first.movement.kind).toBe('ADJUST_IN');
    expect(first.movement.actorId).toBe(userId);
    expect(await db.inventoryMovement.count({ where: { eventKey: `control-supply:${userId}:${requestId}` } })).toBe(1);
    expect(await db.operationalAuditEvent.count({ where: { targetId: first.movement.id, action: 'INVENTORY_SUPPLY_RECEIVED' } })).toBe(1);
    const ledger = await service.movements(scoped, { stationId: stationA, fuelId, kind: 'ADJUST_IN' });
    expect(ledger.some((movement) => movement.id === first.movement.id && movement.fuel.id === fuelId)).toBe(true);
    expect(typeof ledger[0].sequence).toBe('string');
    expect(() => JSON.stringify(ledger)).not.toThrow();
    await expect(service.receiveInventory(scoped, { ...input, liters: '26' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.receiveInventory(scoped, { ...input, requestId: randomUUID(), liters: '0' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('denies receipt without its grant and keeps movements append-only', async () => {
    const noReceive = { ...scoped, permissions: scoped.permissions.filter((permission) => permission !== 'ADMIN_INVENTORY_RECEIVE') };
    await expect(service.receiveInventory(noReceive, { requestId: randomUUID(), stationId: stationA, fuelId, liters: '1' })).rejects.toBeInstanceOf(ForbiddenException);
    const movement = await db.inventoryMovement.findFirstOrThrow({ where: { stationId: stationA, fuelId, kind: 'ADJUST_IN' } });
    await expect(db.inventoryMovement.update({ where: { id: movement.id }, data: { reason: 'tamper' } })).rejects.toThrow();
    await expect(db.inventoryMovement.delete({ where: { id: movement.id } })).rejects.toThrow();
  });

  it('scopes the audit ledger and permits only scoped terminal administration', async () => {
    const auditRows = await service.audit(scoped, { stationId: stationA, action: 'INVENTORY_SUPPLY_RECEIVED' });
    expect(auditRows.some((event) => event.action === 'INVENTORY_SUPPLY_RECEIVED')).toBe(true);
    await expect(service.audit(scoped, { stationId: stationB })).rejects.toBeInstanceOf(ForbiddenException);
    const updated = await service.terminalStatus(scoped, terminalId, 'OUT_OF_SERVICE');
    expect(updated.operationalStatus).toBe('FUERA_DE_SERVICIO');
    await expect(service.terminalStatus(scoped, terminalId, 'RESTORE').then(() => service.terminals(scoped, stationB))).rejects.toBeInstanceOf(ForbiddenException);
    const noManage = { ...scoped, permissions: scoped.permissions.filter((permission) => permission !== 'ADMIN_TERMINAL_MANAGE') };
    await expect(service.terminalStatus(noManage, terminalId, 'RESTORE')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
