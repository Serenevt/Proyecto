-- Fase 1B-2: reservation lifecycle transitions used by NestJS.
ALTER TABLE "FuelAuthorization"
 ADD COLUMN "inventoryManaged" BOOLEAN NOT NULL DEFAULT false;

CREATE FUNCTION inventory_activate_reservation(p_reservation_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE r "InventoryReservation"%ROWTYPE;
BEGIN
 SELECT * INTO r FROM "InventoryReservation" WHERE "id"=p_reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
 IF r."status"='ACTIVE' THEN RETURN; END IF;
 IF r."status" NOT IN ('PENDING_PAYMENT','REVIEW') OR r."remainingLiters"<=0 THEN
  RAISE EXCEPTION 'Reserva no puede activarse desde su estado actual';
 END IF;
 UPDATE "InventoryReservation" SET "status"='ACTIVE',"reviewReason"=NULL,"version"="version"+1,"updatedAt"=now() WHERE "id"=r."id";
END $$;

CREATE FUNCTION inventory_mark_reservation_review(p_reservation_id UUID, p_reason TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE r "InventoryReservation"%ROWTYPE;
BEGIN
 IF p_reason IS NULL OR length(trim(p_reason))=0 OR length(p_reason)>200 THEN
  RAISE EXCEPTION 'Motivo de revisión inválido';
 END IF;
 SELECT * INTO r FROM "InventoryReservation" WHERE "id"=p_reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
 IF r."status" IN ('CLOSED','CANCELLED') THEN RAISE EXCEPTION 'Reserva terminal no admite revisión'; END IF;
 UPDATE "InventoryReservation" SET "status"='REVIEW',"reviewReason"=p_reason,"version"="version"+1,"updatedAt"=now() WHERE "id"=r."id";
END $$;

-- Release only unused commitment at financial close. The physical debit was
-- already performed by v11_debit_fuel on each validated cumulative progress.
CREATE FUNCTION inventory_close_reservation(
 p_reservation_id UUID, p_transaction_id UUID, p_event_key TEXT, p_reason TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE r "InventoryReservation"%ROWTYPE; inv "FuelInventory"%ROWTYPE; released NUMERIC;
BEGIN
 SELECT * INTO r FROM "InventoryReservation" WHERE "id"=p_reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
 IF r."status"='CLOSED' THEN
  IF r."transactionId"=p_transaction_id THEN RETURN; END IF;
  RAISE EXCEPTION 'Reserva ya cerrada por otra transacción';
 END IF;
 IF r."status" NOT IN ('ACTIVE','REVIEW','CANCELLED') THEN RAISE EXCEPTION 'Reserva no disponible para cierre'; END IF;
 IF r."status"='CANCELLED' AND r."remainingLiters"<>0 THEN RAISE EXCEPTION 'Reserva cancelada conserva compromiso'; END IF;
 IF EXISTS (SELECT 1 FROM "InventoryMovement" WHERE "eventKey"=p_event_key) THEN
  RAISE EXCEPTION 'Clave de cierre ya utilizada';
 END IF;
 released := r."remainingLiters";
 IF released>0 THEN
  UPDATE "FuelInventory" SET "reservedLiters"="reservedLiters"-released,"updatedAt"=now()
   WHERE "stationId"=r."stationId" AND "fuelId"=r."fuelId" AND "reservedLiters">=released
   RETURNING * INTO inv;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compromiso de inventario inconsistente'; END IF;
 ELSE
  SELECT * INTO inv FROM "FuelInventory" WHERE "stationId"=r."stationId" AND "fuelId"=r."fuelId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventario no encontrado'; END IF;
 END IF;
 UPDATE "InventoryReservation" SET "remainingLiters"=0,"releasedLiters"="releasedLiters"+released,
  "status"='CLOSED',"transactionId"=p_transaction_id,"version"="version"+1,"updatedAt"=now()
  WHERE "id"=r."id";
 IF released>0 THEN
  INSERT INTO "InventoryMovement"("eventKey","stationId","fuelId","sequence","reservationId","authorizationId","terminalOperationId","transactionId","kind","physicalDeltaLiters","reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind","reason")
  SELECT p_event_key,r."stationId",r."fuelId",COALESCE(MAX("sequence"),0)+1,r."id",r."authorizationId",r."terminalOperationId",p_transaction_id,'RELEASE',0,-released,inv."liters",inv."reservedLiters",'SYSTEM',left(COALESCE(p_reason,'Unused commitment released at close'),200)
  FROM "InventoryMovement" WHERE "stationId"=r."stationId" AND "fuelId"=r."fuelId";
 END IF;
END $$;

-- Make definite rejection releases replay-safe. REVIEW is intentionally allowed
-- here only because callers invoke this after the provider has confirmed rejection.
CREATE OR REPLACE FUNCTION inventory_release_reservation(
 p_reservation_id UUID, p_liters NUMERIC, p_event_key TEXT,
 p_actor_id UUID DEFAULT NULL, p_reason TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE r "InventoryReservation"%ROWTYPE; inv "FuelInventory"%ROWTYPE;
BEGIN
 SELECT * INTO r FROM "InventoryReservation" WHERE "id"=p_reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
 IF r."status"='CANCELLED' AND r."remainingLiters"=0 THEN RETURN; END IF;
 IF r."status"='CLOSED' THEN RAISE EXCEPTION 'Reserva cerrada no admite liberación'; END IF;
 IF p_liters<=0 OR p_liters>r."remainingLiters" THEN RAISE EXCEPTION 'Liberación inválida'; END IF;
 UPDATE "FuelInventory" SET "reservedLiters"="reservedLiters"-p_liters,"updatedAt"=now()
  WHERE "stationId"=r."stationId" AND "fuelId"=r."fuelId" AND "reservedLiters">=p_liters
  RETURNING * INTO inv;
 IF NOT FOUND THEN RAISE EXCEPTION 'Compromiso de inventario inconsistente'; END IF;
 UPDATE "InventoryReservation" SET "remainingLiters"="remainingLiters"-p_liters,
  "releasedLiters"="releasedLiters"+p_liters,
  "status"=CASE WHEN "remainingLiters"=p_liters THEN 'CANCELLED'::"InventoryReservationStatus" ELSE "status" END,
  "version"="version"+1,"updatedAt"=now() WHERE "id"=r."id";
 INSERT INTO "InventoryMovement"("eventKey","stationId","fuelId","sequence","reservationId","authorizationId","terminalOperationId","transactionId","kind","physicalDeltaLiters","reservedDeltaLiters","litersAfter","reservedLitersAfter","actorKind","actorId","reason")
 SELECT p_event_key,r."stationId",r."fuelId",COALESCE(MAX("sequence"),0)+1,r."id",r."authorizationId",r."terminalOperationId",r."transactionId",'RELEASE',0,-p_liters,inv."liters",inv."reservedLiters",'SYSTEM',p_actor_id,p_reason
 FROM "InventoryMovement" WHERE "stationId"=r."stationId" AND "fuelId"=r."fuelId";
END $$;

REVOKE EXECUTE ON FUNCTION inventory_activate_reservation(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION inventory_mark_reservation_review(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION inventory_close_reservation(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION inventory_release_reservation(UUID, NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC;

-- One definitive financial outcome per partially refunded payment. Reports
-- from individual callbacks/operators retain their own eventKey for replay.
CREATE UNIQUE INDEX "PaymentEvent_onePartialRefundResult"
 ON "PaymentEvent"("paymentId")
 WHERE "kind" IN ('PARTIAL_REFUND_CONFIRMED', 'PARTIAL_REFUND_REJECTED');
