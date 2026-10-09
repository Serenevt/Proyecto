import { apiClient } from './apiClient.js';
export const membershipService = { get: () => apiClient('/memberships/me') };
