-- Postpago con saldo de membresía Primax Prime (fase wallet).
-- Migración aditiva y no destructiva: no borra ni reescribe datos existentes.

-- 1) Terminología: el fondo del postpago es el saldo Prime, no un peaje.
--    RENAME VALUE (PostgreSQL 10+) conserva las filas existentes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentMethod' AND e.enumlabel = 'PEAJE'
  ) THEN
    EXECUTE 'ALTER TYPE "PaymentMethod" RENAME VALUE ''PEAJE'' TO ''SALDO_PRIME''';
  END IF;
END $$;

-- 2) Saldo disponible de la membresía. DEFAULT 0 preserva las filas existentes.
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "balance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- 3) Enums nuevos.
DO $$ BEGIN
  CREATE TYPE "AuthorizationStatus" AS ENUM ('RESERVED','SETTLED','RELEASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WalletMovementKind" AS ENUM ('RECHARGE','RESERVE','RELEASE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Código de membresía capturado en el terminal (evidencia auditable).
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "membershipCode" VARCHAR(30);

-- 5) Reserva de saldo previa al abastecimiento postpago.
CREATE TABLE IF NOT EXISTS "FuelAuthorization" (
  "id"               UUID NOT NULL,
  "operationId"      UUID NOT NULL,
  "requestHash"      CHAR(64) NOT NULL,
  "membershipId"     UUID NOT NULL,
  "vehicleId"        UUID NOT NULL,
  "stationId"        UUID NOT NULL,
  "fuelId"           UUID NOT NULL,
  "authorizedAmount" DECIMAL(12,2) NOT NULL,
  "reservedAmount"   DECIMAL(12,2) NOT NULL,
  "consumedAmount"   DECIMAL(12,2),
  "releasedAmount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "balanceAfter"     DECIMAL(12,2) NOT NULL,
  "mode"             "PurchaseMode" NOT NULL DEFAULT 'POSTPAGO',
  "status"           "AuthorizationStatus" NOT NULL DEFAULT 'RESERVED',
  "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuelAuthorization_pkey" PRIMARY KEY ("id")
);

-- 6) Libro mayor del saldo.
CREATE TABLE IF NOT EXISTS "WalletMovement" (
  "id"              UUID NOT NULL,
  "membershipId"    UUID NOT NULL,
  "kind"            "WalletMovementKind" NOT NULL,
  "amount"          DECIMAL(12,2) NOT NULL,
  "balanceAfter"    DECIMAL(12,2) NOT NULL,
  "operationId"     VARCHAR(64),
  "authorizationId" UUID,
  "transactionId"   UUID,
  "note"            VARCHAR(200),
  "createdAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletMovement_pkey" PRIMARY KEY ("id")
);

-- 7) Unicidad e índices.
CREATE UNIQUE INDEX IF NOT EXISTS "FuelAuthorization_operationId_key" ON "FuelAuthorization"("operationId");
CREATE UNIQUE INDEX IF NOT EXISTS "WalletMovement_operationId_kind_key" ON "WalletMovement"("operationId","kind");
CREATE INDEX IF NOT EXISTS "FuelAuthorization_membershipId_createdAt_idx" ON "FuelAuthorization"("membershipId","createdAt");
CREATE INDEX IF NOT EXISTS "FuelAuthorization_status_createdAt_idx" ON "FuelAuthorization"("status","createdAt");
CREATE INDEX IF NOT EXISTS "FuelAuthorization_vehicleId_createdAt_idx" ON "FuelAuthorization"("vehicleId","createdAt");
CREATE INDEX IF NOT EXISTS "WalletMovement_membershipId_createdAt_idx" ON "WalletMovement"("membershipId","createdAt");
CREATE INDEX IF NOT EXISTS "WalletMovement_authorizationId_idx" ON "WalletMovement"("authorizationId");

-- 8) Claves foráneas.
DO $$ BEGIN
  ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_stationId_fkey"
    FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_fuelId_fkey"
    FOREIGN KEY ("fuelId") REFERENCES "Fuel"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WalletMovement" ADD CONSTRAINT "WalletMovement_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WalletMovement" ADD CONSTRAINT "WalletMovement_authorizationId_fkey"
    FOREIGN KEY ("authorizationId") REFERENCES "FuelAuthorization"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 9) Vínculo transacción ↔ reserva (1:1).
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "authorizationId" UUID;
DO $$ BEGIN
  ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_authorizationId_fkey"
    FOREIGN KEY ("authorizationId") REFERENCES "FuelAuthorization"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_authorizationId_key" ON "Transaction"("authorizationId");

-- 10) Restricciones de dominio.
ALTER TABLE "FuelAuthorization" DROP CONSTRAINT IF EXISTS "fuel_authorization_values_valid";
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "fuel_authorization_values_valid" CHECK (
  "authorizedAmount" > 0 AND "reservedAmount" > 0 AND "reservedAmount" = "authorizedAmount"
  AND "releasedAmount" >= 0 AND "balanceAfter" >= 0
  AND ("consumedAmount" IS NULL OR "consumedAmount" >= 0)
  AND ("consumedAmount" IS NULL OR "consumedAmount" <= "reservedAmount")
  AND mode = 'POSTPAGO'
  -- Una reserva vigente no tiene consumo; una liquidada o liberada sí.
  AND ((status = 'RESERVED' AND "consumedAmount" IS NULL)
    OR (status IN ('SETTLED','RELEASED')))
);

ALTER TABLE "WalletMovement" DROP CONSTRAINT IF EXISTS "wallet_movement_values_valid";
ALTER TABLE "WalletMovement" ADD CONSTRAINT "wallet_movement_values_valid" CHECK (
  -- RECHARGE y RELEASE abonan; RESERVE descuenta.
  (kind = 'RESERVE'   AND amount < 0)
  OR (kind IN ('RECHARGE','RELEASE') AND amount > 0)
);
ALTER TABLE "WalletMovement" DROP CONSTRAINT IF EXISTS "wallet_movement_balance_nonneg";
ALTER TABLE "WalletMovement" ADD CONSTRAINT "wallet_movement_balance_nonneg" CHECK ("balanceAfter" >= 0);

-- 11) El saldo no puede quedar negativo.
ALTER TABLE "Membership" DROP CONSTRAINT IF EXISTS "membership_balance_nonneg";
ALTER TABLE "Membership" ADD CONSTRAINT "membership_balance_nonneg" CHECK ("balance" >= 0);