CREATE TABLE "OnlineOrder" (
 "id" UUID PRIMARY KEY, "operationId" UUID NOT NULL UNIQUE,
 "requestHash" CHAR(64) NOT NULL, "userId" UUID REFERENCES "User"("id"),
 "transactionId" UUID REFERENCES "Transaction"("id"), "paymentId" UUID UNIQUE REFERENCES "Payment"("id"),
 "method" "PaymentMethod" NOT NULL CHECK ("method" IN ('YAPE','PLIN')),
 "amount" DECIMAL(12,2) NOT NULL CHECK ("amount">0),
 "providerId" VARCHAR(80) UNIQUE, "qr" TEXT,
 "status" VARCHAR(24) NOT NULL DEFAULT 'CREATING',
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX online_order_active_debt ON "OnlineOrder"("transactionId")
 WHERE "transactionId" IS NOT NULL AND "status" IN ('CREATING','PENDING');
