// Kiosk and terminal credentials remain in HttpOnly cookies; JavaScript only sees status.
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
async function terminalReady() {
  const response = await fetch('/api/v1/terminal/me', {
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: { ...kioskHeaders() },
  });
  return response.ok;
}
export function kioskHeaders() {
  return kioskAuthEnabled() ? { 'X-FuelFlow-Request': '1', 'X-CSRF-Token': current?.csrfToken || '' } : {};
}
export function expireKioskSession() {
  if (!kioskAuthEnabled()) return;
  current = null;
  void ensureKioskSession();
}
export function ensureKioskSession() {
  if (!kioskAuthEnabled()) return Promise.resolve();
  const adminButton = document.getElementById('btn-admin-open');
  if (adminButton) adminButton.hidden = true;
  if (current?.authenticated && current.expiresAt > Date.now()) return Promise.resolve();
  if (waiting) return waiting;
  waiting = new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'terminal-access';
    dialog.setAttribute('aria-label', 'Estado de la terminal');
    dialog.addEventListener('cancel', event => event.preventDefault());
    document.body.append(dialog);
    dialog.showModal();
    const unavailable = () => {
      dialog.innerHTML = '<div class="terminal-access-card"><div class="terminal-access-brand">PRIMAX <span>FuelFlow</span></div><div class="terminal-access-icon" aria-hidden="true">⛽</div><h1>Terminal no disponible</h1><p>Solicita asistencia al personal de la estación.</p><p class="terminal-access-note">Volveremos a estar disponibles en breve.</p></div>';
    };
    const supervisorLogin = () => {
      dialog.innerHTML = '<form class="terminal-access-card"><div class="terminal-access-brand">PRIMAX <span>Personal autorizado</span></div><h1>Acceso de operador</h1><label>Usuario<input name="username" autocomplete="username" required maxlength="80"></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="72"></label><p class="terminal-access-error" role="alert"></p><button type="submit">Iniciar sesión</button></form>';
      const form = dialog.querySelector('form');
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button'); button.disabled = true;
        const body = { username: form.elements.username.value, password: form.elements.password.value };
        form.elements.password.value = '';
        try {
          if (!current?.csrfToken) current = await sessionRequest('');
          current = await sessionRequest('/login', body);
          if (!current.authenticated || !await terminalReady()) { unavailable(); return; }
          dialog.close(); dialog.remove(); window.removeEventListener('hashchange', update); resolve();
        } catch { form.querySelector('[role="alert"]').textContent = 'No se pudo confirmar el acceso. Solicita asistencia.'; }
        finally { body.password = ''; button.disabled = false; }
      });
    };
    const update = () => location.hash === '#supervisor-access' ? supervisorLogin() : unavailable();
    update();
    window.addEventListener('hashchange', update);
    sessionRequest('').then(async value => {
      current = value;
      if (value.authenticated && await terminalReady()) {
        dialog.close(); dialog.remove(); window.removeEventListener('hashchange', update); resolve();
      }
    }).catch(() => { current = null; });
  }).finally(() => { waiting = null; });
  return waiting;
}
