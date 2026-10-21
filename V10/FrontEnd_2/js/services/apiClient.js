import { API_BASE_URL } from '../config.js';
import { session, clearSession } from './session.js';
export async function apiClient(path, { method = 'GET', body, authenticated = true } = {}) {
  const token = authenticated ? session()?.token : null;
  let response;
  try {
    response = await fetch(API_BASE_URL + path, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), cache: 'no-store',
    });
  } catch { throw Error('No pudimos conectar. Revisa tu conexión y vuelve a intentarlo.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && authenticated) {
      clearSession(); globalThis.dispatchEvent?.(new Event('prime-session-expired'));
    }
    const message = response.status === 401
      ? (authenticated ? 'Tu sesión venció. Vuelve a ingresar.' : 'El correo o la contraseña no son correctos.')
      : response.status >= 500 ? 'El servicio no está disponible. Inténtalo nuevamente.'
      : (Array.isArray(data?.message) ? data.message.join('. ') : data?.message) || 'No pudimos completar la operación.';
    throw Object.assign(Error(message), { status: response.status });
  }
  return data;
}
export async function listAll(path) {
  const rows = [];
  for (let page = 1; page <= 1000; page++) {
    const batch = await apiClient(path + '?page=' + page + '&limit=100');
    if (!Array.isArray(batch)) throw Error('No pudimos cargar tus movimientos.');
    rows.push(...batch); if (batch.length < 100) return rows;
  }
  throw Error('El historial es demasiado extenso para cargarlo completo.');
}
