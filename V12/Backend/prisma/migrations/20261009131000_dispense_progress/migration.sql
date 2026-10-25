-- Postpago: avance del abastecimiento y resultado de la reserva.
--
-- Migración aditiva y no destructiva: no modifica ni elimina datos existentes.
-- Depende de 20261009130000_authorization_dispensing, que ya confirmationó los
-- enums 'DISPENSING' y AuthorizationOutcome.

-- 1) Avance del abastecimiento. Ambas columnas arrancan en 0 para las reservas
--    existentes, que ya están RESERVED o liquidadas.
ALTER TABLE "FuelAuthorization"
  ADD COLUMN IF NOT EXISTS "dispensedAmount"  DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "FuelAuthorization"
  ADD COLUMN IF NOT EXISTS "dispensedGallons" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "FuelAuthorization"
  ADD COLUMN IF NOT EXISTS "outcome"          "AuthorizationOutcome";

-- 2) El avance nunca puede superar lo reservado, y una reserva vigente
--    mantiene su consumido final sin confirmar.
ALTER TABLE "FuelAuthorization" DROP CONSTRAINT IF EXISTS "fuel_authorization_values_valid";
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "fuel_authorization_values_valid" CHECK (
  "authorizedAmount" > 0 AND "reservedAmount" > 0 AND "reservedAmount" = "authorizedAmount"
  AND "releasedAmount" >= 0 AND "balanceAfter" >= 0
  AND "dispensedAmount" >= 0 AND "dispensedAmount" <= "reservedAmount"
  AND "dispensedGallons" >= 0
  AND ("consumedAmount" IS NULL OR "consumedAmount" >= 0)
  AND ("consumedAmount" IS NULL OR "consumedAmount" <= "reservedAmount")
  AND mode = 'POSTPAGO'
  -- RESERVED/DISPENSING: sin cobro definitivo todavía.
  -- SETTLED/RELEASED: ya no se puede seguir despachando.
  AND ((status IN ('RESERVED','DISPENSING') AND "consumedAmount" IS NULL)
    OR (status IN ('SETTLED','RELEASED')))
  -- Una reserva liberada nunca registró consumo.
  AND (status <> 'RELEASED' OR "consumedAmount" IS NULL)
);

-- 3) Índice para revisar reservas pendientes sin liberarlas a ciegas.
CREATE INDEX IF NOT EXISTS "FuelAuthorization_status_createdAt_idx" ON "FuelAuthorization"("status","createdAt");