-- Additive fields. No invented historical price: legacy open operations require review.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'ERROR';
ALTER TYPE "AuthorizationStatus" ADD VALUE IF NOT EXISTS 'INTERVENTION_REQUIRED';
ALTER TABLE "Payment" ALTER COLUMN "transactionId" DROP NOT NULL;
ALTER TABLE "Payment" ADD COLUMN "operationId" UUID,
  ADD COLUMN "requestHash" CHAR(64), ADD COLUMN "unitPrice" DECIMAL(10,2);
CREATE UNIQUE INDEX "Payment_operationId_key" ON "Payment"("operationId");
ALTER TABLE "FuelAuthorization" ALTER COLUMN "membershipId" DROP NOT NULL;
ALTER TABLE "FuelAuthorization" ADD COLUMN "unitPrice" DECIMAL(10,2),
  ADD COLUMN "paymentId" UUID REFERENCES "Payment"("id") ON DELETE RESTRICT,
  ADD COLUMN "interventionReason" VARCHAR(200);
CREATE UNIQUE INDEX "FuelAuthorization_paymentId_key" ON "FuelAuthorization"("paymentId");
ALTER TABLE "FuelAuthorization" DROP CONSTRAINT "fuel_authorization_values_valid";
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "fuel_authorization_values_valid" CHECK (
  "authorizedAmount" > 0 AND "reservedAmount" >= 0 AND "reservedAmount" <= "authorizedAmount"
  AND "releasedAmount" >= 0 AND "releasedAmount" <= "reservedAmount" AND "balanceAfter" >= 0
  AND "dispensedAmount" >= 0 AND "dispensedAmount" <= "authorizedAmount" AND "dispensedGallons" >= 0
  AND ("unitPrice" IS NULL OR "unitPrice" > 0)
  AND ("consumedAmount" IS NULL OR ("consumedAmount" >= 0 AND "consumedAmount" <= "authorizedAmount"))
  AND ((mode = 'POSTPAGO' AND "membershipId" IS NOT NULL) OR (mode = 'PREPAGO' AND "paymentId" IS NOT NULL))
  AND ((status::text IN ('RESERVED','DISPENSING','INTERVENTION_REQUIRED') AND "consumedAmount" IS NULL) OR status::text IN ('SETTLED','RELEASED'))
  AND (status::text <> 'RELEASED' OR "consumedAmount" IS NULL)
);
