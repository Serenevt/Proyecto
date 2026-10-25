ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TABLE "Membership" ADD COLUMN "welcomeReservedOperationId" UUID;
CREATE UNIQUE INDEX "Membership_welcomeReservedOperationId_key" ON "Membership"("welcomeReservedOperationId");
ALTER TABLE "Payment" ADD COLUMN "originalAmount" DECIMAL(12,2), ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0, ADD COLUMN "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amounts_nonnegative" CHECK (amount >= 0 AND "discountAmount" >= 0 AND "refundedAmount" >= 0);
CREATE TABLE "PaymentEvent" (
 "id" UUID NOT NULL PRIMARY KEY, "eventKey" VARCHAR(160) NOT NULL UNIQUE,
 "orderId" UUID, "paymentId" UUID, "kind" VARCHAR(32) NOT NULL,
 "detail" VARCHAR(300) NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PaymentEvent_paymentId_createdAt_idx" ON "PaymentEvent"("paymentId", "createdAt");
