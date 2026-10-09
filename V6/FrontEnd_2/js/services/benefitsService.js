import { apiClient } from './apiClient.js';
export const benefitsApi = { list: () => apiClient('/benefits') };
