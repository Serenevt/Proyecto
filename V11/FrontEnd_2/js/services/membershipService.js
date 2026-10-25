import { apiClient } from './apiClient.js';

/**
 * La membresía trae `balance` desde el backend: es el saldo que el postpago
 * consume en el terminal, no un saldo de demostración del dispositivo.
 */
export const membershipService = { get: () => apiClient('/memberships/me'), update: body => apiClient('/memberships/me/profile', { method: 'PATCH', body }) };
