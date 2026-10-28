import { terminalService } from './apiClient.js';
import { transactionsService } from './transactionsService.js';

export async function ensureTerminalOperation({ terminal = terminalService, transactions = transactionsService } = {}) {
  let state;
  try { state = await terminal.me(); }
  catch { throw Error('Esta terminal no está disponible. Solicita asistencia al personal de la estación.'); }
  const operationId = transactions.begin().operationId;
  try {
    const existing = await terminal.operation(operationId);
    if (existing.operationId !== operationId || existing.closedAt) throw Error('La operación requiere asistencia.');
    return existing;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (!state.canStart) throw Error('Esta terminal no está disponible. Solicita asistencia al personal de la estación.');
  const created = await terminal.start(operationId);
  if (created.operationId !== operationId || created.closedAt) throw Error('No se pudo iniciar la operación. Solicita asistencia.');
  return created;
}
