import { apiClient, authorizationService } from './apiClient.js';

export function recoveryFailure(error) {
  return {action:'blocked', kind: error.status === 401 || error.status === 403 ? 'authentication' : error.status >= 500 ? 'unavailable' : error.kind || (error.status ? 'validation' : 'network'), reason: error.message || 'No se pudo consultar el estado. Reintenta.'};
}

export const OPERATION_KEY = 'fuelflow:operation:v1';
let activeOperationKey = OPERATION_KEY;
export function setStagingOperationScope(sessionTag) {
  if (!/^[0-9a-f]{20}$/.test(sessionTag)) throw Error('Sesión de operador inválida');
  activeOperationKey = `fuelflow:staging:operation:v1:${sessionTag}`;
}

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
  storageKey = () => activeOperationKey,
} = {}) {
  let inFlight;
  let authorizing;
  const current = () => JSON.parse(storage.getItem(storageKey()) || 'null');
  const save = (value) => {
    storage.setItem(storageKey(), JSON.stringify(value));
    return value;
  };
  const clear = () => storage.removeItem(storageKey());

  return {
    current,
    checkpoint(snapshot) { return save({...this.begin(), snapshot}); },
    requireIntervention(reason, snapshot) {
      return save({...this.begin(), snapshot, intervention: reason});
    },
    authorize(body, snapshot) {
      if (authorizing) return authorizing;
      const pending = this.begin();
      if (pending.intervention) return Promise.reject(Error('Requiere intervención'));
      // A cached response is recovery evidence, never permission to dispense.
      // Replay the stable request so Backend revalidates the persisted state.
      const requestBody = pending.authorizationRequest || {...body, operationId:pending.operationId};
      save({...pending, authorizationRequest:requestBody, snapshot});
      authorizing = authorizations.reserve(requestBody).then(result => {
        if (result?.authorization?.status !== 'RESERVED' || !result.authorization.unitPrice)
          throw Error('Backend no autorizó el abastecimiento');
        save({...current(), authorization:result});
        return result;
      }).catch(error => {
        // Definitive postpaid validation rejection created no reservation.
        // The user may explicitly accept debt and retry with the same UUID.
        if (error.status === 400 && requestBody.mode === 'POSTPAGO') {
          const saved = current();
          delete saved.authorizationRequest;
          save(saved);
        }
        throw error;
      }).finally(() => {authorizing = null;});
      return authorizing;
    },
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
      const { authorizationId } = pending.payload;
      if (!authorizationId) {
        return { action: 'retry' };
      }
      let auth;
      try {
        auth = await authorizations.status(authorizationId);
      } catch (error) {
        if (error.status === 404) return { action: 'discard', reason: 'La reserva de saldo ya no existe.' };
        return recoveryFailure(error);
      }
      if (auth.status === 'INTERVENTION_REQUIRED') return {action:'blocked', kind:'intervention', reason:'Requiere intervención del personal.'};
      if (['RESERVED','DISPENSING'].includes(auth.status)) return { action: 'retry' };
      if (!AUTHORIZATION_CLOSED.includes(auth.status)) return {action:'blocked',kind:'intervention',reason:'Estado de autorización desconocido; requiere revisión.'};
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
            action: 'blocked',
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
        } catch (error) {
          return recoveryFailure(error);
        }
      }
      return { action: 'discard', reason: 'La reserva fue liberada sin consumo.' };
    },

    submit() {
      if (inFlight) return inFlight;
      const pending = current();
      if (pending?.intervention) return Promise.reject(Error('Requiere intervención'));
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
      if (inFlight || authorizing) throw Error('Espera a que termine la confirmación.');
      clear();
    },

    async confirmedForPrint(expectedTransactionId) {
      this.assertCanFinish(expectedTransactionId);
      const transaction=await request('/transactions/'+encodeURIComponent(expectedTransactionId));
      this.assertCanFinish(expectedTransactionId);
      if(transaction?.id!==expectedTransactionId)throw Error('El backend no confirmó el comprobante solicitado.');
      const pending=current();
      const result={...pending.result,transaction};
      save({...pending,result});
      return result;
    },
    assertCanFinish(expectedTransactionId) {
      if (inFlight || authorizing) throw Error('Espera a que termine la confirmación.');
      const pending = current();
      if (pending?.intervention || (pending?.authorizationRequest && !pending.result)) throw Error('La operación requiere revisión antes de finalizar.');
      if (pending?.payload && !pending.result) throw Error('Primero confirma la compra pendiente.');
      if (expectedTransactionId !== undefined && pending?.result?.transaction?.id !== expectedTransactionId) throw Error('La operación actual cambió. Conserva el ticket y recupera la operación antes de finalizar.');
    },
    finish(expectedTransactionId) {
      this.assertCanFinish(expectedTransactionId);
      clear();
    },
  };
}

export const transactionsService = createTransactionsService();
