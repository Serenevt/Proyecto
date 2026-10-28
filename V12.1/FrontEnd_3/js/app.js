import { API_BASE_URL } from './config.js';
import { canViewStation, initialView, incidentMessage } from './control-state.js';
import { createControlApi } from './control-api.js';

const app = document.querySelector('#app');
let session = null;
let selectedStation = '';
let busy = false;
const controlApi = createControlApi(window.fetch.bind(window), API_BASE_URL);

const api = controlApi.request;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = (value) => `S/ ${Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const has = (permission) => session?.permissions?.includes(permission);

function login(message = '') {
  app.innerHTML = `<main class="login-wrap"><section class="login-card"><div class="brand"><span class="brand-mark">P</span><span>PRIMAX <strong>CONTROL</strong></span></div><p class="eyebrow">ADMINISTRACIÓN OPERATIVA</p><h1>Inicia sesión</h1><p class="muted">Acceso para cuentas administrativas aprobadas.</p><form id="login-form"><label>Correo<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="72"></label><p class="error" role="alert">${esc(message)}</p><button class="primary" type="submit">Entrar a Control</button></form><div class="public-links"><a href="#request-access">Solicitar acceso</a><button class="text-button" type="button" id="resend-link">Reenviar verificación</button></div></section></main>`;
}

function requestAccess(message = '') {
  app.innerHTML = `<main class="login-wrap"><section class="login-card"><div class="brand"><span class="brand-mark">P</span><span>PRIMAX <strong>CONTROL</strong></span></div><p class="eyebrow">SOLICITUD DE ACCESO</p><h1>Crear solicitud</h1><p class="muted">El acceso requiere verificar el correo y aprobación de SUPER_ADMIN.</p><form id="request-form"><label>Nombre<input name="name" autocomplete="name" required maxlength="80"></label><label>Correo<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>Contraseña<input name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="72"></label><label>Acceso solicitado<select name="role"><option value="ENCARGADO">Encargado de estación</option><option value="ADMIN">Administrador</option></select></label><p class="error" role="alert">${esc(message)}</p><button class="primary" type="submit">Enviar solicitud</button></form><div class="public-links"><a href="#login">Volver al acceso</a></div></section></main>`;
}

function shell(view) {
  const canAccounts = session?.global;
  app.innerHTML = `<div class="layout"><aside class="sidebar"><a class="brand" href="#dashboard"><span class="brand-mark">P</span><span>PRIMAX <strong>CONTROL</strong></span></a><div class="nav-label">OPERACIÓN</div><nav><a href="#dashboard" ${view === 'dashboard' ? 'aria-current="page"' : ''}>▦ <span>Dashboard</span></a><a href="#incidents" ${view === 'incidents' ? 'aria-current="page"' : ''}>◉ <span>Incidencias</span></a>${canAccounts ? `<a href="#accounts" ${view === 'accounts' ? 'aria-current="page"' : ''}>♙ <span>Cuentas de acceso</span></a>` : ''}</nav><div class="sidebar-foot"><span class="status-dot"></span> Backend conectado</div></aside><section class="workspace"><header class="topbar"><div class="station-picker"><label for="station">Alcance de estación</label><select id="station"><option value="">${session.global ? 'Todas las estaciones' : 'Todas las asignadas'}</option>${session.stations.map((station) => `<option value="${esc(station.id)}" ${station.id === selectedStation ? 'selected' : ''}>${esc(station.name)} · ${esc(station.code)}</option>`).join('')}</select></div><div class="user-menu"><span class="avatar">${esc(session.user.name.slice(0, 1).toUpperCase())}</span><span><strong>${esc(session.user.name)}</strong><small>${esc(session.role)}</small></span><button id="logout" class="quiet">Cerrar sesión</button></div></header><main id="content" tabindex="-1"></main></section></div>`;
}

function metric(label, value, foot) { return `<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(foot)}</small></article>`; }
async function renderDashboard() {
  const target = document.querySelector('#content'); target.innerHTML = '<div class="loading">Cargando datos reales…</div>';
  try {
    if (!has('ADMIN_DASHBOARD_VIEW')) throw Object.assign(new Error('Acceso denegado a dashboard'), { status: 403 });
    const query = selectedStation ? `?stationId=${encodeURIComponent(selectedStation)}` : '';
    const data = await api(`/control/dashboard${query}`);
    target.innerHTML = `<div class="page-heading"><div><p class="eyebrow">RESUMEN OPERATIVO</p><h1>Dashboard</h1><p class="muted">Indicadores consultados en tiempo real desde Primax V12.1.</p></div></div><section class="metrics">${metric('Operaciones hoy', data.operationsToday, 'Transacciones registradas')}${metric('Operaciones activas', data.activeOperations, 'Despachos en curso')}${metric('Incidencias abiertas', data.openIncidents, 'Abiertas o en revisión')}${metric('Estaciones visibles', data.stations.length, 'Dentro de tu alcance')}</section><div class="grid"><section class="panel"><div class="panel-head"><h2>Terminales</h2><span>Estado actual</span></div><div class="terminal-stats">${data.terminals.map((item) => `<div><span class="status-dot ${item.status === 'FUERA_DE_SERVICIO' ? 'red' : ''}"></span>${esc(item.status.replaceAll('_', ' '))}<strong>${item.count}</strong></div>`).join('') || '<p class="muted">Sin terminales registradas.</p>'}</div></section><section class="panel"><div class="panel-head"><h2>Inventario</h2><span>Litros físicos / reservados</span></div><div class="table-wrap"><table><thead><tr><th>Estación</th><th>Combustible</th><th>Litros</th><th>Reservados</th></tr></thead><tbody>${data.inventory.map((item) => `<tr><td>${esc(data.stations.find((station) => station.id === item.stationId)?.name || item.stationId)}</td><td>${esc(item.fuel.name)}</td><td>${Number(item.liters).toLocaleString('es-PE')}</td><td>${Number(item.reservedLiters).toLocaleString('es-PE')}</td></tr>`).join('') || '<tr><td colspan="4">Sin inventario para este alcance.</td></tr>'}</tbody></table></div></section></div>`;
  } catch (error) { target.innerHTML = `<section class="panel denied"><h2>No se pudo cargar el dashboard</h2><p>${esc(incidentMessage(error))}</p></section>`; }
}

async function renderIncidents() {
  const target = document.querySelector('#content'); target.innerHTML = '<div class="loading">Cargando incidencias…</div>';
  if (!has('ADMIN_INCIDENT_VIEW')) { target.innerHTML = '<section class="panel denied"><h2>Acceso denegado</h2><p>Tu cuenta no tiene permiso para consultar incidencias.</p></section>'; return; }
  const stationId = selectedStation || (!session.global && session.stations.length === 1 ? session.stations[0].id : '');
  if (!stationId) { target.innerHTML = '<section class="panel denied"><h2>Selecciona una estación</h2><p>Elige una estación autorizada para consultar sus incidencias.</p></section>'; return; }
  if (!canViewStation(session, stationId)) { target.innerHTML = '<section class="panel denied"><h2>Acceso denegado</h2><p>La estación seleccionada está fuera de tu alcance.</p></section>'; return; }
  try {
    const rows = await api(`/control/incidents?stationId=${encodeURIComponent(stationId)}`);
    target.innerHTML = `<div class="page-heading"><div><p class="eyebrow">SEGUIMIENTO</p><h1>Incidencias</h1><p class="muted">${rows.length} registros para la estación seleccionada.</p></div></div><section class="panel table-wrap"><table><thead><tr><th>Tipo</th><th>Resumen</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr><td><span class="code">${esc(row.code.replaceAll('_', '-'))}</span></td><td>${esc(row.summary)}</td><td><span class="badge">${esc(row.status.replaceAll('_', ' '))}</span></td><td>${new Date(row.createdAt).toLocaleString('es-PE')}</td><td><button class="text-button" data-incident="${esc(row.id)}">Ver detalle</button></td></tr>`).join('') || '<tr><td colspan="5">No hay incidencias.</td></tr>'}</tbody></table></section><dialog id="incident-dialog"></dialog>`;
  } catch (error) { target.innerHTML = `<section class="panel denied"><h2>No se pudieron cargar las incidencias</h2><p>${esc(incidentMessage(error))}</p></section>`; }
}

async function renderAccounts() {
  const target = document.querySelector('#content'); target.innerHTML = '<div class="loading">Cargando solicitudes…</div>';
  if (!session.global) { target.innerHTML = '<section class="panel denied"><h2>Acceso denegado</h2><p>Solo SUPER_ADMIN puede administrar las cuentas de Control.</p></section>'; return; }
  try {
    const rows = await api('/control/accounts');
    target.innerHTML = `<div class="page-heading"><div><p class="eyebrow">ACCESO ADMINISTRATIVO</p><h1>Cuentas</h1><p class="muted">Solicitudes verificadas y estado de cuentas administrativas.</p></div></div><section class="panel table-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Correo</th><th>Acción</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.user.name)}<small class="subcell">${esc(row.user.email)}</small></td><td>${esc(row.role)}</td><td><span class="badge">${esc(row.status)}</span></td><td>${row.emailVerifiedAt ? 'Verificado' : 'Pendiente'}</td><td>${row.status === 'PENDING_APPROVAL' ? `<button class="text-button" data-approve="${esc(row.user.id)}">Aprobar</button><button class="text-button" data-reject="${esc(row.user.id)}">Rechazar</button>` : row.status === 'APPROVED' ? `<button class="text-button" data-update-access="${esc(row.user.id)}" data-role="${esc(row.role)}">Permisos/estaciones</button><button class="text-button" data-disable="${esc(row.user.id)}">Deshabilitar</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="5">Sin solicitudes.</td></tr>'}</tbody></table></section>`;
  } catch (error) { target.innerHTML = `<section class="panel denied"><h2>No se pudieron cargar las cuentas</h2><p>${esc(incidentMessage(error))}</p></section>`; }
}

async function route() {
  const view = initialView(location.hash); shell(view);
  document.querySelector('#station').addEventListener('change', (event) => { selectedStation = event.target.value; void route(); });
  document.querySelector('#logout').addEventListener('click', async () => { try { await controlApi.logout(); } finally { session = null; login(); } });
  if (view === 'dashboard') await renderDashboard(); else if (view === 'incidents') await renderIncidents(); else await renderAccounts();
}

async function boot() {
  const hashParts = location.hash.split('?');
  if (hashParts[0] === '#/verify') {
    try { const token = new URLSearchParams(hashParts[1] || '').get('token'); if (!token) throw new Error('El enlace no contiene un token válido.'); const result = await api('/control/verify-email', { method: 'POST', body: JSON.stringify({ token }) }); history.replaceState(null, '', `${location.pathname}${location.search}#login`); login(result.message); }
    catch (error) { login(incidentMessage(error)); }
    return;
  }
  if (location.hash === '#request-access') { requestAccess(); return; }
  try { session = await controlApi.session(); await route(); }
  catch { session = null; login(); }
}

document.addEventListener('submit', async (event) => {
  if (!['login-form', 'request-form'].includes(event.target.id) || busy) return;
  event.preventDefault(); busy = true;
  const form = event.target; const button = form.querySelector('button'); button.disabled = true; button.textContent = 'Validando…';
  try {
    if (form.id === 'request-form') { const result = await api('/control/access-requests', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); history.replaceState(null, '', `${location.pathname}${location.search}#login`); login(result.message); }
    else { session = await controlApi.login(Object.fromEntries(new FormData(form))); location.hash = '#dashboard'; await route(); }
  } catch (error) { if (form.id === 'request-form') requestAccess(incidentMessage(error)); else login(incidentMessage(error)); }
  finally { busy = false; }
});

document.addEventListener('click', async (event) => {
  const resend = event.target.closest('#resend-link');
  if (resend) { const email = window.prompt('Correo de la solicitud:'); if (!email) return; try { const result = await api('/control/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }); login(result.message); } catch (error) { login(incidentMessage(error)); } return; }
  const approve = event.target.closest('[data-approve],[data-update-access]');
  if (approve) {
    const choices = session.stations.map((station) => `${station.id} (${station.name})`).join('\n');
    const selected = window.prompt(`IDs de estaciones permitidas (separados por coma).\n${choices}`);
    if (!selected) return;
    const stationIds = selected.split(',').map((value) => value.trim()).filter((value) => session.stations.some((station) => station.id === value));
    if (!stationIds.length) { window.alert('Selecciona al menos una estación autorizada.'); return; }
    const role = window.prompt('Rol a asignar: ADMIN o ENCARGADO', approve.dataset.role || 'ENCARGADO');
    if (!['ADMIN', 'ENCARGADO'].includes(role)) return;
    approve.disabled = true;
    const userId = approve.dataset.approve || approve.dataset.updateAccess;
    const action = approve.dataset.approve ? 'approve' : 'access';
    try { await api(`/control/accounts/${userId}/${action}`, { method: 'POST', body: JSON.stringify({ role, stationIds, permissions: ['ADMIN_CONTROL_ACCESS', 'ADMIN_DASHBOARD_VIEW', 'ADMIN_INCIDENT_VIEW', 'ADMIN_INCIDENT_MANAGE', 'ADMIN_INVENTORY_VIEW', 'ADMIN_OPERATION_VIEW'] }) }); await renderAccounts(); }
    catch (error) { approve.disabled = false; window.alert(incidentMessage(error)); }
    return;
  }
  const action = event.target.closest('[data-reject],[data-disable]');
  if (action) {
    const reason = window.prompt(action.dataset.reject ? 'Motivo del rechazo:' : 'Motivo para deshabilitar:');
    if (!reason) return;
    const kind = action.dataset.reject ? 'reject' : 'disable';
    try { await api(`/control/accounts/${action.dataset.reject || action.dataset.disable}/${kind}`, { method: 'POST', body: JSON.stringify({ reason }) }); await renderAccounts(); }
    catch (error) { window.alert(incidentMessage(error)); }
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-incident]'); if (!button) return;
  try {
    const detail = await api(`/control/incidents/${encodeURIComponent(button.dataset.incident)}`);
    const dialog = document.querySelector('#incident-dialog');
    dialog.innerHTML = `<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><p class="eyebrow">${esc(detail.code.replaceAll('_', '-'))}</p><h2>${esc(detail.summary)}</h2><p>${esc(detail.status.replaceAll('_', ' '))}</p><dl><dt>Operación</dt><dd>${esc(detail.operationId || '—')}</dd><dt>Pago</dt><dd>${esc(detail.payment?.status || '—')}</dd><dt>Despacho</dt><dd>${esc(detail.authorization?.dispensedAmount ?? '—')}</dd><dt>Resolución</dt><dd>${esc(detail.resolution || 'Pendiente')}</dd></dl>${has('ADMIN_INCIDENT_MANAGE') && ['OPEN','IN_REVIEW'].includes(detail.status) ? `<div class="actions">${detail.status === 'OPEN' ? '<button class="secondary" data-status="IN_REVIEW">Iniciar revisión</button>' : '<button class="primary" data-status="RESOLVED">Resolver</button>'}<button class="quiet" data-status="DISMISSED">Descartar</button></div>` : ''}`;
    dialog.showModal(); dialog.querySelectorAll('[data-status]').forEach((action) => action.addEventListener('click', async () => {
      const reason = action.dataset.status === 'RESOLVED' || action.dataset.status === 'DISMISSED' ? window.prompt('Motivo de resolución:') : 'Revisión administrativa iniciada';
      if (!reason) return;
      action.disabled = true;
      try { await api(`/control/incidents/${detail.id}/status`, { method: 'POST', body: JSON.stringify({ status: action.dataset.status, reason }) }); dialog.close(); await renderIncidents(); }
      catch (error) { window.alert(incidentMessage(error)); action.disabled = false; }
    }));
  } catch (error) { window.alert(incidentMessage(error)); }
});

window.addEventListener('hashchange', () => { if (session) void route(); else if (location.hash === '#request-access') requestAccess(); else if (location.hash === '#login' || !location.hash) login(); });
void boot();
