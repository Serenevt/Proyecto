-- Align existing constraints with the real Prisma schema; no rows are removed.
BEGIN;
-- DropForeignKey
ALTER TABLE "FuelAuthorization" DROP CONSTRAINT "FuelAuthorization_fuelId_fkey";

-- DropForeignKey
ALTER TABLE "FuelAuthorization" DROP CONSTRAINT "FuelAuthorization_membershipId_fkey";

-- DropForeignKey
ALTER TABLE "FuelAuthorization" DROP CONSTRAINT "FuelAuthorization_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "FuelAuthorization" DROP CONSTRAINT "FuelAuthorization_stationId_fkey";

-- DropForeignKey
ALTER TABLE "FuelAuthorization" DROP CONSTRAINT "FuelAuthorization_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "MembershipDebt" DROP CONSTRAINT "MembershipDebt_membershipId_fkey";

-- DropForeignKey
ALTER TABLE "MembershipDebt" DROP CONSTRAINT "MembershipDebt_transactionId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_authorizationId_fkey";

-- DropForeignKey
ALTER TABLE "WalletMovement" DROP CONSTRAINT "WalletMovement_authorizationId_fkey";

-- DropForeignKey
ALTER TABLE "WalletMovement" DROP CONSTRAINT "WalletMovement_debtId_fkey";

-- DropForeignKey
ALTER TABLE "WalletMovement" DROP CONSTRAINT "WalletMovement_membershipId_fkey";

-- AlterTable
ALTER TABLE "FuelAuthorization" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WalletMovement" ALTER COLUMN "membershipId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "FuelAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_fuelId_fkey" FOREIGN KEY ("fuelId") REFERENCES "Fuel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletMovement" ADD CONSTRAINT "WalletMovement_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletMovement" ADD CONSTRAINT "WalletMovement_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "MembershipDebt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletMovement" ADD CONSTRAINT "WalletMovement_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "FuelAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipDebt" ADD CONSTRAINT "MembershipDebt_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipDebt" ADD CONSTRAINT "MembershipDebt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
