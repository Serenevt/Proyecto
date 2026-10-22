-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PAID');

-- CreateEnum
CREATE TYPE "PurchaseMode" AS ENUM ('PREPAGO', 'POSTPAGO');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'PEAJE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CAPTURED');

-- CreateEnum
CREATE TYPE "ReceiptType" AS ENUM ('BOLETA', 'FACTURA');

-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('EARN', 'REDEEM');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('ISSUED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "passwordHash" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "userId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "plate" VARCHAR(7) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "membershipId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" VARCHAR(200) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fuel" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "pricePerGallon" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Fuel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "vehicleId" UUID NOT NULL,
    "membershipId" UUID,
    "stationId" UUID NOT NULL,
    "fuelId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'PEN',
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "gallons" DECIMAL(12,3),
    "pointsRate" DECIMAL(10,4) NOT NULL,
    "pointsEarned" INTEGER NOT NULL,
    "mode" "PurchaseMode" NOT NULL,
    "receiptType" "ReceiptType" NOT NULL DEFAULT 'BOLETA',
    "status" "TransactionStatus" NOT NULL DEFAULT 'PAID',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CAPTURED',
    "provider" VARCHAR(30) NOT NULL DEFAULT 'DEMO',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardMovement" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "kind" "RewardKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "transactionId" UUID,
    "redemptionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benefit" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Benefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "benefitId" UUID NOT NULL,
    "pointsSpent" INTEGER NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'ISSUED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_number_key" ON "Membership"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_key" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

-- CreateIndex
CREATE INDEX "Vehicle_membershipId_idx" ON "Vehicle"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Fuel_code_key" ON "Fuel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_operationId_key" ON "Transaction"("operationId");

-- CreateIndex
CREATE INDEX "Transaction_membershipId_createdAt_idx" ON "Transaction"("membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_vehicleId_createdAt_idx" ON "Transaction"("vehicleId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_stationId_createdAt_idx" ON "Transaction"("stationId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_fuelId_idx" ON "Transaction"("fuelId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardMovement_transactionId_key" ON "RewardMovement"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardMovement_redemptionId_key" ON "RewardMovement"("redemptionId");

-- CreateIndex
CREATE INDEX "RewardMovement_membershipId_createdAt_idx" ON "RewardMovement"("membershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Benefit_code_key" ON "Benefit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_operationId_key" ON "Redemption"("operationId");

-- CreateIndex
CREATE INDEX "Redemption_membershipId_createdAt_idx" ON "Redemption"("membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "Redemption_benefitId_idx" ON "Redemption"("benefitId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fuelId_fkey" FOREIGN KEY ("fuelId") REFERENCES "Fuel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardMovement" ADD CONSTRAINT "RewardMovement_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardMovement" ADD CONSTRAINT "RewardMovement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardMovement" ADD CONSTRAINT "RewardMovement_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "Redemption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "Benefit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
