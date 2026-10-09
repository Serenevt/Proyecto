-- Domain constraints not expressible in Prisma schema syntax.
ALTER TABLE "User" ADD CONSTRAINT "user_email_canonical" CHECK (email = lower(email));
ALTER TABLE "Vehicle" ADD CONSTRAINT "vehicle_plate_format" CHECK (plate ~ '^[A-Z0-9]{3}-[0-9]{3}$');
ALTER TABLE "Fuel" ADD CONSTRAINT "fuel_price_positive" CHECK ("pricePerGallon" > 0);
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_values_valid" CHECK (
  amount > 0 AND amount <= 999999.99 AND "unitPrice" > 0 AND
  (gallons IS NULL OR gallons > 0) AND "pointsRate" > 0 AND
  "pointsEarned" >= 0 AND currency = 'PEN' AND
  ("membershipId" IS NOT NULL OR "pointsEarned" = 0)
);
ALTER TABLE "Payment" ADD CONSTRAINT "payment_amount_positive" CHECK (amount > 0);
ALTER TABLE "Benefit" ADD CONSTRAINT "benefit_cost_positive" CHECK ("pointsCost" > 0);
ALTER TABLE "Redemption" ADD CONSTRAINT "redemption_cost_positive" CHECK ("pointsSpent" > 0);
ALTER TABLE "RewardMovement" ADD CONSTRAINT "reward_trace_and_sign" CHECK (
  (kind = 'EARN' AND points > 0 AND "transactionId" IS NOT NULL AND "redemptionId" IS NULL) OR
  (kind = 'REDEEM' AND points < 0 AND "transactionId" IS NULL AND "redemptionId" IS NOT NULL)
);
