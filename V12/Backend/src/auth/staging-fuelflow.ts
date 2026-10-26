import { ForbiddenException } from '@nestjs/common';
import { StagingFuelFlowPolicy } from './access';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function stagingOperatorIds(value: string | undefined): Set<string> {
  if (!value) return new Set();
  const ids = value.split(',').map((id) => id.trim().toLowerCase());
  if (ids.some((id) => !uuid.test(id)) || new Set(ids).size !== ids.length)
    throw new Error('Invalid STAGING_FUELFLOW_OPERATOR_IDS');
  return new Set(ids);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ForbiddenException('Solicitud FuelFlow no permitida');
  return value as Record<string, unknown>;
}

function noDebt(value: Record<string, unknown>) {
  if (value.allowDebt !== undefined && value.allowDebt !== false)
    throw new ForbiddenException('Deuda deshabilitada en FuelFlow staging');
}

export function assertStagingFuelFlowPolicy(
  policy: StagingFuelFlowPolicy,
  body: unknown,
) {
  if (policy === 'read' || policy === 'write') return;
  const data = object(body);
  if (policy === 'authorization') {
    noDebt(data);
    if (!['PREPAGO', 'POSTPAGO'].includes(String(data.mode)))
      throw new ForbiddenException('Modalidad FuelFlow no permitida');
  }
  if (policy === 'transaction') {
    if (
      (data.mode === 'POSTPAGO' && data.paymentMethod !== 'SALDO_PRIME') ||
      (data.mode === 'PREPAGO' &&
        !['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN'].includes(String(data.paymentMethod))) ||
      !['PREPAGO', 'POSTPAGO'].includes(String(data.mode))
    )
      throw new ForbiddenException('Pago FuelFlow no permitido');
  }
  if (policy === 'order') {
    if (data.transactionId !== undefined || !data.authorization)
      throw new ForbiddenException('Pago de deuda deshabilitado en FuelFlow staging');
    const authorization = object(data.authorization);
    noDebt(authorization);
    if (
      authorization.mode !== 'PREPAGO' ||
      !['YAPE', 'PLIN'].includes(String(data.method)) ||
      authorization.paymentMethod !== data.method
    )
      throw new ForbiddenException('Orden FuelFlow no permitida');
  }
}
