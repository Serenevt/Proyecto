-- CreateEnum
CREATE TYPE "GlobalPermission" AS ENUM ('SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "TerminalLifecycle" AS ENUM ('REGISTRADA', 'REVOCADA');

-- CreateEnum
CREATE TYPE "TerminalOperationalStatus" AS ENUM ('BLOQUEADA', 'DISPONIBLE', 'EN_USO', 'ASISTENCIA', 'FUERA_DE_SERVICIO');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('ABIERTO', 'SUSPENDIDO', 'CIERRE_PENDIENTE', 'CERRADO');

-- CreateEnum
CREATE TYPE "TerminalOperationStatus" AS ENUM ('ACTIVE', 'INTERVENTION_REQUIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EnablementEndReason" AS ENUM ('SHIFT_CLOSED', 'SUPERVISOR_BLOCK', 'INCIDENT', 'TERMINAL_REVOKED', 'ADMIN_ACTION');

-- CreateEnum
CREATE TYPE "OperationalActorKind" AS ENUM ('USER', 'TERMINAL', 'LEGACY_KIOSK', 'SYSTEM');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "pumpId" UUID,
ADD COLUMN     "terminalId" UUID,
ADD COLUMN     "terminalOperationId" UUID,
ADD COLUMN     "terminalPumpAssignmentId" UUID;

-- AlterTable
ALTER TABLE "FuelAuthorization" ADD COLUMN     "pumpId" UUID,
ADD COLUMN     "terminalId" UUID,
ADD COLUMN     "terminalOperationId" UUID,
ADD COLUMN     "terminalPumpAssignmentId" UUID;

-- CreateTable
CREATE TABLE "UserPermissionGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "permission" "GlobalPermission" NOT NULL,
    "grantedByUserId" UUID,
    "reason" VARCHAR(200) NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "UserPermissionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupervisorStationAssignment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "stationId" UUID NOT NULL,
    "grantedByUserId" UUID,
    "reason" VARCHAR(200) NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SupervisorStationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pump" (
    "id" UUID NOT NULL,
    "stationId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Pump_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Terminal" (
    "id" UUID NOT NULL,
    "stationId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "lifecycle" "TerminalLifecycle" NOT NULL DEFAULT 'REGISTRADA',
    "operationalStatus" "TerminalOperationalStatus" NOT NULL DEFAULT 'BLOQUEADA',
    "statusVersion" INTEGER NOT NULL DEFAULT 0,
    "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Terminal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminalPumpAssignment" (
    "id" UUID NOT NULL,
    "stationId" UUID NOT NULL,
    "terminalId" UUID NOT NULL,
    "pumpId" UUID NOT NULL,
    "assignedByUserId" UUID,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "endReason" VARCHAR(200),

    CONSTRAINT "TerminalPumpAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupervisorShift" (
    "id" UUID NOT NULL,
    "supervisorUserId" UUID NOT NULL,
    "stationId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'ABIERTO',
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMPTZ(3),
    "closeRequestedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SupervisorShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminalEnablement" (
    "id" UUID NOT NULL,
    "stationId" UUID NOT NULL,
    "terminalId" UUID NOT NULL,
    "terminalPumpAssignmentId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "enabledByUserId" UUID NOT NULL,
    "enabledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMPTZ(3),
    "disableReason" "EnablementEndReason",

    CONSTRAINT "TerminalEnablement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminalCredential" (
    "id" UUID NOT NULL,
    "terminalId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "rotatedFromId" UUID,

    CONSTRAINT "TerminalCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminalOperation" (
    "id" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "stationId" UUID NOT NULL,
    "pumpId" UUID NOT NULL,
    "terminalId" UUID NOT NULL,
    "terminalPumpAssignmentId" UUID NOT NULL,
    "enablementId" UUID NOT NULL,
    "status" "TerminalOperationStatus" NOT NULL DEFAULT 'ACTIVE',
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TerminalOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAuditEvent" (
    "id" UUID NOT NULL,
    "eventKey" VARCHAR(160) NOT NULL,
    "actorKind" "OperationalActorKind" NOT NULL,
    "actorUserId" UUID,
    "stationId" UUID,
    "terminalId" UUID,
    "shiftId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "targetId" VARCHAR(100),
    "outcome" VARCHAR(30) NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPermissionGrant_userId_permission_revokedAt_idx" ON "UserPermissionGrant"("userId", "permission", "revokedAt");

-- CreateIndex
CREATE INDEX "SupervisorStationAssignment_userId_stationId_endedAt_idx" ON "SupervisorStationAssignment"("userId", "stationId", "endedAt");

-- CreateIndex
CREATE INDEX "SupervisorStationAssignment_stationId_endedAt_idx" ON "SupervisorStationAssignment"("stationId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupervisorStationAssignment_id_userId_stationId_key" ON "SupervisorStationAssignment"("id", "userId", "stationId");

-- CreateIndex
CREATE INDEX "Pump_stationId_active_idx" ON "Pump"("stationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Pump_stationId_code_key" ON "Pump"("stationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Pump_id_stationId_key" ON "Pump"("id", "stationId");

-- CreateIndex
CREATE INDEX "Terminal_stationId_lifecycle_operationalStatus_idx" ON "Terminal"("stationId", "lifecycle", "operationalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Terminal_stationId_code_key" ON "Terminal"("stationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Terminal_id_stationId_key" ON "Terminal"("id", "stationId");

-- CreateIndex
CREATE INDEX "TerminalPumpAssignment_terminalId_startedAt_idx" ON "TerminalPumpAssignment"("terminalId", "startedAt");

-- CreateIndex
CREATE INDEX "TerminalPumpAssignment_pumpId_startedAt_idx" ON "TerminalPumpAssignment"("pumpId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TerminalPumpAssignment_id_stationId_terminalId_pumpId_key" ON "TerminalPumpAssignment"("id", "stationId", "terminalId", "pumpId");
CREATE UNIQUE INDEX "TerminalPumpAssignment_id_stationId_terminalId_key" ON "TerminalPumpAssignment"("id", "stationId", "terminalId");

-- CreateIndex
CREATE INDEX "SupervisorShift_supervisorUserId_openedAt_idx" ON "SupervisorShift"("supervisorUserId", "openedAt");

-- CreateIndex
CREATE INDEX "SupervisorShift_stationId_status_idx" ON "SupervisorShift"("stationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupervisorShift_id_stationId_key" ON "SupervisorShift"("id", "stationId");
CREATE UNIQUE INDEX "SupervisorShift_id_supervisorUserId_stationId_key" ON "SupervisorShift"("id", "supervisorUserId", "stationId");

-- CreateIndex
CREATE INDEX "TerminalEnablement_terminalId_enabledAt_idx" ON "TerminalEnablement"("terminalId", "enabledAt");

-- CreateIndex
CREATE INDEX "TerminalEnablement_shiftId_disabledAt_idx" ON "TerminalEnablement"("shiftId", "disabledAt");

-- CreateIndex
CREATE UNIQUE INDEX "TerminalEnablement_id_terminalId_key" ON "TerminalEnablement"("id", "terminalId");

-- CreateIndex
CREATE UNIQUE INDEX "TerminalCredential_tokenHash_key" ON "TerminalCredential"("tokenHash");

-- CreateIndex
CREATE INDEX "TerminalCredential_terminalId_revokedAt_expiresAt_idx" ON "TerminalCredential"("terminalId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TerminalOperation_operationId_key" ON "TerminalOperation"("operationId");

-- CreateIndex
CREATE INDEX "TerminalOperation_terminalId_openedAt_idx" ON "TerminalOperation"("terminalId", "openedAt");

-- CreateIndex
CREATE INDEX "TerminalOperation_status_openedAt_idx" ON "TerminalOperation"("status", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TerminalOperation_id_terminalId_pumpId_stationId_key" ON "TerminalOperation"("id", "terminalId", "pumpId", "stationId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAuditEvent_eventKey_key" ON "OperationalAuditEvent"("eventKey");

-- CreateIndex
CREATE INDEX "OperationalAuditEvent_stationId_createdAt_idx" ON "OperationalAuditEvent"("stationId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalAuditEvent_terminalId_createdAt_idx" ON "OperationalAuditEvent"("terminalId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalAuditEvent_actorUserId_createdAt_idx" ON "OperationalAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_terminalOperationId_key" ON "Transaction"("terminalOperationId");

-- CreateIndex
CREATE INDEX "Transaction_terminalId_createdAt_idx" ON "Transaction"("terminalId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_pumpId_createdAt_idx" ON "Transaction"("pumpId", "createdAt");

-- CreateIndex
CREATE INDEX "FuelAuthorization_terminalId_createdAt_idx" ON "FuelAuthorization"("terminalId", "createdAt");

-- CreateIndex
CREATE INDEX "FuelAuthorization_pumpId_createdAt_idx" ON "FuelAuthorization"("pumpId", "createdAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_terminalOperationId_fkey" FOREIGN KEY ("terminalOperationId") REFERENCES "TerminalOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_terminalPumpAssignmentId_fkey" FOREIGN KEY ("terminalPumpAssignmentId") REFERENCES "TerminalPumpAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_terminalOperationId_fkey" FOREIGN KEY ("terminalOperationId") REFERENCES "TerminalOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_terminalPumpAssignmentId_fkey" FOREIGN KEY ("terminalPumpAssignmentId") REFERENCES "TerminalPumpAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionGrant" ADD CONSTRAINT "UserPermissionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionGrant" ADD CONSTRAINT "UserPermissionGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupervisorStationAssignment" ADD CONSTRAINT "SupervisorStationAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupervisorStationAssignment" ADD CONSTRAINT "SupervisorStationAssignment_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupervisorStationAssignment" ADD CONSTRAINT "SupervisorStationAssignment_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pump" ADD CONSTRAINT "Pump_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Terminal" ADD CONSTRAINT "Terminal_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalPumpAssignment" ADD CONSTRAINT "TerminalPumpAssignment_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalPumpAssignment" ADD CONSTRAINT "TerminalPumpAssignment_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalPumpAssignment" ADD CONSTRAINT "TerminalPumpAssignment_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalPumpAssignment" ADD CONSTRAINT "TerminalPumpAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupervisorShift" ADD CONSTRAINT "SupervisorShift_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupervisorShift" ADD CONSTRAINT "SupervisorShift_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupervisorShift" ADD CONSTRAINT "SupervisorShift_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "SupervisorStationAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalEnablement" ADD CONSTRAINT "TerminalEnablement_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalEnablement" ADD CONSTRAINT "TerminalEnablement_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalEnablement" ADD CONSTRAINT "TerminalEnablement_terminalPumpAssignmentId_fkey" FOREIGN KEY ("terminalPumpAssignmentId") REFERENCES "TerminalPumpAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalEnablement" ADD CONSTRAINT "TerminalEnablement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "SupervisorShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalEnablement" ADD CONSTRAINT "TerminalEnablement_enabledByUserId_fkey" FOREIGN KEY ("enabledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalCredential" ADD CONSTRAINT "TerminalCredential_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalOperation" ADD CONSTRAINT "TerminalOperation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalOperation" ADD CONSTRAINT "TerminalOperation_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalOperation" ADD CONSTRAINT "TerminalOperation_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalOperation" ADD CONSTRAINT "TerminalOperation_terminalPumpAssignmentId_fkey" FOREIGN KEY ("terminalPumpAssignmentId") REFERENCES "TerminalPumpAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalOperation" ADD CONSTRAINT "TerminalOperation_enablementId_fkey" FOREIGN KEY ("enablementId") REFERENCES "TerminalEnablement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAuditEvent" ADD CONSTRAINT "OperationalAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAuditEvent" ADD CONSTRAINT "OperationalAuditEvent_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAuditEvent" ADD CONSTRAINT "OperationalAuditEvent_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAuditEvent" ADD CONSTRAINT "OperationalAuditEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "SupervisorShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 1A invariants which Prisma cannot represent as partial indexes or CHECKs.
CREATE UNIQUE INDEX "UserPermissionGrant_one_active" ON "UserPermissionGrant"("userId", "permission") WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX "SupervisorStationAssignment_one_active" ON "SupervisorStationAssignment"("userId", "stationId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "TerminalPumpAssignment_one_terminal" ON "TerminalPumpAssignment"("terminalId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "TerminalPumpAssignment_one_pump" ON "TerminalPumpAssignment"("pumpId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "SupervisorShift_one_open" ON "SupervisorShift"("supervisorUserId") WHERE "closedAt" IS NULL;
CREATE UNIQUE INDEX "TerminalEnablement_one_active" ON "TerminalEnablement"("terminalId") WHERE "disabledAt" IS NULL;
CREATE UNIQUE INDEX "TerminalCredential_one_active" ON "TerminalCredential"("terminalId") WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX "TerminalOperation_one_active" ON "TerminalOperation"("terminalId") WHERE "closedAt" IS NULL;

ALTER TABLE "UserPermissionGrant" ADD CONSTRAINT "UserPermissionGrant_dates" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "grantedAt");
ALTER TABLE "SupervisorStationAssignment" ADD CONSTRAINT "SupervisorStationAssignment_dates" CHECK ("endedAt" IS NULL OR "endedAt" >= "assignedAt");
ALTER TABLE "TerminalPumpAssignment" ADD CONSTRAINT "TerminalPumpAssignment_dates" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt");
ALTER TABLE "SupervisorShift" ADD CONSTRAINT "SupervisorShift_dates" CHECK (("closedAt" IS NULL) = ("status" <> 'CERRADO') AND ("closedAt" IS NULL OR "closedAt" >= "openedAt"));
ALTER TABLE "TerminalEnablement" ADD CONSTRAINT "TerminalEnablement_dates" CHECK (("disabledAt" IS NULL) = ("disableReason" IS NULL) AND ("disabledAt" IS NULL OR "disabledAt" >= "enabledAt"));
ALTER TABLE "TerminalCredential" ADD CONSTRAINT "TerminalCredential_dates" CHECK ("expiresAt" > "issuedAt" AND ("revokedAt" IS NULL OR "revokedAt" >= "issuedAt"));
ALTER TABLE "Terminal" ADD CONSTRAINT "Terminal_lifecycle_dates" CHECK (("lifecycle" = 'REVOCADA') = ("revokedAt" IS NOT NULL) AND "statusVersion" >= 0);
ALTER TABLE "TerminalOperation" ADD CONSTRAINT "TerminalOperation_dates" CHECK (("closedAt" IS NULL) = ("status" <> 'CLOSED') AND ("closedAt" IS NULL OR "closedAt" >= "openedAt"));

-- Composite foreign keys reject cross-station references even from direct SQL.
ALTER TABLE "TerminalPumpAssignment" ADD CONSTRAINT "TerminalPumpAssignment_terminal_station" FOREIGN KEY ("terminalId", "stationId") REFERENCES "Terminal"("id", "stationId") ON DELETE RESTRICT;
ALTER TABLE "TerminalPumpAssignment" ADD CONSTRAINT "TerminalPumpAssignment_pump_station" FOREIGN KEY ("pumpId", "stationId") REFERENCES "Pump"("id", "stationId") ON DELETE RESTRICT;
ALTER TABLE "SupervisorShift" ADD CONSTRAINT "SupervisorShift_assignment_scope" FOREIGN KEY ("assignmentId", "supervisorUserId", "stationId") REFERENCES "SupervisorStationAssignment"("id", "userId", "stationId") ON DELETE RESTRICT;
ALTER TABLE "TerminalEnablement" ADD CONSTRAINT "TerminalEnablement_terminal_station" FOREIGN KEY ("terminalId", "stationId") REFERENCES "Terminal"("id", "stationId") ON DELETE RESTRICT;
ALTER TABLE "TerminalEnablement" ADD CONSTRAINT "TerminalEnablement_shift_station" FOREIGN KEY ("shiftId", "stationId") REFERENCES "SupervisorShift"("id", "stationId") ON DELETE RESTRICT;
ALTER TABLE "TerminalEnablement" ADD CONSTRAINT "TerminalEnablement_supervisor_scope" FOREIGN KEY ("shiftId", "enabledByUserId", "stationId") REFERENCES "SupervisorShift"("id", "supervisorUserId", "stationId") ON DELETE RESTRICT;
ALTER TABLE "TerminalEnablement" ADD CONSTRAINT "TerminalEnablement_assignment_scope" FOREIGN KEY ("terminalPumpAssignmentId", "stationId", "terminalId") REFERENCES "TerminalPumpAssignment"("id", "stationId", "terminalId") ON DELETE RESTRICT;
ALTER TABLE "TerminalOperation" ADD CONSTRAINT "TerminalOperation_assignment_scope" FOREIGN KEY ("terminalPumpAssignmentId", "stationId", "terminalId", "pumpId") REFERENCES "TerminalPumpAssignment"("id", "stationId", "terminalId", "pumpId") ON DELETE RESTRICT;
ALTER TABLE "TerminalOperation" ADD CONSTRAINT "TerminalOperation_enablement_terminal" FOREIGN KEY ("enablementId", "terminalId") REFERENCES "TerminalEnablement"("id", "terminalId") ON DELETE RESTRICT;

-- Existing rows are legacy and retain NULL snapshots. New snapshots are all-or-none.
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_terminal_snapshot" CHECK (("terminalOperationId" IS NULL AND "terminalId" IS NULL AND "pumpId" IS NULL AND "terminalPumpAssignmentId" IS NULL) OR ("terminalOperationId" IS NOT NULL AND "terminalId" IS NOT NULL AND "pumpId" IS NOT NULL AND "terminalPumpAssignmentId" IS NOT NULL));
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_terminal_snapshot" CHECK (("terminalOperationId" IS NULL AND "terminalId" IS NULL AND "pumpId" IS NULL AND "terminalPumpAssignmentId" IS NULL) OR ("terminalOperationId" IS NOT NULL AND "terminalId" IS NOT NULL AND "pumpId" IS NOT NULL AND "terminalPumpAssignmentId" IS NOT NULL));
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_operation_scope" FOREIGN KEY ("terminalOperationId", "terminalId", "pumpId", "stationId") REFERENCES "TerminalOperation"("id", "terminalId", "pumpId", "stationId") ON DELETE RESTRICT;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_operation_scope" FOREIGN KEY ("terminalOperationId", "terminalId", "pumpId", "stationId") REFERENCES "TerminalOperation"("id", "terminalId", "pumpId", "stationId") ON DELETE RESTRICT;
ALTER TABLE "FuelAuthorization" ADD CONSTRAINT "FuelAuthorization_assignment_scope" FOREIGN KEY ("terminalPumpAssignmentId", "stationId", "terminalId", "pumpId") REFERENCES "TerminalPumpAssignment"("id", "stationId", "terminalId", "pumpId") ON DELETE RESTRICT;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_assignment_scope" FOREIGN KEY ("terminalPumpAssignmentId", "stationId", "terminalId", "pumpId") REFERENCES "TerminalPumpAssignment"("id", "stationId", "terminalId", "pumpId") ON DELETE RESTRICT;

-- Operational audit is append-only even when accessed outside NestJS.
CREATE FUNCTION v12_reject_operational_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'OperationalAuditEvent is append-only' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER v12_operational_audit_immutable
BEFORE UPDATE OR DELETE ON "OperationalAuditEvent"
FOR EACH ROW EXECUTE FUNCTION v12_reject_operational_audit_mutation();

