import { apiClient, authorizationService } from './apiClient.js';

export const OPERATION_KEY = 'fuelflow:operation:v1';

/**
 * Estados de una autorización de saldo en el backend.
 * SETTLED y RELEASED son terminales: la reserva ya no admite un cobro.
 */
export const AUTHORIZATION_CLOSED = ['SETTLED', 'RELEASED'];

export function createTransactionsService({
  storage = globalThis.localStorage,
  request = apiClient,
  authorizations = authorizationService,
  uuid = () => crypto.randomUUID(),
} = {}) {
  let inFlight;
  const current = () => JSON.parse(storage.getItem(OPERATION_KEY) || 'null');
  const save = (value) => {
    storage.setItem(OPERATION_KEY, JSON.stringify(value));
    return value;
  };
  const clear = () => storage.removeItem(OPERATION_KEY);

  return {
    current,
    begin() {
      return current() || save({ operationId: uuid() });
    },
    prepare(payload, snapshot) {
      const pending = this.begin();
      if (pending.payload) return pending;
      return save({ ...pending, payload: { ...payload, operationId: pending.operationId }, snapshot });
    },

    /**
     * Reconcilia el estado local con el backend antes de reenviar.
     *
     * Sin esto, un payload guardado cuyo cobro nunca llegó a confirmarse
     * reenvía para siempre contra una autorización ya liquidada: el backend
     * responde 409 y el terminal queda en un bucle de "compra pendiente".
     *
     * - RESERVED / DISPENSING → la compra sigue pendiente: se reenvía con el
     *   mismo operationId, que es idempotente y no duplica el cobro.
     * - SETTLED → el backend sí cobró, pero se perdió la respuesta. Se recupera
     *   la compra real y se da por confirmada, sin cobrar otra vez.
     * - RELEASED / 404 → la reserva se cerró o ya no existe. Se descarta solo
     *   esta operación, nunca el resto del almacenamiento local.
     */
    async reconcile() {
      const pending = current();
      if (!pending?.payload) return { action: 'empty' };
      const { authorizationId, mode } = pending.payload;
      if (mode !== 'POSTPAGO' || !authorizationId) {
        return { action: 'retry' };
      }
      let auth;
      try {
        auth = await authorizations.status(authorizationId);
      } catch {
        // 404: la reserva no existe (base reiniciada, por ejemplo). El payload
        // local ya no puede cobrar nada, así que se descarta.
        return { action: 'discard', reason: 'La reserva de saldo ya no existe.' };
      }
      if (!AUTHORIZATION_CLOSED.includes(auth.status)) return { action: 'retry' };
      if (auth.status === 'SETTLED') {
        // El backend ya registró el cobro. Antes de reenviar, verificamos que
        // el payload persistido conserve su operationId y los campos que el
        // backend usa para la idempotencia; si falta información, no se crea
        // una operación nueva.
        const datos = pending.payload;
        const completo = Boolean(
          datos?.operationId &&
            datos.plate &&
            datos.amount &&
            datos.stationId &&
            datos.fuelId &&
            datos.mode &&
            datos.paymentMethod,
        );
        if (!completo) {
          return {
            action: 'discard',
            reason:
              'Falta información de la operación guardada; no se puede recuperar el comprobante.',
          };
        }
        try {
          // El backend es idempotente por operationId: reenviar la misma
          // operación devuelve la compra original (replayed) sin cobrar de
          // nuevo. El mismo payload y el mismo operationId garantizan que el
          // hash de la petición coincida con el de la compra registrada.
          const result = await this.submit();
          save({ ...pending, result, recovered: true });
          return { action: 'recovered', result };
        } catch {
          // El reenvío no se resolvió (por ejemplo, la compra quedó registrada
          // con otro operationId). No se crea una operación nueva: se informa
          // el estado y se permite iniciar una compra nueva de forma segura.
          return {
            action: 'discard',
            reason: 'No pudimos recuperar la compra confirmada.',
          };
        }
      }
      return { action: 'discard', reason: 'La reserva fue liberada sin consumo.' };
    },

    submit() {
      if (inFlight) return inFlight;
      const pending = current();
      if (!pending?.payload) return Promise.reject(Error('La compra aún no está lista.'));
      if (pending.result) return Promise.resolve(pending.result);
      inFlight = request('/transactions', { method: 'POST', body: pending.payload })
        .then((result) => {
          // Persist before rendering success. A failed write still retries the same operationId.
          save({ ...pending, result });
          return result;
        })
        .finally(() => { inFlight = null; });
      return inFlight;
    },

    /** Descarta únicamente la operación local obsoleta. */
    discard() {
      if (inFlight) throw Error('Espera a que termine la confirmación.');
      clear();
    },

    finish() {
      if (inFlight) throw Error('Espera a que termine la confirmación.');
      const pending = current();
      if (pending?.payload && !pending.result) throw Error('Primero confirma la compra pendiente.');
      clear();
    },
  };
}

export const transactionsService = createTransactionsService();