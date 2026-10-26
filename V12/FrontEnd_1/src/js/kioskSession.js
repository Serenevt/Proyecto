// No credentials or session cookies are stored in JavaScript/localStorage.
let current = null;
let waiting = null;
export const kioskAuthEnabled = () => globalThis.FUELFLOW_KIOSK_AUTH === true;
export const kioskStationId = () => current?.authenticated ? current.stationId : undefined;
async function sessionRequest(path, body) {
  const response = await fetch('/api/kiosk/session' + path, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: { 'X-FuelFlow-Request': '1', ...(body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': current?.csrfToken || '' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.message || 'No se pudo verificar la sesión');
  return value;
}
export function kioskHeaders() {
  return kioskAuthEnabled() ? { 'X-FuelFlow-Request': '1', 'X-CSRF-Token': current?.csrfToken || '' } : {};
}
export function expireKioskSession() {
  if (!kioskAuthEnabled()) return;
  current = null;
  void ensureKioskSession().catch(() => { /* dialog remains locked until verified */ });
}
export function ensureKioskSession() {
  if (!kioskAuthEnabled()) return Promise.resolve();
  // Administrative capabilities are separate from the public operator role.
  const adminButton = document.getElementById('btn-admin-open');
  if (adminButton) adminButton.style.display = 'none';
  if (current?.authenticated && current.expiresAt > Date.now()) return Promise.resolve();
  if (waiting) return waiting;
  waiting = new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Acceso de operador');
    dialog.innerHTML = '<form><h2>Acceso de operador</h2><p>Demostración académica. Todos los pagos son simulados.</p><label>Usuario <input name="username" autocomplete="username" required maxlength="80"></label><br><label>Contraseña <input name="password" type="password" autocomplete="current-password" required maxlength="72"></label><p role="alert"></p><button>Iniciar sesión</button></form>';
    dialog.addEventListener('cancel', event => event.preventDefault());
    document.body.append(dialog); dialog.showModal();
    const form = dialog.querySelector('form'), message = dialog.querySelector('[role=alert]');
    form.querySelector('button').disabled = true;
    form.addEventListener('submit', async event => {
      event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
      try {
        if (!current?.csrfToken) current = await sessionRequest('');
        const data = new FormData(form);
        const body = { username: data.get('username'), password: data.get('password') };
        form.elements.password.value = '';
        try { current = await sessionRequest('/login', body); } finally { body.password = ''; }
        if (!current.authenticated) throw Error('Sesión no confirmada');
        dialog.close(); dialog.remove(); installLogout(); resolve();
      } catch (error) { current = null; message.textContent = error.message; }
      finally { button.disabled = false; }
    });
    sessionRequest('').then(value => {
      current = value;
      if (value.authenticated) { dialog.close(); dialog.remove(); installLogout(); resolve(); }
    }).catch(() => { message.textContent = 'Verifica la conexión e inicia sesión para continuar.'; })
      .finally(() => { form.querySelector('button').disabled = false; });
  }).finally(() => { waiting = null; });
  return waiting;
}
function installLogout() {
  if (document.getElementById('kiosk-logout')) return;
  const button = document.createElement('button'); button.id = 'kiosk-logout'; button.textContent = 'Cerrar sesión de operador';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await sessionRequest('/logout', {}); current = null;
      button.remove(); await ensureKioskSession();
    } catch { button.textContent = 'No se confirmó el cierre. Reintentar'; }
    finally { button.disabled = false; }
  });
  (document.querySelector('.topbar-right') || document.body).append(button);
}
