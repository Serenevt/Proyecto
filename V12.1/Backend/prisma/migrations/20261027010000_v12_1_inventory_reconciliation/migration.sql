-- Fase 1B-3: local activation and conservative reconciliation of open legacy
-- authorizations. Nothing in this migration increases physical liters.
BEGIN;

LOCK TABLE "FuelAuthorization", "FuelInventory" IN SHARE ROW EXCLUSIVE MODE;

CREATE TYPE "InventoryActivationStatus" AS ENUM ('LEGACY', 'REVIEW', 'RECONCILED', 'REQUIRED');
CREATE TABLE "InventoryActivation" (
 "stationId" UUID NOT NULL,
 "fuelId" UUID NOT NULL,
 "status" "InventoryActivationStatus" NOT NULL DEFAULT 'LEGACY',
 "reason" VARCHAR(200),
 "reconciledAt" TIMESTAMPTZ(3),
 "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 CONSTRAINT "InventoryActivation_pkey" PRIMARY KEY ("stationId", "fuelId"),
 CONSTRAINT "InventoryActivation_inventory_fkey" FOREIGN KEY ("stationId", "fuelId") REFERENCES "FuelInventory"("stationId", "fuelId") ON DELETE RESTRICT
);
CREATE INDEX "InventoryActivation_status_updated_idx" ON "InventoryActivation"("status", "updatedAt");

INSERT INTO "InventoryActivation" ("stationId", "fuelId", "status", "reason")
SELECT i."stationId", i."fuelId",
 CASE WHEN EXISTS (
   SELECT 1 FROM "FuelAuthorization" a
   WHERE a."stationId"=i."stationId" AND a."fuelId"=i."fuelId"
     AND a."status" IN ('RESERVED','DISPENSING','INTERVENTION_REQUIRED')
     AND NOT EXISTS (SELECT 1 FROM "InventoryReservation" r WHERE r."authorizationId"=a."id")
 ) THEN 'REVIEW'::"InventoryActivationStatus" ELSE 'LEGACY'::"InventoryActivationStatus" END,
 CASE WHEN EXISTS (
   SELECT 1 FROM "FuelAuthorization" a
   WHERE a."stationId"=i."stationId" AND a."fuelId"=i."fuelId"
     AND a."status" IN ('RESERVED','DISPENSING','INTERVENTION_REQUIRED')
     AND NOT EXISTS (SELECT 1 FROM "InventoryReservation" r WHERE r."authorizationId"=a."id")
 ) THEN 'Open legacy authorizations require reconciliation' ELSE NULL END
FROM "FuelInventory" i;

-- 1B-1 opened existing rows. A row added between 1B-1 and this migration may
-- already have movements; derive the pre-first-movement balance exactly.
INSERT INTO "InventoryMovement" (
 "eventKey","stationId","fuelId","sequence","kind","physicalDeltaLiters",
 "reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind","reason"
)
SELECT 'opening:'||i."stationId"::text||':'||i."fuelId"::text,
 i."stationId",i."fuelId",COALESCE(first_m."sequence"-1,1),'OPENING_BALANCE',
 COALESCE(first_m."litersAfter"-first_m."physicalDeltaLiters",i."liters"),
 COALESCE(first_m."reservedLitersAfter"-first_m."reservedDeltaLiters",i."reservedLiters"),
 COALESCE(first_m."litersAfter"-first_m."physicalDeltaLiters",i."liters"),
 COALESCE(first_m."reservedLitersAfter"-first_m."reservedDeltaLiters",i."reservedLiters"),
 'SYSTEM','Baseline reconstructed before first recorded movement'
FROM "FuelInventory" i
LEFT JOIN LATERAL (
 SELECT m.* FROM "InventoryMovement" m
 WHERE m."stationId"=i."stationId" AND m."fuelId"=i."fuelId"
 ORDER BY m."sequence" ASC LIMIT 1
) first_m ON true
WHERE NOT EXISTS (
 SELECT 1 FROM "InventoryMovement" opening
 WHERE opening."stationId"=i."stationId" AND opening."fuelId"=i."fuelId"
   AND opening."kind"='OPENING_BALANCE'
);
CREATE UNIQUE INDEX "InventoryMovement_oneOpeningBalance"
 ON "InventoryMovement"("stationId","fuelId") WHERE "kind"='OPENING_BALANCE';

CREATE FUNCTION inventory_initialize_pair() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "InventoryActivation"("stationId","fuelId","status")
 VALUES (NEW."stationId",NEW."fuelId",'LEGACY');
 INSERT INTO "InventoryMovement"(
  "eventKey","stationId","fuelId","sequence","kind","physicalDeltaLiters",
  "reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind","reason"
 ) VALUES (
  'opening:'||NEW."stationId"::text||':'||NEW."fuelId"::text,
  NEW."stationId",NEW."fuelId",1,'OPENING_BALANCE',NEW."liters",
  NEW."reservedLiters",NEW."liters",NEW."reservedLiters",'SYSTEM',
  'Baseline at inventory creation'
 );
 RETURN NEW;
END $$;
CREATE TRIGGER "FuelInventory_initialize_pair" AFTER INSERT ON "FuelInventory"
 FOR EACH ROW EXECUTE FUNCTION inventory_initialize_pair();
REVOKE EXECUTE ON FUNCTION inventory_initialize_pair() FROM PUBLIC;

-- The old SQL primitive remains unchanged. Rename it and put a narrow gate
-- in front so REVIEW pairs cannot accept new authorizations while old open
-- commitments are unresolved. The original remains owner-only.
ALTER FUNCTION inventory_create_reservation(UUID, UUID, UUID, "InventoryReservationSource", NUMERIC, CHAR, UUID, UUID, UUID)
 RENAME TO inventory_create_reservation_unchecked;
CREATE FUNCTION inventory_create_reservation(
 p_operation_id UUID, p_station_id UUID, p_fuel_id UUID,
 p_source "InventoryReservationSource", p_max_gallons NUMERIC,
 p_request_hash CHAR(64), p_authorization_id UUID DEFAULT NULL,
 p_terminal_operation_id UUID DEFAULT NULL, p_transaction_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE pair_status "InventoryActivationStatus";
BEGIN
 SELECT "status" INTO pair_status FROM "InventoryActivation"
 WHERE "stationId"=p_station_id AND "fuelId"=p_fuel_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inventario sin estado de activación'; END IF;
 IF pair_status='REVIEW' THEN RAISE EXCEPTION 'Inventario en revisión; nuevas reservas bloqueadas'; END IF;
 RETURN inventory_create_reservation_unchecked(
  p_operation_id,p_station_id,p_fuel_id,p_source,p_max_gallons,
  p_request_hash,p_authorization_id,p_terminal_operation_id,p_transaction_id
 );
END $$;
REVOKE EXECUTE ON FUNCTION inventory_create_reservation(UUID, UUID, UUID, "InventoryReservationSource", NUMERIC, CHAR, UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION inventory_create_reservation_unchecked(UUID, UUID, UUID, "InventoryReservationSource", NUMERIC, CHAR, UUID, UUID, UUID) FROM PUBLIC;

-- In REQUIRED pairs an old unreserved authorization must not bypass the
-- reservation path. This runs before v11_debit_fuel alphabetically.
CREATE FUNCTION inventory_require_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."dispensedGallons">OLD."dispensedGallons" AND NOT EXISTS (
  SELECT 1 FROM "InventoryReservation" r WHERE r."authorizationId"=NEW."id"
 ) AND EXISTS (
  SELECT 1 FROM "InventoryActivation" a
  WHERE a."stationId"=NEW."stationId" AND a."fuelId"=NEW."fuelId"
    AND a."status"='REQUIRED'
 ) THEN RAISE EXCEPTION 'Reserva obligatoria para despacho'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_require_reservation BEFORE UPDATE OF "dispensedGallons" ON "FuelAuthorization"
 FOR EACH ROW EXECUTE FUNCTION inventory_require_reservation();
REVOKE EXECUTE ON FUNCTION inventory_require_reservation() FROM PUBLIC;

CREATE FUNCTION inventory_mark_pair_review(p_station_id UUID,p_fuel_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 UPDATE "InventoryActivation" SET "status"='REVIEW',"reason"=left(p_reason,200),
  "reconciledAt"=NULL,"updatedAt"=now()
 WHERE "stationId"=p_station_id AND "fuelId"=p_fuel_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inventario sin estado de activación'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION inventory_mark_pair_review(UUID,UUID,TEXT) FROM PUBLIC;

-- Rebuild only a commitment that can be proved from every legacy progress
-- movement starting at zero. Previously dispensed liters stay debited.
CREATE FUNCTION inventory_backfill_legacy(p_authorization_id UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
 a "FuelAuthorization"%ROWTYPE;
 existing_id UUID;
 rid UUID := gen_random_uuid();
 m "InventoryMovement"%ROWTYPE;
 inv "FuelInventory"%ROWTYPE;
 parts TEXT[];
 previous_gallons NUMERIC := 0;
 old_gallons NUMERIC;
 new_gallons NUMERIC;
 consumed NUMERIC := 0;
 max_gallons NUMERIC;
 initial_liters NUMERIC;
 remaining_liters NUMERIC;
BEGIN
 SELECT * INTO a FROM "FuelAuthorization" WHERE "id"=p_authorization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Autorización legacy no encontrada'; END IF;
 SELECT "id" INTO existing_id FROM "InventoryReservation" WHERE "authorizationId"=a."id";
 IF FOUND THEN RETURN existing_id; END IF;
 IF a."status" NOT IN ('RESERVED','DISPENSING') OR a."inventoryManaged" OR
    a."unitPrice" IS NULL OR a."unitPrice"<=0 OR a."authorizedAmount"<=0 OR
    EXISTS(SELECT 1 FROM "Transaction" t WHERE t."authorizationId"=a."id") THEN
  PERFORM inventory_mark_pair_review(a."stationId",a."fuelId",'Legacy authorization lacks a safe open context');
  RETURN NULL;
 END IF;
 max_gallons := ROUND(a."authorizedAmount"/a."unitPrice",3);
 IF max_gallons<=0 OR a."dispensedGallons">max_gallons THEN
  PERFORM inventory_mark_pair_review(a."stationId",a."fuelId",'Legacy maximum volume is inconsistent');
  RETURN NULL;
 END IF;
 FOR m IN
  SELECT * FROM "InventoryMovement"
  WHERE "authorizationId"=a."id" AND "kind" IN ('LEGACY_DISPENSE','DISPENSE')
  ORDER BY "sequence"
 LOOP
  parts := regexp_match(m."eventKey",'^progress:[0-9a-f-]{36}:([0-9]+[.][0-9]+):([0-9]+[.][0-9]+)$');
  IF m."kind"<>'LEGACY_DISPENSE' OR parts IS NULL THEN
   PERFORM inventory_mark_pair_review(a."stationId",a."fuelId",'Legacy progress ledger cannot be verified');
   RETURN NULL;
  END IF;
  old_gallons := parts[1]::NUMERIC;
  new_gallons := parts[2]::NUMERIC;
  IF old_gallons<>previous_gallons OR new_gallons<=old_gallons OR
     m."physicalDeltaLiters"<>-ROUND((new_gallons-old_gallons)*3.785411784::NUMERIC,6) OR
     m."reservedDeltaLiters"<>0 OR m."stationId"<>a."stationId" OR m."fuelId"<>a."fuelId" THEN
   PERFORM inventory_mark_pair_review(a."stationId",a."fuelId",'Legacy progress ledger is incomplete or inconsistent');
   RETURN NULL;
  END IF;
  consumed := consumed-m."physicalDeltaLiters";
  previous_gallons := new_gallons;
 END LOOP;
 IF previous_gallons<>a."dispensedGallons" THEN
  PERFORM inventory_mark_pair_review(a."stationId",a."fuelId",'Legacy physical progress predates the ledger or is incomplete');
  RETURN NULL;
 END IF;
 initial_liters := inventory_safe_liter_bound(max_gallons);
 remaining_liters := initial_liters-consumed;
 IF remaining_liters<0 THEN
  PERFORM inventory_mark_pair_review(a."stationId",a."fuelId",'Legacy consumption exceeds safe bound');
  RETURN NULL;
 END IF;
 UPDATE "FuelInventory" SET "reservedLiters"="reservedLiters"+remaining_liters,
  "updatedAt"=now()
 WHERE "stationId"=a."stationId" AND "fuelId"=a."fuelId"
   AND "liters"-"reservedLiters">=remaining_liters
 RETURNING * INTO inv;
 IF NOT FOUND THEN
  PERFORM inventory_mark_pair_review(a."stationId",a."fuelId",'Insufficient available stock for legacy commitment');
  RETURN NULL;
 END IF;
 INSERT INTO "InventoryReservation"(
  "id","operationId","terminalOperationId","authorizationId","stationId","fuelId",
  "source","status","maxGallons","initialLiters","remainingLiters",
  "consumedLiters","releasedLiters","requestHash","actorKind"
 ) VALUES (
  rid,a."operationId",a."terminalOperationId",a."id",a."stationId",a."fuelId",
  'LEGACY','ACTIVE',max_gallons,initial_liters,remaining_liters,
  consumed,0,a."requestHash",'SYSTEM'
 );
 INSERT INTO "InventoryMovement"(
  "eventKey","stationId","fuelId","sequence","reservationId","authorizationId",
  "terminalOperationId","kind","physicalDeltaLiters","reservedDeltaLiters",
  "litersAfter","reservedLitersAfter","actorKind","reason"
 ) SELECT
  'legacy-backfill:'||a."id"::text,a."stationId",a."fuelId",
  COALESCE(MAX("sequence"),0)+1,rid,a."id",a."terminalOperationId",
  'RESERVE',0,remaining_liters,inv."liters",inv."reservedLiters",'SYSTEM',
  'Open legacy commitment reconstructed from complete progress ledger'
 FROM "InventoryMovement" WHERE "stationId"=a."stationId" AND "fuelId"=a."fuelId";
 UPDATE "FuelAuthorization" SET "inventoryManaged"=true,"updatedAt"=now()
 WHERE "id"=a."id";
 RETURN rid;
END $$;
REVOKE EXECUTE ON FUNCTION inventory_backfill_legacy(UUID) FROM PUBLIC;

COMMIT;
