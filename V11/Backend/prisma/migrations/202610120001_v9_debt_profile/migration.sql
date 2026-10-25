ALTER TYPE "TransactionStatus" ADD VALUE 'PAYMENT_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE 'PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIAL';
ALTER TYPE "WalletMovementKind" ADD VALUE 'DEBT_SETTLEMENT';
CREATE TYPE "DebtStatus" AS ENUM ('PENDING', 'PARTIAL', 'SETTLED');
ALTER TABLE "Membership" ADD COLUMN "dni" VARCHAR(8), ADD COLUMN "ruc" VARCHAR(11), ADD COLUMN "businessName" VARCHAR(160);
ALTER TABLE "Transaction" ADD COLUMN "receiptDni" VARCHAR(8), ADD COLUMN "receiptRuc" VARCHAR(11), ADD COLUMN "receiptBusinessName" VARCHAR(160);
CREATE TABLE "MembershipDebt" (
 "id" UUID PRIMARY KEY,
 "membershipId" UUID NOT NULL REFERENCES "Membership"("id") ON DELETE RESTRICT,
 "transactionId" UUID NOT NULL UNIQUE REFERENCES "Transaction"("id") ON DELETE RESTRICT,
 "amountOriginal" DECIMAL(12,2) NOT NULL,
 "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
 "amountPending" DECIMAL(12,2) NOT NULL,
 "status" "DebtStatus" NOT NULL DEFAULT 'PENDING',
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 "settledAt" TIMESTAMPTZ(3),
 CONSTRAINT "debt_amounts_valid" CHECK ("amountOriginal" > 0 AND "amountPaid" >= 0 AND "amountPending" >= 0 AND "amountOriginal" = "amountPaid" + "amountPending"),
 CONSTRAINT "debt_status_valid" CHECK (
   ("status" = 'SETTLED' AND "amountPending" = 0 AND "settledAt" IS NOT NULL) OR
   ("status" = 'PENDING' AND "amountPaid" = 0 AND "amountPending" > 0 AND "settledAt" IS NULL) OR
   ("status" = 'PARTIAL' AND "amountPaid" > 0 AND "amountPending" > 0 AND "settledAt" IS NULL))
);
CREATE INDEX "MembershipDebt_membershipId_createdAt_id_idx" ON "MembershipDebt"("membershipId", "createdAt", "id");
ALTER TABLE "WalletMovement" ADD COLUMN "debtId" UUID REFERENCES "MembershipDebt"("id") ON DELETE RESTRICT;
ALTER TABLE "WalletMovement" ALTER COLUMN "operationId" TYPE VARCHAR(100);
-- NOT VALID preserves legacy rows without rewriting them; new writes are checked.
ALTER TABLE "Membership" ADD CONSTRAINT "membership_balance_nonnegative_v9" CHECK (balance >= 0) NOT VALID;
ALTER TABLE "Membership" ADD CONSTRAINT "membership_documents_v9" CHECK ((dni IS NULL OR dni ~ '^[0-9]{8}$') AND (ruc IS NULL OR ruc ~ '^[0-9]{11}$')) NOT VALID;
