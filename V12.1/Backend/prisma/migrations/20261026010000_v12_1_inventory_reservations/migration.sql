-- 1B-1: reservation accounting and immutable inventory evidence.
ALTER TABLE "FuelInventory"
  ADD COLUMN "reservedLiters" DECIMAL(14,6) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "FuelInventory_reserved_nonnegative_check" CHECK ("reservedLiters" >= 0),
  ADD CONSTRAINT "FuelInventory_reserved_lte_liters_check" CHECK ("reservedLiters" <= "liters");

CREATE TYPE "InventoryReservationSource" AS ENUM ('TERMINAL', 'LEGACY');
CREATE TYPE "InventoryReservationStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'REVIEW', 'CLOSED', 'CANCELLED');
CREATE TYPE "InventoryMovementKind" AS ENUM ('OPENING_BALANCE', 'RESERVE', 'DISPENSE', 'LEGACY_DISPENSE', 'RELEASE', 'ADJUST_IN', 'ADJUST_OUT');
CREATE TYPE "InventoryActorKind" AS ENUM ('SYSTEM', 'USER', 'TERMINAL', 'LEGACY_KIOSK');

CREATE TABLE "InventoryReservation" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "operationId" UUID NOT NULL UNIQUE,
 "terminalOperationId" UUID UNIQUE,
 "authorizationId" UUID UNIQUE REFERENCES "FuelAuthorization"("id") ON DELETE RESTRICT,
 "transactionId" UUID UNIQUE REFERENCES "Transaction"("id") ON DELETE RESTRICT,
 "stationId" UUID NOT NULL,
 "fuelId" UUID NOT NULL,
 "source" "InventoryReservationSource" NOT NULL,
 "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
 "maxGallons" DECIMAL(12,3) NOT NULL CHECK ("maxGallons" > 0),
 "initialLiters" DECIMAL(14,6) NOT NULL,
 "remainingLiters" DECIMAL(14,6) NOT NULL,
 "consumedLiters" DECIMAL(14,6) NOT NULL DEFAULT 0,
 "releasedLiters" DECIMAL(14,6) NOT NULL DEFAULT 0,
 "requestHash" CHAR(64) NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
 "reviewReason" VARCHAR(200),
 "actorKind" "InventoryActorKind" NOT NULL DEFAULT 'SYSTEM',
 "actorId" UUID,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 CONSTRAINT "InventoryReservation_inventory_fkey" FOREIGN KEY ("stationId", "fuelId") REFERENCES "FuelInventory"("stationId", "fuelId") ON DELETE RESTRICT,
 CONSTRAINT "InventoryReservation_terminalOperation_fkey" FOREIGN KEY ("terminalOperationId") REFERENCES "TerminalOperation"("id") ON DELETE RESTRICT,
 CONSTRAINT "InventoryReservation_nonnegative_check" CHECK ("initialLiters" >= 0 AND "remainingLiters" >= 0 AND "consumedLiters" >= 0 AND "releasedLiters" >= 0),
 CONSTRAINT "InventoryReservation_balance_check" CHECK ("initialLiters" = "remainingLiters" + "consumedLiters" + "releasedLiters"),
 CONSTRAINT "InventoryReservation_terminal_zero_check" CHECK ("status" NOT IN ('CLOSED', 'CANCELLED') OR "remainingLiters" = 0)
);
CREATE INDEX "InventoryReservation_open_inventory_idx" ON "InventoryReservation"("stationId", "fuelId", "status") WHERE "status" IN ('PENDING_PAYMENT', 'ACTIVE', 'REVIEW');
CREATE INDEX "InventoryReservation_status_created_idx" ON "InventoryReservation"("status", "createdAt");

CREATE TABLE "InventoryMovement" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "eventKey" VARCHAR(200) NOT NULL UNIQUE,
 "stationId" UUID NOT NULL,
 "fuelId" UUID NOT NULL,
 "sequence" BIGINT NOT NULL,
 "reservationId" UUID REFERENCES "InventoryReservation"("id") ON DELETE RESTRICT,
 "authorizationId" UUID REFERENCES "FuelAuthorization"("id") ON DELETE RESTRICT,
 "terminalOperationId" UUID,
 "transactionId" UUID REFERENCES "Transaction"("id") ON DELETE RESTRICT,
 "kind" "InventoryMovementKind" NOT NULL,
 "physicalDeltaLiters" DECIMAL(14,6) NOT NULL,
 "reservedDeltaLiters" DECIMAL(14,6) NOT NULL,
 "litersAfter" DECIMAL(14,6) NOT NULL CHECK ("litersAfter" >= 0),
 "reservedLitersAfter" DECIMAL(14,6) NOT NULL CHECK ("reservedLitersAfter" >= 0 AND "reservedLitersAfter" <= "litersAfter"),
 "actorKind" "InventoryActorKind" NOT NULL,
 "actorId" UUID,
 "reason" VARCHAR(200),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 CONSTRAINT "InventoryMovement_inventory_fkey" FOREIGN KEY ("stationId", "fuelId") REFERENCES "FuelInventory"("stationId", "fuelId") ON DELETE RESTRICT,
 CONSTRAINT "InventoryMovement_terminalOperation_fkey" FOREIGN KEY ("terminalOperationId") REFERENCES "TerminalOperation"("id") ON DELETE RESTRICT,
 CONSTRAINT "InventoryMovement_inventory_sequence_key" UNIQUE ("stationId", "fuelId", "sequence")
);
CREATE INDEX "InventoryMovement_reservation_created_idx" ON "InventoryMovement"("reservationId", "createdAt");
-- Establish a ledger baseline for inventory rows that already existed.
INSERT INTO "InventoryMovement" ("eventKey","stationId","fuelId","sequence","kind","physicalDeltaLiters","reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind","reason")
SELECT 'opening:'||"stationId"::text||':'||"fuelId"::text,"stationId","fuelId",1,'OPENING_BALANCE',"liters","reservedLiters","liters","reservedLiters",'SYSTEM','Baseline at ledger installation'
FROM "FuelInventory";

CREATE FUNCTION inventory_movement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'InventoryMovement es append-only'; END $$;
CREATE TRIGGER inventory_movement_no_update BEFORE UPDATE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION inventory_movement_immutable();
CREATE TRIGGER inventory_movement_no_delete BEFORE DELETE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION inventory_movement_immutable();

-- Every 0.001 gal step can round up by at most 0.5 microliters. There are at
-- most 1000*G such steps, so adding 0.0005*G liters covers accumulated error.
-- CEIL to microliters supplies the representable DECIMAL(14,6) safe bound.
CREATE FUNCTION inventory_safe_liter_bound(gallons NUMERIC) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
 SELECT CEIL(1000000::NUMERIC * gallons * (3.785411784::NUMERIC + 0.0005::NUMERIC)) / 1000000::NUMERIC
$$;
CREATE FUNCTION inventory_gallons_to_liters(gallons NUMERIC) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
 SELECT ROUND(gallons * 3.785411784::NUMERIC, 6)
$$;

CREATE FUNCTION inventory_reservation_scope_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."authorizationId" IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "FuelAuthorization" a WHERE a."id"=NEW."authorizationId"
     AND a."operationId"=NEW."operationId" AND a."stationId"=NEW."stationId" AND a."fuelId"=NEW."fuelId"
     AND a."terminalOperationId" IS NOT DISTINCT FROM NEW."terminalOperationId"
 ) THEN RAISE EXCEPTION 'Autorización fuera del ámbito de reserva'; END IF;
 IF NEW."terminalOperationId" IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "TerminalOperation" o WHERE o."id"=NEW."terminalOperationId" AND o."operationId"=NEW."operationId" AND o."stationId"=NEW."stationId"
 ) THEN RAISE EXCEPTION 'Operación de terminal fuera del ámbito de reserva'; END IF;
 IF NEW."transactionId" IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "Transaction" t WHERE t."id"=NEW."transactionId" AND t."operationId"=NEW."operationId" AND t."stationId"=NEW."stationId" AND t."fuelId"=NEW."fuelId"
 ) THEN RAISE EXCEPTION 'Transacción fuera del ámbito de reserva'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "InventoryReservation_scope_check" BEFORE INSERT OR UPDATE ON "InventoryReservation"
 FOR EACH ROW EXECUTE FUNCTION inventory_reservation_scope_check();

-- Controlled reservation primitive; physical liters are unchanged.
CREATE FUNCTION inventory_create_reservation(
 p_operation_id UUID, p_station_id UUID, p_fuel_id UUID,
 p_source "InventoryReservationSource", p_max_gallons NUMERIC,
 p_request_hash CHAR(64), p_authorization_id UUID DEFAULT NULL,
 p_terminal_operation_id UUID DEFAULT NULL, p_transaction_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE rid UUID := gen_random_uuid(); reserve_amount NUMERIC := inventory_safe_liter_bound(p_max_gallons);
BEGIN
 IF p_authorization_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "FuelAuthorization" a WHERE a."id"=p_authorization_id
     AND a."operationId"=p_operation_id AND a."stationId"=p_station_id AND a."fuelId"=p_fuel_id
     AND a."terminalOperationId" IS NOT DISTINCT FROM p_terminal_operation_id
 ) THEN RAISE EXCEPTION 'Autorización fuera del ámbito de reserva'; END IF;
 IF p_terminal_operation_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "TerminalOperation" o WHERE o."id"=p_terminal_operation_id AND o."operationId"=p_operation_id AND o."stationId"=p_station_id
 ) THEN RAISE EXCEPTION 'Operación de terminal fuera del ámbito de reserva'; END IF;
 IF p_transaction_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "Transaction" t WHERE t."id"=p_transaction_id AND t."operationId"=p_operation_id AND t."stationId"=p_station_id AND t."fuelId"=p_fuel_id
 ) THEN RAISE EXCEPTION 'Transacción fuera del ámbito de reserva'; END IF;
 UPDATE "FuelInventory" SET "reservedLiters" = "reservedLiters" + reserve_amount, "updatedAt" = now()
 WHERE "stationId" = p_station_id AND "fuelId" = p_fuel_id
   AND "liters" - "reservedLiters" >= reserve_amount;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stock disponible insuficiente para reserva'; END IF;
 INSERT INTO "InventoryReservation" ("id","operationId","terminalOperationId","authorizationId","transactionId","stationId","fuelId","source","status","maxGallons","initialLiters","remainingLiters","requestHash")
 VALUES (rid,p_operation_id,p_terminal_operation_id,p_authorization_id,p_transaction_id,p_station_id,p_fuel_id,p_source,
   CASE WHEN p_source = 'LEGACY' THEN 'ACTIVE'::"InventoryReservationStatus" ELSE 'ACTIVE'::"InventoryReservationStatus" END,
   p_max_gallons,reserve_amount,reserve_amount,p_request_hash);
 INSERT INTO "InventoryMovement" ("eventKey","stationId","fuelId","sequence","reservationId","authorizationId","terminalOperationId","transactionId","kind","physicalDeltaLiters","reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind","reason")
 SELECT 'reservation:'||rid::text, p_station_id,p_fuel_id,COALESCE(MAX("sequence"),0)+1,rid,p_authorization_id,p_terminal_operation_id,p_transaction_id,'RESERVE',0,reserve_amount,"liters","reservedLiters",'SYSTEM','Commitment created'
 FROM "FuelInventory" JOIN "InventoryMovement" USING ("stationId","fuelId")
 WHERE "stationId"=p_station_id AND "fuelId"=p_fuel_id
 GROUP BY "liters","reservedLiters";
 -- First movement in an inventory has no prior ledger row; insert from balances directly.
 IF NOT FOUND THEN
  INSERT INTO "InventoryMovement" ("eventKey","stationId","fuelId","sequence","reservationId","authorizationId","terminalOperationId","transactionId","kind","physicalDeltaLiters","reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind","reason")
  SELECT 'reservation:'||rid::text,p_station_id,p_fuel_id,1,rid,p_authorization_id,p_terminal_operation_id,p_transaction_id,'RESERVE',0,reserve_amount,"liters","reservedLiters",'SYSTEM','Commitment created'
  FROM "FuelInventory" WHERE "stationId"=p_station_id AND "fuelId"=p_fuel_id;
 END IF;
 RETURN rid;
END $$;

CREATE FUNCTION inventory_release_reservation(p_reservation_id UUID, p_liters NUMERIC, p_event_key TEXT, p_actor_id UUID DEFAULT NULL, p_reason TEXT DEFAULT NULL) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE r "InventoryReservation"%ROWTYPE; inv "FuelInventory"%ROWTYPE;
BEGIN
 SELECT * INTO r FROM "InventoryReservation" WHERE "id"=p_reservation_id FOR UPDATE;
 IF NOT FOUND OR p_liters <= 0 OR p_liters > r."remainingLiters" THEN RAISE EXCEPTION 'Liberación inválida'; END IF;
 UPDATE "FuelInventory" SET "reservedLiters"="reservedLiters"-p_liters,"updatedAt"=now() WHERE "stationId"=r."stationId" AND "fuelId"=r."fuelId" RETURNING * INTO inv;
 UPDATE "InventoryReservation" SET "remainingLiters"="remainingLiters"-p_liters,"releasedLiters"="releasedLiters"+p_liters,"status"=CASE WHEN "remainingLiters"=p_liters THEN 'CANCELLED'::"InventoryReservationStatus" ELSE "status" END,"version"="version"+1,"updatedAt"=now() WHERE "id"=r."id";
 INSERT INTO "InventoryMovement"("eventKey","stationId","fuelId","sequence","reservationId","authorizationId","terminalOperationId","transactionId","kind","physicalDeltaLiters","reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind","actorId","reason")
 SELECT p_event_key,r."stationId",r."fuelId",COALESCE(MAX("sequence"),0)+1,r."id",r."authorizationId",r."terminalOperationId",r."transactionId",'RELEASE',0,-p_liters,inv."liters",inv."reservedLiters",'SYSTEM',p_actor_id,p_reason FROM "InventoryMovement" WHERE "stationId"=r."stationId" AND "fuelId"=r."fuelId";
END $$;

-- Keep v11_debit_fuel as the one and only physical debit source. Reservation
-- and physical balances change in one UPDATE so the CHECK stays true throughout.
CREATE OR REPLACE FUNCTION v11_debit_fuel() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delta NUMERIC; res "InventoryReservation"%ROWTYPE; inv "FuelInventory"%ROWTYPE; movement_kind "InventoryMovementKind";
BEGIN
 delta := ROUND((NEW."dispensedGallons" - OLD."dispensedGallons") * 3.785411784::NUMERIC, 6);
 IF delta < 0 THEN RAISE EXCEPTION 'El volumen no puede retroceder'; END IF;
 IF delta = 0 THEN RETURN NEW; END IF;
 SELECT * INTO res FROM "InventoryReservation" WHERE "authorizationId"=NEW."id" FOR UPDATE;
 IF FOUND THEN
  IF res."stationId"<>NEW."stationId" OR res."fuelId"<>NEW."fuelId" OR res."remainingLiters"<delta THEN RAISE EXCEPTION 'Compromiso insuficiente o ámbito inconsistente'; END IF;
  UPDATE "FuelInventory" SET "liters"="liters"-delta,"reservedLiters"="reservedLiters"-delta,"updatedAt"=now()
   WHERE "stationId"=NEW."stationId" AND "fuelId"=NEW."fuelId" AND "liters">=delta AND "reservedLiters">=delta RETURNING * INTO inv;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventario reservado insuficiente'; END IF;
  UPDATE "InventoryReservation" SET "remainingLiters"="remainingLiters"-delta,"consumedLiters"="consumedLiters"+delta,"version"="version"+1,"updatedAt"=now() WHERE "id"=res."id";
  movement_kind := 'DISPENSE';
 ELSE
  UPDATE "FuelInventory" SET "liters"="liters"-delta,"updatedAt"=now()
   WHERE "stationId"=NEW."stationId" AND "fuelId"=NEW."fuelId" AND "liters"-"reservedLiters">=delta RETURNING * INTO inv;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock disponible insuficiente'; END IF;
  movement_kind := 'LEGACY_DISPENSE';
 END IF;
 INSERT INTO "InventoryMovement"("eventKey","stationId","fuelId","sequence","reservationId","authorizationId","terminalOperationId","transactionId","kind","physicalDeltaLiters","reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind","reason")
 SELECT 'progress:'||NEW."id"::text||':'||OLD."dispensedGallons"::text||':'||NEW."dispensedGallons"::text,NEW."stationId",NEW."fuelId",COALESCE(MAX("sequence"),0)+1,CASE WHEN res."id" IS NULL THEN NULL ELSE res."id" END,NEW."id",NEW."terminalOperationId",NULL,movement_kind,-delta,CASE WHEN res."id" IS NULL THEN 0 ELSE -delta END,inv."liters",inv."reservedLiters",'SYSTEM','Validated dispense progress'
 FROM "InventoryMovement" WHERE "stationId"=NEW."stationId" AND "fuelId"=NEW."fuelId";
 IF NOT FOUND THEN
  INSERT INTO "InventoryMovement"("eventKey","stationId","fuelId","sequence","reservationId","authorizationId","terminalOperationId","kind","physicalDeltaLiters","reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind","reason")
  VALUES ('progress:'||NEW."id"::text||':'||OLD."dispensedGallons"::text||':'||NEW."dispensedGallons"::text,NEW."stationId",NEW."fuelId",1,CASE WHEN res."id" IS NULL THEN NULL ELSE res."id" END,NEW."id",NEW."terminalOperationId",movement_kind,-delta,CASE WHEN res."id" IS NULL THEN 0 ELSE -delta END,inv."liters",inv."reservedLiters",'SYSTEM','Validated dispense progress');
 END IF;
 RETURN NEW;
END $$;

-- Mutation entry points are not callable by arbitrary database roles. The
-- migration owner retains access; a future service role can receive narrow
-- EXECUTE grants when a business flow is introduced.
REVOKE EXECUTE ON FUNCTION inventory_movement_immutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION inventory_create_reservation(UUID, UUID, UUID, "InventoryReservationSource", NUMERIC, CHAR, UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION inventory_release_reservation(UUID, NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION inventory_reservation_scope_check() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION v11_debit_fuel() FROM PUBLIC;
