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
  if (location.hash !== '#supervisor-access' && current?.authenticated && current.expiresAt > Date.now()) return Promise.resolve();
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
      dialog.innerHTML = '<form class="terminal-access-card"><div class="terminal-access-brand">PRIMAX <span>Supervisor de estación</span></div><h1>Acceso de Supervisor</h1><label>Correo<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="72"></label><p class="terminal-access-error" role="alert"></p><button type="submit">Ingresar</button></form>';
      const form = dialog.querySelector('form');
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button'); button.disabled = true;
        const body = { identifier: form.elements.email.value, password: form.elements.password.value };
        form.elements.password.value = '';
        try {
          const response = await fetch('/supervisor-api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
          const login = await response.json();
          if (!response.ok || !login.accessToken) throw Error('Correo o contraseña no válidos.');
          await supervisorConsole(login.accessToken);
        } catch (error) { form.querySelector('[role="alert"]').textContent = error.message || 'No se pudo confirmar el acceso.'; }
        finally { body.password = ''; button.disabled = false; }
      });
    };
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
    async function supervisorConsole(jwt) {
      async function request(path, method = 'GET', payload) {
        const response = await fetch('/supervisor-api/supervisor/' + path, { method, cache: 'no-store', headers: { Authorization: 'Bearer ' + jwt, ...(payload ? { 'Content-Type':'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
        const raw = await response.text();
        const data = raw ? JSON.parse(raw) : null;
        if (!response.ok) throw Error(Array.isArray(data.message) ? data.message.join('. ') : data.message || 'Acción rechazada');
        return data;
      }
      const stations = await request('me/stations');
      if (!stations.length) throw Error('No tienes estaciones asignadas. Solicita asistencia administrativa.');
      let stationId = stations[0].stationId;
      async function render(message = '') {
        const [shift, terminals] = await Promise.all([request('shifts/current'), request('stations/' + stationId + '/terminals')]);
        const active = shift && shift.stationId === stationId;
        dialog.innerHTML = `<div class="terminal-access-card supervisor-card"><div class="terminal-access-brand">PRIMAX <span>Supervisor de estación</span></div><h1>Preparar FuelFlow</h1><label>Estación<select id="supervisor-station">${stations.map(row => `<option value="${escape(row.stationId)}" ${row.stationId === stationId ? 'selected' : ''}>${escape(row.station.name)} · ${escape(row.station.code)}</option>`).join('')}</select></label><div class="supervisor-state"><strong>Turno</strong><span>${active ? escape(shift.status) : 'CERRADO'}</span></div><div class="supervisor-actions">${!active ? '<button data-action="open">Abrir turno</button>' : shift.status === 'ABIERTO' ? '<button data-action="suspend">Suspender turno</button><button data-action="close" class="secondary">Cerrar turno</button>' : '<button data-action="resume">Reanudar turno</button><button data-action="close" class="secondary">Cerrar turno</button>'}</div><div class="supervisor-terminals">${terminals.map(row => `<section class="supervisor-terminal"><strong>${escape(row.code)}</strong><p>Surtidor: ${escape(row.assignments?.[0]?.pump?.code || 'Sin asignar')}</p><p>Estado: ${escape(row.operationalStatus)}</p>${active && shift.status === 'ABIERTO' && !row.enablements?.length ? `<button data-action="enable" data-terminal="${escape(row.id)}">Habilitar terminal</button>` : ''}${active && shift.status === 'ABIERTO' && row.enablements?.length ? `<button data-action="pair" data-terminal="${escape(row.id)}">Emparejar terminal</button>` : ''}</section>`).join('')}</div><p class="terminal-access-error" role="alert">${escape(message)}</p><button data-action="back" class="secondary">Volver a FuelFlow</button></div>`;
        dialog.querySelector('#supervisor-station').addEventListener('change', event => { stationId = event.target.value; void render(); });
        dialog.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
          const action = button.dataset.action;
          if (action === 'back') { location.hash = ''; if (await terminalReady()) { dialog.close(); dialog.remove(); window.removeEventListener('hashchange', update); resolve(); } return; }
          button.disabled = true;
          try {
            if (action === 'open') await request('shifts', 'POST', { stationId });
            if (['suspend','resume','close'].includes(action)) await request('shifts/' + shift.id + '/' + action, 'POST', {});
            if (action === 'enable') await request('terminals/' + button.dataset.terminal + '/enable', 'POST', { shiftId: shift.id });
            if (action === 'pair') {
              if (!current?.authenticated) {
                current = await sessionRequest('');
                const boot = await fetch('/api/supervisor/bootstrap', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-FuelFlow-Request':'1', 'X-CSRF-Token':current.csrfToken, Authorization:'Bearer ' + jwt }, body:'{}', cache:'no-store' });
                const data = await boot.json(); if (!boot.ok) throw Error(data.message || 'No se pudo preparar la sesión técnica'); current = data;
              }
              const paired = await fetch('/api/v1/supervisor/terminals/' + button.dataset.terminal + '/pair', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-FuelFlow-Request':'1', 'X-CSRF-Token':current.csrfToken, Authorization:'Bearer ' + jwt }, body:'{}', cache:'no-store' });
              if (!paired.ok) throw Error((await paired.json()).message || 'No se pudo emparejar');
              await render('✓ Terminal lista para operar. Pulsa Volver a FuelFlow.'); return;
            }
            await render();
          } catch (error) { dialog.querySelector('[role="alert"]').textContent = error.message; button.disabled = false; }
        }));
      }
      await render();
    }
    const update = () => location.hash === '#supervisor-access' ? supervisorLogin() : unavailable();
    update();
    window.addEventListener('hashchange', update);
    sessionRequest('').then(async value => {
      current = value;
      if (location.hash !== '#supervisor-access' && value.authenticated && await terminalReady()) {
        dialog.close(); dialog.remove(); window.removeEventListener('hashchange', update); resolve();
      }
    }).catch(() => { current = null; });
  }).finally(() => { waiting = null; });
  return waiting;
}
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { if (location.hash === '#supervisor-access') void ensureKioskSession(); });
