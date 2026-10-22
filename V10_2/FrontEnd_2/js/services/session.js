export const SESSION_KEY = 'prime_session:v2';
export function session() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) || 'null');
    return value?.token && value.expiresAt > Date.now() ? value : null;
  } catch { return null; }
}
export function clearSession() {
  globalThis.localStorage?.removeItem(SESSION_KEY);
  globalThis.localStorage?.removeItem('prime_authenticated');
}
