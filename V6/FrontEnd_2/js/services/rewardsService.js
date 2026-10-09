import { apiClient, listAll } from './apiClient.js';
import { session } from './session.js';
let inFlight;
export const rewardsService = {
  list: () => listAll('/memberships/me/rewards'),
  redemptions: () => listAll('/memberships/me/redemptions'),
  redeem(benefitId) {
    if (inFlight) return inFlight;
    const key = 'prime:redeem:' + session()?.user.id;
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && saved.benefitId !== benefitId) return Promise.reject(Error('Reintenta primero el canje pendiente.'));
    const body = saved || { operationId: crypto.randomUUID(), benefitId };
    localStorage.setItem(key, JSON.stringify(body));
    inFlight = apiClient('/rewards/redeem', { method: 'POST', body }).then(result => {
      localStorage.removeItem(key); return result;
    }).catch(error => {
      if (error.status >= 400 && error.status < 500) localStorage.removeItem(key);
      throw error;
    }).finally(() => { inFlight = null; });
    return inFlight;
  },
};
