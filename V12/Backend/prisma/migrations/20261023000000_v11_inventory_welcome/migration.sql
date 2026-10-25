-- Additive migration. Existing members retain their historical eligibility.
ALTER TABLE "Membership" ADD COLUMN "welcomeAvailable" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "welcomeTransactionId" UUID;
CREATE UNIQUE INDEX "Membership_welcomeTransactionId_key" ON "Membership"("welcomeTransactionId");
ALTER TABLE "Transaction" ADD COLUMN "originalAmount" DECIMAL(12,2),
 ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
CREATE TABLE "FuelInventory" (
 "stationId" UUID NOT NULL REFERENCES "Station"("id") ON DELETE RESTRICT,
 "fuelId" UUID NOT NULL REFERENCES "Fuel"("id") ON DELETE RESTRICT,
 "liters" DECIMAL(14,6) NOT NULL DEFAULT 0 CHECK ("liters" >= 0),
 "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 PRIMARY KEY ("stationId", "fuelId")
);
-- Debit only the new, validated cumulative dispenser delta. Row UPDATE locks
-- serialize concurrent pumps. Replayed progress deducts zero. Failure rolls back.
CREATE FUNCTION v11_debit_fuel() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delta DECIMAL(14,6);
BEGIN
 delta := (NEW."dispensedGallons" - OLD."dispensedGallons") * 3.785411784;
 IF delta < 0 THEN RAISE EXCEPTION 'El volumen no puede retroceder'; END IF;
 IF delta > 0 THEN
  UPDATE "FuelInventory" SET "liters" = "liters" - delta, "updatedAt" = now()
   WHERE "stationId" = NEW."stationId" AND "fuelId" = NEW."fuelId" AND "liters" >= delta;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock de combustible insuficiente'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v11_debit_fuel BEFORE UPDATE OF "dispensedGallons" ON "FuelAuthorization"
 FOR EACH ROW EXECUTE FUNCTION v11_debit_fuel();
