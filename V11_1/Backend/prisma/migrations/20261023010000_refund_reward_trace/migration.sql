ALTER TYPE "RewardKind" ADD VALUE IF NOT EXISTS 'REFUND';
ALTER TABLE "RewardMovement" ADD COLUMN "refundPaymentId" UUID;
CREATE UNIQUE INDEX "RewardMovement_refundPaymentId_key" ON "RewardMovement"("refundPaymentId");
ALTER TABLE "RewardMovement" ADD CONSTRAINT "RewardMovement_refundPaymentId_fkey" FOREIGN KEY ("refundPaymentId") REFERENCES "Payment"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardMovement" DROP CONSTRAINT "reward_trace_and_sign";
ALTER TABLE "RewardMovement" ADD CONSTRAINT "reward_trace_and_sign" CHECK (
 (kind::text = 'EARN' AND points > 0 AND "transactionId" IS NOT NULL AND "redemptionId" IS NULL AND "refundPaymentId" IS NULL) OR
 (kind::text = 'REDEEM' AND points < 0 AND "transactionId" IS NULL AND "redemptionId" IS NOT NULL AND "refundPaymentId" IS NULL) OR
 (kind::text = 'REFUND' AND points < 0 AND "transactionId" IS NULL AND "redemptionId" IS NULL AND "refundPaymentId" IS NOT NULL)
);
