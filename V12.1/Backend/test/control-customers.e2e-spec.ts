import { randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminControlPermission } from '@prisma/client';
import { ControlCustomersService } from '../src/control/control-customers.service';
import { PrismaService } from '../src/prisma/prisma.service';

const isolated = process.env.CONTROL_TEST_DATABASE_URL;
const suite = isolated ? describe : describe.skip;

suite('Primax Control customers, memberships, vehicles and receipts on isolated PostgreSQL', () => {
  let db: PrismaService;
  let service: ControlCustomersService;
  const stationA = randomUUID();
  const stationB = randomUUID();
  const fuelId = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const membershipA = randomUUID();
  const membershipB = randomUUID();
  const vehicleA = randomUUID();
  const vehicleB = randomUUID();
  const vehicleOther = randomUUID();
  const transactionA = randomUUID();
  const transactionB = randomUUID();
  const transactionOther = randomUUID();
  const tag = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  const permissions = Object.values(AdminControlPermission);
  const scoped = {
    kind: 'control' as const,
    userId: userA,
    role: 'ENCARGADO',
    permissions,
    stationIds: [stationA],
    global: false,
  };

  const transaction = (id: string, stationId: string, membershipId: string, vehicleId: string, plate: string, paymentStatus: 'CAPTURED' | 'PENDING') => ({
    operationId: randomUUID(),
    requestHash: randomUUID().replaceAll('-', '').padEnd(64, 'a'),
    plate,
    vehicleId,
    membershipId,
    stationId,
    fuelId,
    amount: '24.00',
    unitPrice: '16.00',
    gallons: '1.500',
    pointsRate: '0.0100',
    pointsEarned: 0,
    mode: 'PREPAGO' as const,
    receiptType: 'BOLETA' as const,
    receiptDni: '12345678',
    payment: { create: { amount: '24.00', method: 'YAPE' as const, status: paymentStatus } },
    id,
  });

  beforeAll(async () => {
    const target = new URL(isolated!);
    if (target.protocol !== 'postgresql:' || target.pathname !== '/primax_control_test' || target.search || !['127.0.0.1:26544', 'localhost:26544'].includes(target.host))
      throw new Error('CONTROL_TEST_DATABASE_URL must point to the dedicated local control database');
    process.env.DATABASE_URL = isolated;
    db = new PrismaService();
    await db.$connect();
    service = new ControlCustomersService(db);
    await db.user.createMany({ data: [
      { id: userA, email: `client-a-${tag.toLowerCase()}@primax.test`, name: 'Client A', passwordHash: 'not-used' },
      { id: userB, email: `client-b-${tag.toLowerCase()}@primax.test`, name: 'Client B', passwordHash: 'not-used' },
    ] });
    await db.station.createMany({ data: [
      { id: stationA, code: `CUST-${tag}-A`, name: 'Customer Station A', address: 'Local test' },
      { id: stationB, code: `CUST-${tag}-B`, name: 'Customer Station B', address: 'Local test' },
    ] });
    await db.fuel.create({ data: { id: fuelId, code: `CUST-${tag}`, name: 'Customer Test Fuel', pricePerGallon: '16.00' } });
    await db.membership.createMany({ data: [
      { id: membershipA, userId: userA, number: `PRIM${tag}A`, balance: '180.00' },
      { id: membershipB, userId: userB, number: `PRIM${tag}B`, balance: '80.00' },
    ] });
    await db.vehicle.createMany({ data: [
      { id: vehicleA, membershipId: membershipA, plate: `A${tag.slice(0, 2)}-101`, label: 'Sedán azul' },
      { id: vehicleB, membershipId: membershipA, plate: `B${tag.slice(0, 2)}-202`, label: 'SUV blanca' },
      { id: vehicleOther, membershipId: membershipB, plate: `C${tag.slice(0, 2)}-303`, label: 'Camioneta' },
    ] });
    await db.transaction.create({ data: transaction(transactionA, stationA, membershipA, vehicleA, `A${tag.slice(0, 2)}-101`, 'CAPTURED') });
    await db.transaction.create({ data: transaction(transactionB, stationB, membershipA, vehicleB, `B${tag.slice(0, 2)}-202`, 'PENDING') });
    await db.transaction.create({ data: transaction(transactionOther, stationB, membershipB, vehicleOther, `C${tag.slice(0, 2)}-303`, 'CAPTURED') });
  });

  afterAll(async () => {
    if (!db) return;
    await db.payment.deleteMany({ where: { transactionId: { in: [transactionA, transactionB, transactionOther] } } });
    await db.transaction.deleteMany({ where: { id: { in: [transactionA, transactionB, transactionOther] } } });
    await db.vehicle.deleteMany({ where: { id: { in: [vehicleA, vehicleB, vehicleOther] } } });
    await db.membership.deleteMany({ where: { id: { in: [membershipA, membershipB] } } });
    await db.fuel.deleteMany({ where: { id: fuelId } });
    await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await db.station.deleteMany({ where: { id: { in: [stationA, stationB] } } });
    await db.$disconnect();
  });

  it('returns customers and their station-linked history only inside the assigned scope', async () => {
    const rows = await service.customers(scoped, { stationId: stationA });
    expect(rows.map((row) => row.id)).toEqual([userA]);
    expect(rows[0].email).not.toContain('@primax.test');
    expect(rows[0].membership?.balance).toBeUndefined();
    expect(rows[0].vehicles.map((vehicle) => vehicle.id)).toEqual([vehicleA]);
    const detail = await service.customer(scoped, userA);
    expect(detail.operations.map((operation) => operation.station.id)).toEqual([stationA]);
    expect(detail.vehicles.map((vehicle) => vehicle.id)).toEqual([vehicleA]);
    await expect(service.customers(scoped, { stationId: stationB })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.customer(scoped, userB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.customer({ ...scoped, permissions: [] }, userA)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('shows memberships and vehicles with real state but no cross-station data to ENCARGADO', async () => {
    const members = await service.memberships(scoped, { stationId: stationA });
    expect(members.map((row) => row.id)).toEqual([membershipA]);
    expect(members[0].balance).toBeUndefined();
    expect(members[0].customer.email).not.toContain('@primax.test');
    const vehicles = await service.vehicles(scoped, { stationId: stationA });
    expect(vehicles.map((row) => row.id)).toEqual([vehicleA]);
    expect(vehicles[0].status).toBe('REGISTERED');
    await expect(service.memberships({ ...scoped, permissions: [] }, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists financial and physical states separately and scopes transaction details', async () => {
    const rows = await service.transactions(scoped, { stationId: stationA });
    expect(rows).toHaveLength(1);
    expect(rows[0].financialStatus).toBe('CAPTURED');
    expect(rows[0].physicalStatus).toBe('PAID');
    const detail = await service.transaction(scoped, transactionA);
    expect(detail.method).toBe('YAPE');
    await expect(service.transaction(scoped, transactionB)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('builds an academic receipt from a real captured transaction without changing financial state', async () => {
    const receipt = await service.receipt(scoped, transactionA);
    expect(receipt.demo).toBe(true);
    expect(receipt.total).toBe('24.00');
    expect(receipt.state).toBe('Pagado');
    expect(receipt.dni).toBe('12345678');
    const payment = await db.payment.findUniqueOrThrow({ where: { transactionId: transactionA } });
    expect(payment.status).toBe('CAPTURED');
    await expect(service.receipt({ ...scoped, permissions: scoped.permissions.filter((p) => p !== 'ADMIN_RECEIPT_VIEW') }, transactionA)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a global administrator to see both stations and the actual membership balance', async () => {
    const global = { ...scoped, role: 'SUPER_ADMIN', stationIds: [], global: true };
    const customers = await service.customers(global, {});
    expect(customers.map((row) => row.id)).toEqual(expect.arrayContaining([userA, userB]));
    expect(customers.find((row) => row.id === userA)?.email).toContain('@primax.test');
    expect(customers.find((row) => row.id === userA)?.membership?.balance).toBe('180.00');
    expect((await service.membership(global, membershipA)).balance).toBe('180.00');
    const detail = await service.customer(global, userA);
    expect(detail.vehicles).toHaveLength(2);
    expect(detail.operations).toHaveLength(2);
  });
});
