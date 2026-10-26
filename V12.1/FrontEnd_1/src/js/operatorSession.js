import { setStagingOperationScope } from './transactionsService.js';

async function sessionRequest(path, method = 'GET', body) {
  const response = await fetch(path, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'X-FuelFlow-Request': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, data: await response.json() };
}

export async function startStaging(init) {
  const gate = document.getElementById('staging-operator-gate');
  const shell = document.querySelector('.app-shell');
  const form = document.getElementById('staging-operator-form');
  const message = document.getElementById('staging-operator-message');
  const showGate = (text = '') => {
    gate.hidden = false;
    shell.hidden = true;
    shell.inert = true;
    message.textContent = text;
  };
  showGate();
  document.body.dataset.fuelflowStaging = 'true';
  window.addEventListener('fuelflow-session-expired', () =>
    showGate('La sesión terminó. Inicia sesión para revisar la operación pendiente.'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    message.textContent = '';
    try {
      const { status } = await sessionRequest('/api/session/login', 'POST', {
        identifier: form.elements.identifier.value,
        password: form.elements.password.value,
      });
      form.elements.password.value = '';
      if (status !== 200) throw Error('Acceso de operador denegado o temporalmente limitado.');
      location.reload();
    } catch (error) {
      message.textContent = error.message || 'No se pudo iniciar sesión.';
      button.disabled = false;
    }
  });
  try {
    const { status, data } = await sessionRequest('/api/session');
    if (status !== 200 || !data?.authenticated) return;
    setStagingOperationScope(data.sessionTag);
    gate.hidden = true;
    shell.hidden = false;
    shell.inert = false;
    init();
    for (const id of [
      'btn-admin-open', 'btn-comprobante', 'btn-simular-camara',
      'post-btn-camara', 'post-btn-mem', 'prep-btn-camara',
    ]) {
      const control = document.getElementById(id);
      if (control) control.hidden = true;
    }
    const logout = document.getElementById('staging-operator-logout');
    logout.hidden = false;
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      try { await sessionRequest('/api/session/logout', 'POST'); } finally { location.reload(); }
    });
  } catch {
    showGate('No se pudo verificar la sesión. Comprueba la conexión e inicia sesión de nuevo.');
  }
}
