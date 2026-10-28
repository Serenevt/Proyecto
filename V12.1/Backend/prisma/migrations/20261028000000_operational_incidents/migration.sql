CREATE TYPE "OperationalIncidentCode" AS ENUM (
  'INC_001',
  'TERMINAL_UNAVAILABLE',
  'OPERATION_REVIEW',
  'RECONCILIATION_MISMATCH',
  'PAYMENT_AMBIGUOUS'
);

CREATE TYPE "OperationalIncidentStatus" AS ENUM (
  'OPEN',
  'IN_REVIEW',
  'RESOLVED',
  'DISMISSED'
);

CREATE TYPE "OperationalIncidentSeverity" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TABLE "OperationalIncident" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventKey" VARCHAR(160) NOT NULL,
  "code" "OperationalIncidentCode" NOT NULL,
  "status" "OperationalIncidentStatus" NOT NULL DEFAULT 'OPEN',
  "severity" "OperationalIncidentSeverity" NOT NULL DEFAULT 'HIGH',
  "stationId" UUID NOT NULL,
  "terminalId" UUID,
  "pumpId" UUID,
  "operationId" UUID,
  "terminalOperationId" UUID,
  "authorizationId" UUID,
  "transactionId" UUID,
  "paymentId" UUID,
  "summary" VARCHAR(300) NOT NULL,
  "context" JSONB,
  "resolution" VARCHAR(500),
  "resolvedAt" TIMESTAMPTZ(3),
  "resolvedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OperationalIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationalIncident_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperationalIncident_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperationalIncident_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperationalIncident_terminalOperationId_fkey" FOREIGN KEY ("terminalOperationId") REFERENCES "TerminalOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperationalIncident_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "FuelAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperationalIncident_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperationalIncident_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperationalIncident_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OperationalIncident_eventKey_key" ON "OperationalIncident"("eventKey");
CREATE UNIQUE INDEX "OperationalIncident_code_operationId_key" ON "OperationalIncident"("code", "operationId");
CREATE INDEX "OperationalIncident_stationId_status_createdAt_idx" ON "OperationalIncident"("stationId", "status", "createdAt");
CREATE INDEX "OperationalIncident_terminalId_createdAt_idx" ON "OperationalIncident"("terminalId", "createdAt");
CREATE INDEX "OperationalIncident_operationId_idx" ON "OperationalIncident"("operationId");
CREATE INDEX "OperationalIncident_authorizationId_idx" ON "OperationalIncident"("authorizationId");
CREATE INDEX "OperationalIncident_paymentId_idx" ON "OperationalIncident"("paymentId");
