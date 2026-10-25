CREATE TYPE "AlertType" AS ENUM ('PLATE_MISMATCH', 'PENDING_BALANCE');
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TABLE "BusinessAlert" (
  "id" UUID NOT NULL,
  "eventKey" VARCHAR(200) NOT NULL,
  "type" "AlertType" NOT NULL,
  "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
  "plate" VARCHAR(7) NOT NULL,
  "expectedPlates" TEXT[] NOT NULL,
  "userName" VARCHAR(80) NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "operationId" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  "transactionId" UUID,
  "debtId" UUID,
  "amountPending" DECIMAL(12,2),
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  "resolvedBy" VARCHAR(80),
  CONSTRAINT "BusinessAlert_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessAlert_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BusinessAlert_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BusinessAlert_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "MembershipDebt"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BusinessAlert_eventKey_key" ON "BusinessAlert"("eventKey");
CREATE INDEX "BusinessAlert_status_occurredAt_idx" ON "BusinessAlert"("status", "occurredAt");
CREATE INDEX "BusinessAlert_membershipId_idx" ON "BusinessAlert"("membershipId");
CREATE INDEX "BusinessAlert_transactionId_idx" ON "BusinessAlert"("transactionId");
CREATE INDEX "BusinessAlert_debtId_idx" ON "BusinessAlert"("debtId");
