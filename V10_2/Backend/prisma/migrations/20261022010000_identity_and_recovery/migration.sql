BEGIN;
ALTER TABLE "Membership" ADD COLUMN "passport" VARCHAR(20);
CREATE UNIQUE INDEX "Membership_passport_key" ON "Membership"("passport");
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_one_identity" CHECK ("dni" IS NULL OR "passport" IS NULL);
ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "PasswordReset" (
 "id" UUID NOT NULL PRIMARY KEY,
 "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "codeHash" CHAR(64) NOT NULL,
 "tokenHash" CHAR(64),
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "verifiedAt" TIMESTAMPTZ(3),
 "usedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PasswordReset_userId_key" ON "PasswordReset"("userId");
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");
COMMIT;
