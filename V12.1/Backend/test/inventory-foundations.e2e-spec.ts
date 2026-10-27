import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const enabled = Boolean(process.env.INVENTORY_TEST_DATABASE_URL);
const suite = enabled ? describe : describe.skip;
const db = new PrismaClient();

suite('Fase 1B-1: inventory reservation and ledger on PostgreSQL', () => {
  beforeAll(() => {
    const url = new URL(process.env.INVENTORY_TEST_DATABASE_URL!);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      !(url.hostname === 'postgres' && process.env.APP_MODE === 'local')
    )
      throw new Error(
        'INVENTORY_TEST_DATABASE_URL debe apuntar a PostgreSQL local.',
      );
    process.env.DATABASE_URL = url.toString();
  });
  afterAll(async () => db.$disconnect());

  it('validates accounting, exact rounding, atomic progress and legacy isolation', async () => {
    const rollback = new Error('ROLLBACK_INVENTORY_TEST');
    try {
      await db.$transaction(
        async (tx) => {
          const sid = randomUUID();
          const fid = randomUUID();
          const sid2 = randomUUID();
          const fid2 = randomUUID();
          const userId = randomUUID();
          const memberId = randomUUID();
          const authId = randomUUID();
          const operationId = randomUUID();
          const legacyId = randomUUID();
          const legacyOperationId = randomUUID();
          const hash = 'a'.repeat(64);
          await tx.$executeRaw`INSERT INTO "Station"("id","code","name","address","createdAt","updatedAt") VALUES (${sid}::uuid,${'TS-' + sid.slice(0, 8)},'Test','Local',now(),now()),(${sid2}::uuid,${'TS-' + sid2.slice(0, 8)},'Test2','Local',now(),now())`;
          await tx.$executeRaw`INSERT INTO "Fuel"("id","code","name","pricePerGallon","createdAt","updatedAt") VALUES (${fid}::uuid,${'TF-' + fid.slice(0, 8)},'Test',10,now(),now()),(${fid2}::uuid,${'TF-' + fid2.slice(0, 8)},'Test2',10,now(),now())`;
          await tx.$executeRaw`INSERT INTO "FuelInventory"("stationId","fuelId","liters") VALUES (${sid}::uuid,${fid}::uuid,100),(${sid2}::uuid,${fid}::uuid,100),(${sid}::uuid,${fid2}::uuid,100)`;
          await tx.$executeRaw`INSERT INTO "User"("id","email","name","passwordHash","createdAt","updatedAt") VALUES (${userId}::uuid,${userId + '@test.invalid'},'Test','hash',now(),now())`;
          await tx.$executeRaw`INSERT INTO "Membership"("id","number","userId","createdAt","updatedAt") VALUES (${memberId}::uuid,${'M-' + memberId.slice(0, 8)},${userId}::uuid,now(),now())`;
          const insertAuthorization = async (
            id: string,
            op: string,
          ) => tx.$executeRaw`
          INSERT INTO "FuelAuthorization"("id","operationId","requestHash","membershipId","plate","stationId","fuelId","authorizedAmount","reservedAmount","balanceAfter","dispensedAmount","dispensedGallons","mode","status","createdAt","updatedAt")
          VALUES (${id}::uuid,${op}::uuid,${hash},${memberId}::uuid,'ABC-123',${sid}::uuid,${fid}::uuid,100,100,100,0,0,'POSTPAGO','DISPENSING',now(),now())`;
          await insertAuthorization(authId, operationId);
          const reserve = async (
            id: string,
            op: string,
            gallons: number,
          ) => tx.$queryRaw<Array<{ id: string }>>`
          SELECT inventory_create_reservation(${op}::uuid,${sid}::uuid,${fid}::uuid,'TERMINAL'::"InventoryReservationSource",${gallons}::numeric,${hash}::char(64),${id}::uuid)`;
          const bound = await tx.$queryRaw<
            Array<{ bound: string }>
          >`SELECT trim_scale(inventory_safe_liter_bound(1::numeric))::text AS bound`;
          expect(bound[0].bound).toBe('3.785912');
          const conversion = await tx.$queryRaw<
            Array<{ liters: string }>
          >`SELECT trim_scale(inventory_gallons_to_liters(0.001::numeric))::text AS liters`;
          expect(conversion[0].liters).toBe('0.003785');
          const rounding = await tx.$queryRaw<
            Array<{ total_once: string; incremental: string }>
          >`
          SELECT trim_scale(round(0.006::numeric*3.785411784::numeric,6))::text total_once,
          trim_scale(3*round(0.002::numeric*3.785411784::numeric,6))::text incremental`;
          expect(rounding[0]).toEqual({
            total_once: '0.022712',
            incremental: '0.022713',
          });
          const steps = await tx.$queryRaw<Array<{ incremental: string }>>`
          SELECT trim_scale(sum(round(0.001::numeric*3.785411784::numeric,6)))::text incremental FROM generate_series(1,1000)`;
          expect(steps[0].incremental).toBe('3.785');
          const created = await reserve(authId, operationId, 1);
          const reservationId = (created[0] as any)
            .inventory_create_reservation;
          let inv = await tx.$queryRaw<
            Array<{ liters: string; reservedLiters: string }>
          >`SELECT liters::text,"reservedLiters"::text FROM "FuelInventory" WHERE "stationId"=${sid}::uuid AND "fuelId"=${fid}::uuid`;
          expect(inv[0].liters).toBe('100.000000');
          expect(inv[0].reservedLiters).toBe('3.785912');
          expect(
            Number(inv[0].liters) - Number(inv[0].reservedLiters),
          ).toBeCloseTo(96.214088);
          await tx.$executeRaw`UPDATE "FuelAuthorization" SET "dispensedGallons"=1 WHERE "id"=${authId}::uuid`;
          inv =
            await tx.$queryRaw`SELECT liters::text,"reservedLiters"::text FROM "FuelInventory" WHERE "stationId"=${sid}::uuid AND "fuelId"=${fid}::uuid`;
          expect(inv[0].liters).toBe('96.214588');
          expect(inv[0].reservedLiters).toBe('0.000500');
          const count1 = await tx.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) count FROM "InventoryMovement" WHERE "authorizationId"=${authId}::uuid AND "kind"='DISPENSE'`;
          expect(Number(count1[0].count)).toBe(1);
          await tx.$executeRaw`UPDATE "FuelAuthorization" SET "dispensedGallons"=1 WHERE "id"=${authId}::uuid`;
          const count2 = await tx.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) count FROM "InventoryMovement" WHERE "authorizationId"=${authId}::uuid`;
          expect(Number(count2[0].count)).toBe(2);
          await tx.$executeRaw`SAVEPOINT lower_progress`;
          await expect(
            tx.$executeRaw`UPDATE "FuelAuthorization" SET "dispensedGallons"=0.5 WHERE "id"=${authId}::uuid`,
          ).rejects.toThrow();
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT lower_progress');
          await tx.$executeRaw`SELECT inventory_release_reservation(${reservationId}::uuid,0.000500::numeric,${'release:' + authId},NULL,'Round-off remainder')`;
          const closed = await tx.$queryRaw<
            Array<{ remainingLiters: string; releasedLiters: string }>
          >`SELECT "remainingLiters"::text,"releasedLiters"::text FROM "InventoryReservation" WHERE id=${reservationId}::uuid`;
          expect(closed[0]).toEqual({
            remainingLiters: '0.000000',
            releasedLiters: '0.000500',
          });
          await tx.$executeRaw`SAVEPOINT immutable_update`;
          await expect(
            tx.$executeRaw`UPDATE "InventoryMovement" SET reason='tamper' WHERE "eventKey"=${'reservation:' + reservationId}`,
          ).rejects.toThrow();
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT immutable_update');
          await tx.$executeRaw`SAVEPOINT immutable_delete`;
          await expect(
            tx.$executeRaw`DELETE FROM "InventoryMovement" WHERE "eventKey"=${'reservation:' + reservationId}`,
          ).rejects.toThrow();
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT immutable_delete');
          await tx.$executeRaw`SAVEPOINT duplicate_reservation`;
          await expect(reserve(authId, operationId, 1)).rejects.toThrow();
          await tx.$executeRawUnsafe(
            'ROLLBACK TO SAVEPOINT duplicate_reservation',
          );
          await tx.$executeRaw`SAVEPOINT duplicate_event`;
          await expect(
            tx.$executeRaw`INSERT INTO "InventoryMovement"("eventKey","stationId","fuelId","sequence","kind","physicalDeltaLiters","reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind") SELECT "eventKey", "stationId","fuelId",999,'ADJUST_IN',0,0,"liters","reservedLiters",'SYSTEM' FROM "FuelInventory" WHERE "stationId"=${sid}::uuid AND "fuelId"=${fid}::uuid`,
          ).rejects.toThrow();
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT duplicate_event');
          await tx.$executeRaw`SAVEPOINT duplicate_sequence`;
          await expect(
            tx.$executeRaw`INSERT INTO "InventoryMovement"("eventKey","stationId","fuelId","sequence","kind","physicalDeltaLiters","reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind") SELECT ${'other:' + sid},"stationId","fuelId",1,'ADJUST_IN',0,0,"liters","reservedLiters",'SYSTEM' FROM "FuelInventory" WHERE "stationId"=${sid}::uuid AND "fuelId"=${fid}::uuid`,
          ).rejects.toThrow();
          await tx.$executeRawUnsafe(
            'ROLLBACK TO SAVEPOINT duplicate_sequence',
          );
          await tx.$executeRaw`SAVEPOINT inventory_check`;
          await expect(
            tx.$executeRaw`UPDATE "FuelInventory" SET "reservedLiters"=999 WHERE "stationId"=${sid}::uuid AND "fuelId"=${fid}::uuid`,
          ).rejects.toThrow();
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT inventory_check');
          await tx.$executeRaw`SAVEPOINT invalid_balance`;
          await expect(
            tx.$executeRaw`INSERT INTO "InventoryReservation"("operationId","stationId","fuelId","source","status","maxGallons","initialLiters","remainingLiters","consumedLiters","releasedLiters","requestHash") VALUES (${randomUUID()}::uuid,${sid}::uuid,${fid}::uuid,'TERMINAL','ACTIVE',1,1,0.5,0,0,${hash})`,
          ).rejects.toThrow();
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT invalid_balance');

          // A movement insertion failure must roll back both progress and stock.
          const rollbackAuthId = randomUUID();
          await insertAuthorization(rollbackAuthId, randomUUID());
          const beforeRollback = await tx.$queryRaw<
            Array<{ liters: string }>
          >`SELECT "liters"::text FROM "FuelInventory" WHERE "stationId"=${sid}::uuid AND "fuelId"=${fid}::uuid`;
          await tx.$executeRaw`
            INSERT INTO "InventoryMovement"("eventKey","stationId","fuelId","sequence","kind","physicalDeltaLiters","reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind")
            SELECT ${'progress:' + rollbackAuthId + ':0.000:1.000'},"stationId","fuelId",COALESCE((SELECT max("sequence")+1 FROM "InventoryMovement" WHERE "stationId"=${sid}::uuid AND "fuelId"=${fid}::uuid),1),'ADJUST_IN',0,0,"liters","reservedLiters",'SYSTEM'
            FROM "FuelInventory" WHERE "stationId"=${sid}::uuid AND "fuelId"=${fid}::uuid`;
          await tx.$executeRaw`SAVEPOINT movement_insert_rollback`;
          await expect(
            tx.$executeRaw`UPDATE "FuelAuthorization" SET "dispensedGallons"=1 WHERE "id"=${rollbackAuthId}::uuid`,
          ).rejects.toThrow();
          await tx.$executeRawUnsafe(
            'ROLLBACK TO SAVEPOINT movement_insert_rollback',
          );
          const afterRollback = await tx.$queryRaw<
            Array<{ liters: string; dispensedGallons: string }>
          >`SELECT i."liters"::text,a."dispensedGallons"::text FROM "FuelInventory" i JOIN "FuelAuthorization" a ON a."id"=${rollbackAuthId}::uuid WHERE i."stationId"=${sid}::uuid AND i."fuelId"=${fid}::uuid`;
          expect(afterRollback[0].liters).toBe(beforeRollback[0].liters);
          expect(afterRollback[0].dispensedGallons).toBe('0.000');

          // A legacy authorization has no reservation: it can consume available stock only.
          const heldId = randomUUID();
          const heldOperationId = randomUUID();
          await insertAuthorization(heldId, heldOperationId);
          await reserve(heldId, heldOperationId, 20);
          await tx.$executeRaw`INSERT INTO "FuelAuthorization"("id","operationId","requestHash","membershipId","plate","stationId","fuelId","authorizedAmount","reservedAmount","balanceAfter","dispensedAmount","dispensedGallons","mode","status","createdAt","updatedAt") VALUES (${legacyId}::uuid,${legacyOperationId}::uuid,${hash},${memberId}::uuid,'ABC-123',${sid}::uuid,${fid}::uuid,100,100,100,0,0,'POSTPAGO','DISPENSING',now(),now())`;
          await tx.$executeRaw`SAVEPOINT legacy_reserved_stock`;
          await expect(
            tx.$executeRaw`UPDATE "FuelAuthorization" SET "dispensedGallons"=30 WHERE "id"=${legacyId}::uuid`,
          ).rejects.toThrow();
          await tx.$executeRawUnsafe(
            'ROLLBACK TO SAVEPOINT legacy_reserved_stock',
          );
          await tx.$executeRaw`UPDATE "FuelAuthorization" SET "dispensedGallons"=1 WHERE "id"=${legacyId}::uuid`;
          const legacyMovement = await tx.$queryRaw<
            Array<{ kind: string }>
          >`SELECT kind::text FROM "InventoryMovement" WHERE "authorizationId"=${legacyId}::uuid`;
          expect(legacyMovement[0].kind).toBe('LEGACY_DISPENSE');
          // Different station/fuel inventory rows are independent and each debits once.
          for (const [s, f] of [
            [sid2, fid],
            [sid, fid2],
          ]) {
            const legacy = randomUUID();
            await tx.$executeRaw`INSERT INTO "FuelAuthorization"("id","operationId","requestHash","membershipId","plate","stationId","fuelId","authorizedAmount","reservedAmount","balanceAfter","dispensedAmount","dispensedGallons","mode","status","createdAt","updatedAt") VALUES (${legacy}::uuid,${randomUUID()}::uuid,${hash},${memberId}::uuid,'ABC-123',${s}::uuid,${f}::uuid,100,100,100,0,0,'POSTPAGO','DISPENSING',now(),now())`;
            await tx.$executeRaw`UPDATE "FuelAuthorization" SET "dispensedGallons"=0.001 WHERE "id"=${legacy}::uuid`;
          }
          // Validate inventory state did not leak from the rolled-back test transaction.
          throw rollback;
        },
        { timeout: 60000 },
      );
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });

  it('serializes updates per inventory row without blocking a different inventory', async () => {
    const stationA = randomUUID();
    const stationB = randomUUID();
    const fuel = randomUUID();
    await db.$executeRaw`INSERT INTO "Station"("id","code","name","address","createdAt","updatedAt") VALUES (${stationA}::uuid,${'LK-' + stationA.slice(0, 8)},'Lock A','Local',now(),now()),(${stationB}::uuid,${'LK-' + stationB.slice(0, 8)},'Lock B','Local',now(),now())`;
    await db.$executeRaw`INSERT INTO "Fuel"("id","code","name","pricePerGallon","createdAt","updatedAt") VALUES (${fuel}::uuid,${'LF-' + fuel.slice(0, 8)},'Lock fuel',10,now(),now())`;
    await db.$executeRaw`INSERT INTO "FuelInventory"("stationId","fuelId","liters") VALUES (${stationA}::uuid,${fuel}::uuid,10),(${stationB}::uuid,${fuel}::uuid,10)`;
    let signalLocked!: () => void;
    let signalRelease!: () => void;
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    const release = new Promise<void>((resolve) => (signalRelease = resolve));
    const first = db.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE "FuelInventory" SET "reservedLiters"=1 WHERE "stationId"=${stationA}::uuid AND "fuelId"=${fuel}::uuid`;
      signalLocked();
      await release;
    });
    await locked;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        db.$executeRaw`UPDATE "FuelInventory" SET "reservedLiters"=1 WHERE "stationId"=${stationB}::uuid AND "fuelId"=${fuel}::uuid`,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  'Inventarios independientes quedaron bloqueados entre sí',
                ),
              ),
            2000,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      signalRelease();
      await first;
    }
  }, 10000);
});
