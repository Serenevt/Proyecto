import { apiClient } from './apiClient.js';
import { session, clearSession, SESSION_KEY } from './session.js';
export const authService = {
  isAuthenticated: () => Boolean(session()),
  async login(email, password) {
    const result = await apiClient('/auth/login', { method: 'POST', body: { email, password }, authenticated: false });
    const expiresAt = Date.now() + Number(result.expiresIn) * 1000;
    if (!result.accessToken || !Number.isFinite(expiresAt)) throw Error('No pudimos iniciar tu sesión.');
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: result.accessToken, expiresAt, user: result.user }));
      if (!session()) throw Error();
    } catch { throw Error('No pudimos guardar tu sesión. Permite el almacenamiento local e inténtalo de nuevo.'); }
    return result.user;
  },
  logout: clearSession,
};
