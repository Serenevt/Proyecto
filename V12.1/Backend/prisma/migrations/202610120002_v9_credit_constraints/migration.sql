-- Extends V8 constraints to permit explicit credit commitments. No rows/tables removed.
BEGIN;
ALTER TABLE "FuelAuthorization" DROP CONSTRAINT "fuel_authorization_values_valid";
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "fuel_authorization_values_valid" CHECK (
  "authorizedAmount" > 0 AND "reservedAmount" >= 0 AND "reservedAmount" <= "authorizedAmount"
  AND "releasedAmount" >= 0 AND "releasedAmount" <= "reservedAmount" AND "balanceAfter" >= 0
  AND "dispensedAmount" >= 0 AND "dispensedAmount" <= "authorizedAmount"
  AND "dispensedGallons" >= 0
  AND ("consumedAmount" IS NULL OR ("consumedAmount" >= 0 AND "consumedAmount" <= "authorizedAmount"))
  AND mode = 'POSTPAGO'
  AND ((status IN ('RESERVED','DISPENSING') AND "consumedAmount" IS NULL) OR status IN ('SETTLED','RELEASED'))
  AND (status <> 'RELEASED' OR "consumedAmount" IS NULL)
);
ALTER TABLE "WalletMovement" DROP CONSTRAINT "wallet_movement_values_valid";
ALTER TABLE "WalletMovement" ADD CONSTRAINT "wallet_movement_values_valid" CHECK (
  (kind = 'RESERVE' AND amount < 0)
  OR (kind = 'DEBT_SETTLEMENT' AND amount < 0 AND "debtId" IS NOT NULL AND "transactionId" IS NOT NULL)
  OR (kind IN ('RECHARGE','RELEASE') AND amount > 0)
);
COMMIT;
