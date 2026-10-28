import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

export async function terminalOperationFor(
  tx: Db,
  operationId: string,
  stationId: string,
  requireActive = true,
) {
  // Unit-test/legacy adapters that predate the operational tables expose no
  // delegate; production Prisma always does, and returns null for legacy IDs.
  if (!tx.terminalOperation) return null;
  const operation = await tx.terminalOperation.findUnique({
    where: { operationId },
    include: {
      terminal: true,
      pump: true,
      terminalPumpAssignment: true,
      enablement: true,
    },
  });
  if (!operation) return null;
  if (operation.stationId !== stationId)
    throw new BadRequestException(
      'La operación Terminal pertenece a otra estación',
    );
  if (
    operation.terminal.stationId !== operation.stationId ||
    operation.pump.stationId !== operation.stationId ||
    operation.terminalPumpAssignment.stationId !== operation.stationId ||
    operation.terminalPumpAssignment.terminalId !== operation.terminalId ||
    operation.terminalPumpAssignment.pumpId !== operation.pumpId ||
    operation.enablement.stationId !== operation.stationId ||
    operation.enablement.terminalId !== operation.terminalId ||
    operation.enablement.terminalPumpAssignmentId !==
      operation.terminalPumpAssignmentId
  )
    throw new ConflictException(
      'El contexto Terminal, Pump y asignación es inconsistente',
    );
  if (
    requireActive &&
    (operation.closedAt ||
      operation.status !== 'ACTIVE' ||
      operation.terminal.lifecycle !== 'REGISTRADA' ||
      operation.terminalPumpAssignment.endedAt ||
      !operation.pump.active)
  )
    throw new ConflictException('La operación Terminal ya no está activa');
  return operation;
}

export function terminalSnapshot(
  operation: NonNullable<Awaited<ReturnType<typeof terminalOperationFor>>>,
) {
  return {
    terminalOperationId: operation.id,
    terminalId: operation.terminalId,
    pumpId: operation.pumpId,
    terminalPumpAssignmentId: operation.terminalPumpAssignmentId,
  };
}

export function assertAuthorizationContext(
  authorization: {
    operationId: string;
    stationId: string;
    fuelId: string;
    terminalOperationId: string | null;
    terminalId: string | null;
    pumpId: string | null;
    terminalPumpAssignmentId: string | null;
  },
  operationId: string,
  stationId: string,
  fuelId: string,
  operation: Awaited<ReturnType<typeof terminalOperationFor>>,
) {
  if (
    (authorization.operationId && authorization.operationId !== operationId) ||
    (authorization.stationId && authorization.stationId !== stationId) ||
    (authorization.fuelId && authorization.fuelId !== fuelId)
  )
    throw new BadRequestException(
      'La autorización no corresponde a operationId, estación o combustible',
    );
  if (!operation) {
    if (
      authorization.terminalOperationId ||
      authorization.terminalId ||
      authorization.pumpId ||
      authorization.terminalPumpAssignmentId
    )
      throw new ConflictException(
        'La autorización referencia una operación Terminal inexistente',
      );
    return;
  }
  const expected = terminalSnapshot(operation);
  if (
    (authorization.terminalOperationId &&
      authorization.terminalOperationId !== expected.terminalOperationId) ||
    (authorization.terminalId &&
      authorization.terminalId !== expected.terminalId) ||
    (authorization.pumpId && authorization.pumpId !== expected.pumpId) ||
    (authorization.terminalPumpAssignmentId &&
      authorization.terminalPumpAssignmentId !==
        expected.terminalPumpAssignmentId)
  )
    throw new ConflictException(
      'Los vínculos técnicos de la autorización no coinciden con TerminalOperation',
    );
}
