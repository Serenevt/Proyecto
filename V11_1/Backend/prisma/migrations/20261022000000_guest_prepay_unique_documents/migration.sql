BEGIN;
-- Backfill immutable plate snapshots before allowing purchases without Vehicle.
ALTER TABLE "FuelAuthorization" ADD COLUMN "plate" VARCHAR(7);
ALTER TABLE "Transaction" ADD COLUMN "plate" VARCHAR(7);
UPDATE "FuelAuthorization" a SET "plate" = v."plate" FROM "Vehicle" v WHERE a."vehicleId" = v."id";
UPDATE "Transaction" t SET "plate" = v."plate" FROM "Vehicle" v WHERE t."vehicleId" = v."id";
ALTER TABLE "FuelAuthorization" ALTER COLUMN "plate" SET NOT NULL, ALTER COLUMN "vehicleId" DROP NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "plate" SET NOT NULL, ALTER COLUMN "vehicleId" DROP NOT NULL;
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_plate_format" CHECK ("plate" ~ '^[A-Z0-9]{3}-[0-9]{3}$');
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_plate_format" CHECK ("plate" ~ '^[A-Z0-9]{3}-[0-9]{3}$');
-- PostgreSQL permits multiple NULLs. Existing duplicates must be resolved explicitly;
-- this migration never rewrites or deletes historical identity documents.
CREATE UNIQUE INDEX "Membership_dni_key" ON "Membership"("dni");
CREATE UNIQUE INDEX "Membership_ruc_key" ON "Membership"("ruc");
COMMIT;
