import { apiClient } from './apiClient.js';
import { session } from './session.js';
let inFlight;
export const walletService = {
  read: () => apiClient('/memberships/me/wallet'),
  recharge(amount, explicitId) {
    if (inFlight) return inFlight;
    const key = 'prime:pending-recharge:' + session()?.user.id;
    const saved = JSON.parse(globalThis.localStorage?.getItem(key) || 'null');
    const body = { amount: String(amount), operationId: explicitId || saved?.operationId || crypto.randomUUID() };
    if (saved && saved.amount !== body.amount) return Promise.reject(Error('Reintenta primero la recarga pendiente de S/ ' + saved.amount + ' para confirmar su resultado.'));
    globalThis.localStorage?.setItem(key, JSON.stringify(body));
    inFlight = apiClient('/memberships/me/recharges', { method: 'POST', body }).then(result => {
      globalThis.localStorage?.removeItem(key); return result;
    }).finally(() => { inFlight = null; });
    return inFlight;
  },
};
