-- Preserve historical points and rate snapshots. New transactions store the exact divisor.
ALTER TABLE "Transaction" ADD COLUMN "solesPerPoint" DECIMAL(10,4);
