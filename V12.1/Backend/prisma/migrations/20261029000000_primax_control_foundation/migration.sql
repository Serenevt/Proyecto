CREATE TYPE "AdminControlRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'ENCARGADO');
CREATE TYPE "AdminControlStatus" AS ENUM ('PENDING_EMAIL', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DISABLED');
CREATE TYPE "AdminControlPermission" AS ENUM (
  'ADMIN_CONTROL_ACCESS', 'ADMIN_DASHBOARD_VIEW', 'ADMIN_INCIDENT_VIEW',
  'ADMIN_INCIDENT_MANAGE', 'ADMIN_INVENTORY_VIEW', 'ADMIN_OPERATION_VIEW',
  'ADMIN_USER_MANAGE', 'ADMIN_STATION_MANAGE', 'ADMIN_AUDIT_VIEW'
);

CREATE TABLE "AdminControlAccount" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "AdminControlRole" NOT NULL,
  "status" "AdminControlStatus" NOT NULL DEFAULT 'PENDING_EMAIL',
  "emailVerifiedAt" TIMESTAMPTZ(3),
  "approvedAt" TIMESTAMPTZ(3),
  "approvedByUserId" UUID,
  "rejectionReason" VARCHAR(300),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AdminControlAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AdminControlGrant" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "permission" "AdminControlPermission" NOT NULL,
  "grantedByUserId" UUID,
  "reason" VARCHAR(200) NOT NULL,
  "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "AdminControlGrant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AdminStationAssignment" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "stationId" UUID NOT NULL,
  "grantedByUserId" UUID,
  "reason" VARCHAR(200) NOT NULL,
  "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMPTZ(3),
  CONSTRAINT "AdminStationAssignment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AdminEmailVerification" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "verifiedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminEmailVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminControlAccount_userId_key" ON "AdminControlAccount"("userId");
CREATE INDEX "AdminControlAccount_status_createdAt_idx" ON "AdminControlAccount"("status", "createdAt");
CREATE UNIQUE INDEX "AdminControlGrant_userId_permission_revokedAt_key" ON "AdminControlGrant"("userId", "permission", "revokedAt");
CREATE INDEX "AdminControlGrant_userId_revokedAt_idx" ON "AdminControlGrant"("userId", "revokedAt");
CREATE INDEX "AdminStationAssignment_userId_stationId_endedAt_idx" ON "AdminStationAssignment"("userId", "stationId", "endedAt");
CREATE INDEX "AdminStationAssignment_stationId_endedAt_idx" ON "AdminStationAssignment"("stationId", "endedAt");
CREATE UNIQUE INDEX "AdminEmailVerification_userId_key" ON "AdminEmailVerification"("userId");
CREATE UNIQUE INDEX "AdminEmailVerification_tokenHash_key" ON "AdminEmailVerification"("tokenHash");

ALTER TABLE "AdminControlAccount" ADD CONSTRAINT "AdminControlAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminControlAccount" ADD CONSTRAINT "AdminControlAccount_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminControlGrant" ADD CONSTRAINT "AdminControlGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminControlGrant" ADD CONSTRAINT "AdminControlGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminStationAssignment" ADD CONSTRAINT "AdminStationAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminStationAssignment" ADD CONSTRAINT "AdminStationAssignment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AdminControlAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminStationAssignment" ADD CONSTRAINT "AdminStationAssignment_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminStationAssignment" ADD CONSTRAINT "AdminStationAssignment_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminEmailVerification" ADD CONSTRAINT "AdminEmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
