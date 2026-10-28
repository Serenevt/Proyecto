import { API_BASE_URL } from './config.js';
import { canViewStation, initialView, incidentMessage } from './control-state.js';
import { createControlApi } from './control-api.js';

const app = document.querySelector('#app');
const apiClient = createControlApi(window.fetch.bind(window), API_BASE_URL);
const api = apiClient.request;
let session = null;
let selectedStation = '';
let busy = false;
let accountRows = [];
let inventoryRows = [];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value, digits = 2) => value == null ? '—' : Number(value).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: digits });
const stamp = (value) => value ? new Date(value).toLocaleString('es-PE') : '—';
const has = (permission) => Boolean(session?.permissions?.includes(permission));
const actor = () => session?.user?.name || '—';
const queryString = (values) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== '' && value != null) query.set(key, value);
  return query.toString();
};
const dateInputs = () => '<label>Desde<input type="date" name="from"></label><label>Hasta<input type="date" name="to"></label>';

function login(message = '') {
  app.innerHTML = `<main class="login-wrap"><section class="login-card"><div class="brand"><span class="brand-mark">P</span><span>PRIMAX <strong>CONTROL</strong></span></div><p class="eyebrow">ADMINISTRACIÓN OPERATIVA</p><h1>Inicia sesión</h1><p class="muted">Acceso para cuentas administrativas aprobadas.</p><form id="login-form"><label>Correo<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="72"></label><p class="error" role="alert">${esc(message)}</p><button class="primary" type="submit">Entrar a Control</button></form><div class="public-links"><a href="#request-access">Solicitar acceso</a><button class="text-button" type="button" id="resend-link">Reenviar verificación</button></div></section></main>`;
}

function requestAccess(message = '') {
  app.innerHTML = `<main class="login-wrap"><section class="login-card"><div class="brand"><span class="brand-mark">P</span><span>PRIMAX <strong>CONTROL</strong></span></div><p class="eyebrow">SOLICITUD DE ACCESO</p><h1>Crear solicitud</h1><p class="muted">El acceso requiere verificar el correo y aprobación de SUPER_ADMIN.</p><form id="request-form"><label>Nombre<input name="name" autocomplete="name" required maxlength="80"></label><label>Correo<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>Contraseña<input name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="72"></label><label>Acceso solicitado<select name="role"><option value="ENCARGADO">Encargado de estación</option><option value="ADMIN">Administrador</option></select></label><p class="error" role="alert">${esc(message)}</p><button class="primary" type="submit">Enviar solicitud</button></form><div class="public-links"><a href="#login">Volver al acceso</a></div></section></main>`;
}

const nav = [
  ['dashboard', 'Dashboard', null],
  ['operations', 'Operaciones', 'ADMIN_OPERATION_VIEW'],
  ['terminals', 'Terminales', 'ADMIN_TERMINAL_VIEW'],
  ['inventory', 'Inventario', 'ADMIN_INVENTORY_VIEW'],
  ['movements', 'Movimientos', 'ADMIN_INVENTORY_MOVEMENT_VIEW'],
  ['supply', 'Abastecimiento', 'ADMIN_INVENTORY_RECEIVE'],
  ['incidents', 'Incidencias', 'ADMIN_INCIDENT_VIEW'],
  ['accounts', 'Personal / accesos', 'ADMIN_USER_MANAGE'],
  ['audit', 'Auditoría', 'ADMIN_AUDIT_VIEW'],
];

function shell(view) {
  const visible = nav.filter(([id, , permission]) => id === 'accounts' ? session.global : !permission || has(permission));
  app.innerHTML = `<div class="layout"><aside class="sidebar"><a class="brand" href="#dashboard"><span class="brand-mark">P</span><span>PRIMAX <strong>CONTROL</strong></span></a><div class="nav-label">ADMINISTRACIÓN</div><nav>${visible.map(([id, title]) => `<a href="#${id}" ${view === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${({ dashboard:'▦', operations:'↗', terminals:'▣', inventory:'◫', movements:'⇅', supply:'＋', incidents:'◉', accounts:'♙', audit:'☷' })[id]}</span><span>${title}</span></a>`).join('')}</nav><div class="sidebar-foot"><span class="status-dot"></span> Backend conectado</div></aside><section class="workspace"><header class="topbar"><div class="station-picker"><label for="station">Alcance</label><select id="station"><option value="">${session.global ? 'Todas las estaciones' : 'Todas las asignadas'}</option>${session.stations.map((station) => `<option value="${esc(station.id)}" ${station.id === selectedStation ? 'selected' : ''}>${esc(station.name)} · ${esc(station.code)}</option>`).join('')}</select></div><div class="user-menu"><span class="avatar">${esc(session.user.name.slice(0, 1).toUpperCase())}</span><span><strong>${esc(session.user.name)}</strong><small>${esc(session.role)}</small></span><button id="logout" class="quiet">Cerrar sesión</button></div></header><main id="content" tabindex="-1"></main></section></div>`;
  document.querySelector('#station').addEventListener('change', (event) => { selectedStation = event.target.value; void route(); });
  document.querySelector('#logout').addEventListener('click', async () => { try { await apiClient.logout(); } finally { session = null; selectedStation = ''; login(); } });
}

function heading(section, title, description = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${esc(section)}</p><h1>${esc(title)}</h1>${description ? `<p class="muted">${esc(description)}</p>` : ''}</div></div>`;
}
function panel(message, kind = 'empty') { return `<section class="panel ${kind}"><p>${esc(message)}</p></section>`; }
function loading(message = 'Cargando datos reales…') { document.querySelector('#content').innerHTML = `<div class="loading" role="status">${esc(message)}</div>`; }
function showError(error, title = 'No se pudo completar la solicitud') {
  const target = document.querySelector('#content');
  if (target) target.insertAdjacentHTML('afterbegin', `<p class="error-banner" role="alert"><strong>${esc(title)}.</strong> ${esc(incidentMessage(error))}</p>`);
}
function stationsOptions(selected = selectedStation) {
  return session.stations.map((station) => `<option value="${esc(station.id)}" ${station.id === selected ? 'selected' : ''}>${esc(station.name)} · ${esc(station.code)}</option>`).join('');
}

async function renderDashboard() {
  loading();
  try {
    const suffix = selectedStation ? `?stationId=${encodeURIComponent(selectedStation)}` : '';
    const data = await api(`/control/dashboard${suffix}`);
    const unavailable = data.terminals.filter((entry) => ['ASISTENCIA', 'FUERA_DE_SERVICIO'].includes(entry.status)).reduce((sum, entry) => sum + entry.count, 0);
    document.querySelector('#content').innerHTML = `${heading('RESUMEN OPERATIVO', 'Dashboard', 'Indicadores consultados en tiempo real desde Primax V12.1.')}<section class="metrics"><article class="metric"><span>Operaciones hoy</span><strong>${data.operationsToday}</strong><small>Transacciones registradas</small></article><article class="metric"><span>Operaciones activas</span><strong>${data.activeOperations}</strong><small>Despachos en curso</small></article><article class="metric"><span>Incidencias abiertas</span><strong>${data.openIncidents}</strong><small>Abiertas o en revisión</small></article><article class="metric"><span>Terminales en atención</span><strong>${unavailable}</strong><small>Asistencia o fuera de servicio</small></article></section><div class="grid"><section class="panel"><div class="panel-head"><h2>Combustible disponible</h2><span>${data.reviewPairs} pares en REVIEW</span></div><div class="table-wrap"><table><thead><tr><th>Estación</th><th>Combustible</th><th>Disponible L</th><th>Reservado L</th><th>Estado</th></tr></thead><tbody>${data.inventory.map((item) => `<tr><td>${esc(data.stations.find((station) => station.id === item.stationId)?.name || 'Estación')}</td><td>${esc(item.fuel.name)}</td><td>${fmt(item.availableLiters, 3)}</td><td>${fmt(item.reservedLiters, 3)}</td><td><span class="badge ${item.activation?.status === 'REVIEW' ? 'warning' : ''}">${esc(item.activation?.status || '—')}</span></td></tr>`).join('') || '<tr><td colspan="5">Sin inventario en este alcance.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-head"><h2>Estado de terminales</h2><span>${data.stations.length} estaciones visibles</span></div><div class="terminal-stats">${data.terminals.map((item) => `<div><span class="status-dot ${['ASISTENCIA','FUERA_DE_SERVICIO'].includes(item.status) ? 'red' : ''}"></span>${esc(item.status.replaceAll('_', ' '))}<strong>${item.count}</strong></div>`).join('') || '<p class="muted">Sin terminales registradas.</p>'}</div></section></div>`;
  } catch (error) { document.querySelector('#content').innerHTML = `${heading('RESUMEN OPERATIVO', 'Dashboard')}${panel(incidentMessage(error), 'denied')}`; }
}

async function renderOperations(filters = {}) {
  loading('Consultando operaciones…');
  try {
    const query = queryString({ stationId: filters.stationId ?? selectedStation, status: filters.status, mode: filters.mode, from: filters.from, to: filters.to });
    const rows = await api(`/control/operations${query ? `?${query}` : ''}`);
    document.querySelector('#content').innerHTML = `${heading('ACTIVIDAD', 'Operaciones', `${rows.length} operaciones en el resultado.`)}<form id="operation-filters" class="filter-bar"><label>Estado<select name="status"><option value="">Todos</option>${['ACTIVE','INTERVENTION_REQUIRED','CLOSED','RESERVED','DISPENSING','SETTLED','RELEASED','PAID','REFUNDED','PAYMENT_PENDING'].map((status) => `<option ${filters.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><label>Modalidad<select name="mode"><option value="">Todas</option><option value="PREPAGO" ${filters.mode === 'PREPAGO' ? 'selected' : ''}>Prepago</option><option value="POSTPAGO" ${filters.mode === 'POSTPAGO' ? 'selected' : ''}>Postpago</option></select></label>${dateInputs()}<button class="secondary">Filtrar</button></form><section class="panel table-wrap"><table><thead><tr><th>Operación</th><th>Estación</th><th>Terminal / surtidor</th><th>Combustible</th><th>Modalidad</th><th>Estado físico</th><th>Financiero</th><th>Monto</th><th>Despacho</th><th>Fecha</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr><td class="mono">${esc(row.operationId.slice(0, 8))}</td><td>${esc(row.station?.name || '—')}</td><td>${esc(row.terminal?.code || '—')} / ${esc(row.pump?.code || '—')}</td><td>${esc(row.fuel?.name || '—')}</td><td>${esc(row.mode || '—')}</td><td><span class="badge">${esc(row.status || '—')}</span></td><td>${esc(row.financialStatus || '—')}</td><td>${fmt(row.amount)}</td><td>${fmt(row.dispensedGallons, 3)} gal</td><td>${stamp(row.occurredAt)}</td><td><button class="text-button" data-operation="${esc(row.operationId)}">Detalle</button></td></tr>`).join('') || '<tr><td colspan="11">No hay operaciones para esos filtros.</td></tr>'}</tbody></table></section><dialog id="operation-dialog"></dialog>`;
  } catch (error) { showError(error); }
}

async function renderTerminals() {
  loading('Consultando terminales y surtidores…');
  try {
    const suffix = selectedStation ? `?stationId=${encodeURIComponent(selectedStation)}` : '';
    const { terminals, pumps } = await api(`/control/terminals${suffix}`);
    document.querySelector('#content').innerHTML = `${heading('EQUIPOS', 'Terminales y surtidores', 'El estado de conexión se representa mediante la última actividad de credenciales.')}<section class="panel"><div class="panel-head"><h2>Terminales</h2></div><div class="table-wrap"><table><thead><tr><th>Estación</th><th>Terminal</th><th>Estado</th><th>Surtidor asignado</th><th>Operación activa</th><th>Última actividad</th><th>Acción</th></tr></thead><tbody>${terminals.map((terminal) => { const assignment = terminal.assignments[0]; const operation = terminal.operations[0]; const actions = has('ADMIN_TERMINAL_MANAGE') && !operation ? terminal.operationalStatus === 'FUERA_DE_SERVICIO' ? `<button class="text-button" data-terminal-action="RESTORE" data-terminal-id="${terminal.id}">Restaurar bloqueada</button>` : `<button class="text-button" data-terminal-action="OUT_OF_SERVICE" data-terminal-id="${terminal.id}">Fuera de servicio</button>` : '—'; return `<tr><td>${esc(terminal.station.name)}</td><td>${esc(terminal.code)}</td><td><span class="badge ${terminal.operationalStatus === 'FUERA_DE_SERVICIO' || terminal.operationalStatus === 'ASISTENCIA' ? 'warning' : ''}">${esc(terminal.operationalStatus.replaceAll('_', ' '))}</span></td><td>${esc(assignment?.pump?.code || 'Sin asignar')}</td><td>${operation ? esc(operation.operationId.slice(0, 8)) : '—'}</td><td>${stamp(terminal.credentials[0]?.lastUsedAt)}</td><td>${actions}</td></tr>`; }).join('') || '<tr><td colspan="7">No hay terminales para este alcance.</td></tr>'}</tbody></table></div></section><section class="panel table-wrap"><div class="panel-head"><h2>Surtidores</h2></div><table><thead><tr><th>Estación</th><th>Surtidor</th><th>Nombre</th><th>Terminal asignada</th><th>Estado de terminal</th></tr></thead><tbody>${pumps.map((pump) => `<tr><td>${esc(pump.station.name)}</td><td>${esc(pump.code)}</td><td>${esc(pump.name)}</td><td>${esc(pump.assignments[0]?.terminal?.code || 'Sin asignar')}</td><td>${esc(pump.assignments[0]?.terminal?.operationalStatus || '—')}</td></tr>`).join('') || '<tr><td colspan="5">No hay surtidores activos.</td></tr>'}</tbody></table></section>`;
  } catch (error) { showError(error); }
}

async function renderInventory() {
  loading('Consultando inventario…');
  try {
    const suffix = selectedStation ? `?stationId=${encodeURIComponent(selectedStation)}` : '';
    inventoryRows = await api(`/control/inventory${suffix}`);
    document.querySelector('#content').innerHTML = `${heading('EXISTENCIAS', 'Inventario', 'Disponible = litros físicos − litros reservados. El backend mantiene el ledger.')}<section class="panel table-wrap"><table><thead><tr><th>Estación</th><th>Combustible</th><th>Físico L</th><th>Reservado L</th><th>Disponible L</th><th>Estado</th><th>Última actualización</th><th>Acciones</th></tr></thead><tbody>${inventoryRows.map((row) => `<tr class="${row.activation?.status === 'REVIEW' ? 'review-row' : ''}"><td>${esc(row.station.name)}</td><td>${esc(row.fuel.name)}</td><td>${fmt(row.liters, 3)}</td><td>${fmt(row.reservedLiters, 3)}</td><td><strong>${fmt(row.availableLiters, 3)}</strong></td><td><span class="badge ${row.activation?.status === 'REVIEW' ? 'warning' : ''}">${esc(row.activation?.status || '—')}</span>${row.activation?.reason ? `<small class="subcell">${esc(row.activation.reason)}</small>` : ''}</td><td>${stamp(row.updatedAt)}</td><td><button class="text-button" data-inspect-pair="${row.stationId}:${row.fuelId}">Ver conciliación</button>${has('ADMIN_INVENTORY_RECONCILE') && row.activation?.status === 'REVIEW' ? `<button class="text-button" data-reconcile="${row.stationId}:${row.fuelId}">Reconciliar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8">No hay inventario en este alcance.</td></tr>'}</tbody></table></section><dialog id="reconciliation-dialog"></dialog>`;
  } catch (error) { showError(error); }
}

async function renderMovements(filters = {}) {
  loading('Consultando ledger…');
  const stationId = filters.stationId ?? selectedStation;
  if (!stationId) { document.querySelector('#content').innerHTML = `${heading('LEDGER', 'Movimientos')}${panel('Selecciona una estación para ver su ledger.')}`; return; }
  try {
    const movements = await api(`/control/inventory/movements?${queryString({ stationId, fuelId: filters.fuelId, kind: filters.kind, from: filters.from, to: filters.to })}`);
    const fuels = inventoryRows.filter((row) => row.stationId === stationId);
    document.querySelector('#content').innerHTML = `${heading('LEDGER APPEND-ONLY', 'Movimientos de inventario', 'Esta vista es de solo lectura; los movimientos no se editan ni eliminan.')}<form id="movement-filters" class="filter-bar"><label>Combustible<select name="fuelId"><option value="">Todos</option>${fuels.map((row) => `<option value="${row.fuelId}" ${filters.fuelId === row.fuelId ? 'selected' : ''}>${esc(row.fuel.name)}</option>`).join('')}</select></label><label>Tipo<select name="kind"><option value="">Todos</option>${['OPENING_BALANCE','RESERVE','DISPENSE','LEGACY_DISPENSE','RELEASE','ADJUST_IN','ADJUST_OUT'].map((kind) => `<option ${filters.kind === kind ? 'selected' : ''}>${kind}</option>`).join('')}</select></label>${dateInputs()}<button class="secondary">Filtrar</button></form><section class="panel table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Combustible</th><th>Δ físico L</th><th>Δ reservado L</th><th>Físico luego</th><th>Reservado luego</th><th>Operación</th><th>Referencia</th></tr></thead><tbody>${movements.map((item) => `<tr><td>${stamp(item.createdAt)}</td><td><span class="badge">${esc(item.kind)}</span></td><td>${esc(item.fuel.name)}</td><td>${fmt(item.physicalDeltaLiters, 6)}</td><td>${fmt(item.reservedDeltaLiters, 6)}</td><td>${fmt(item.litersAfter, 3)}</td><td>${fmt(item.reservedLitersAfter, 3)}</td><td>${esc(item.reservation?.operationId || '—')}</td><td>${esc(item.reason || '—')}</td></tr>`).join('') || '<tr><td colspan="9">No hay movimientos.</td></tr>'}</tbody></table></section>`;
  } catch (error) { showError(error); }
}

async function renderSupply(message = '') {
  loading('Preparando abastecimiento…');
  try { inventoryRows = await api(`/control/inventory${selectedStation ? `?stationId=${encodeURIComponent(selectedStation)}` : ''}`); }
  catch (error) { showError(error); return; }
  const pairs = inventoryRows;
  document.querySelector('#content').innerHTML = `${heading('SIMULACIÓN ACADÉMICA', 'Abastecimiento de inventario', 'Registra una recepción física y agrega un movimiento ADJUST_IN. No representa una compra real.')}<section class="panel form-panel"><form id="supply-form"><input type="hidden" name="requestId" value="${crypto.randomUUID()}"><label>Estación<select name="stationId" required>${pairs.map((row) => `<option value="${row.stationId}" ${row.stationId === selectedStation ? 'selected' : ''}>${esc(row.station.name)}</option>`).filter((value, index, array) => array.indexOf(value) === index).join('')}</select></label><label>Combustible<select name="fuelId" required>${pairs.map((row) => `<option value="${row.fuelId}" data-station="${row.stationId}">${esc(row.fuel.name)}</option>`).join('')}</select></label><label>Litros recibidos<input name="liters" type="number" inputmode="decimal" min="0.000001" max="1000000" step="0.000001" required></label><label>Referencia o nota (opcional)<input name="reference" maxlength="160" placeholder="Guía académica / recepción física"></label><p class="muted">Los litros reservados se mantienen sin cambios. El ledger registra el actor y el saldo resultante.</p><p class="success-message" role="status">${esc(message)}</p><p class="error" role="alert"></p><button class="primary" type="submit">Registrar abastecimiento</button></form></section>`;
  const form = document.querySelector('#supply-form');
  const station = form.elements.stationId;
  const fuel = form.elements.fuelId;
  function filterFuels() {
    const options = pairs.filter((pair) => pair.stationId === station.value);
    fuel.innerHTML = options.map((row) => `<option value="${row.fuelId}">${esc(row.fuel.name)}</option>`).join('');
  }
  station.addEventListener('change', filterFuels);
  filterFuels();
}

async function renderIncidents(filters = {}) {
  loading('Consultando incidencias…');
  const stationId = filters.stationId ?? selectedStation ?? (!session.global && session.stations.length === 1 ? session.stations[0].id : '');
  if (!stationId) { document.querySelector('#content').innerHTML = `${heading('SEGUIMIENTO', 'Incidencias')}${panel('Selecciona una estación autorizada para ver incidencias.')}`; return; }
  if (!canViewStation(session, stationId)) { document.querySelector('#content').innerHTML = `${heading('SEGUIMIENTO', 'Incidencias')}${panel('Estación fuera de tu alcance.', 'denied')}`; return; }
  try {
    const query = queryString({ stationId, status: filters.status });
    const rows = await api(`/control/incidents?${query}`);
    document.querySelector('#content').innerHTML = `${heading('SEGUIMIENTO', 'Incidencias', `${rows.length} registros en esta estación.`)}<form id="incident-filters" class="filter-bar"><label>Estado<select name="status"><option value="">Todos</option>${['OPEN','IN_REVIEW','RESOLVED','DISMISSED'].map((status) => `<option ${filters.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><button class="secondary">Filtrar</button></form><section class="panel table-wrap"><table><thead><tr><th>Tipo</th><th>Resumen</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr><td><span class="code">${esc(row.code.replaceAll('_', '-'))}</span></td><td>${esc(row.summary)}</td><td><span class="badge">${esc(row.status)}</span></td><td>${stamp(row.createdAt)}</td><td><button class="text-button" data-incident="${row.id}">Detalle</button></td></tr>`).join('') || '<tr><td colspan="5">No hay incidencias.</td></tr>'}</tbody></table></section><dialog id="incident-dialog"></dialog>`;
  } catch (error) { showError(error); }
}

async function renderAccounts() {
  loading('Consultando cuentas administrativas…');
  if (!session.global) { document.querySelector('#content').innerHTML = `${heading('ACCESO', 'Personal y accesos')}${panel('Solo SUPER_ADMIN puede aprobar y modificar grants.', 'denied')}`; return; }
  try {
    accountRows = await api('/control/accounts');
    document.querySelector('#content').innerHTML = `${heading('ACCESO ADMINISTRATIVO', 'Personal y accesos', 'Las asignaciones de Control son independientes de los turnos de Supervisor.')}<section class="panel table-wrap"><table><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Email</th><th>Estaciones</th><th>Grants activos</th><th>Acciones</th></tr></thead><tbody>${accountRows.map((row) => `<tr><td>${esc(row.user.name)}<small class="subcell">${esc(row.user.email)}</small></td><td>${esc(row.role)}</td><td><span class="badge">${esc(row.status)}</span></td><td>${row.emailVerifiedAt ? 'Verificado' : 'Pendiente'}</td><td>${row.stations.map((item) => esc(item.station.code)).join(', ') || '—'}</td><td><small>${row.grants.map((grant) => esc(grant.replace('ADMIN_', ''))).join(', ') || '—'}</small></td><td>${row.status === 'PENDING_APPROVAL' ? `<button class="text-button" data-edit-account="${row.user.id}">Aprobar</button><button class="text-button" data-account-status="REJECTED" data-user="${row.user.id}">Rechazar</button>` : row.status === 'APPROVED' ? `<button class="text-button" data-edit-account="${row.user.id}">Grants / estaciones</button><button class="text-button" data-account-status="DISABLED" data-user="${row.user.id}">Deshabilitar</button>` : row.status === 'DISABLED' && row.emailVerifiedAt ? `<button class="text-button" data-edit-account="${row.user.id}">Reactivar y configurar acceso</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="7">Sin cuentas administrativas.</td></tr>'}</tbody></table></section><dialog id="account-dialog"></dialog>`;
  } catch (error) { showError(error); }
}

async function renderAudit(filters = {}) {
  loading('Consultando auditoría…');
  try {
    const query = queryString({ stationId: filters.stationId ?? selectedStation, actorUserId: filters.actorUserId, action: filters.action, from: filters.from, to: filters.to });
    const rows = await api(`/control/audit${query ? `?${query}` : ''}`);
    document.querySelector('#content').innerHTML = `${heading('SOLO LECTURA', 'Auditoría', 'OperationalAuditEvent es append-only.')}<form id="audit-filters" class="filter-bar"><label>Actor (userId)<input name="actorUserId" value="${esc(filters.actorUserId || '')}" placeholder="UUID"></label><label>Acción<input name="action" value="${esc(filters.action || '')}" maxlength="80"></label>${dateInputs()}<button class="secondary">Filtrar</button></form><section class="panel table-wrap"><table><thead><tr><th>Fecha</th><th>Estación</th><th>Actor</th><th>Acción</th><th>Resultado</th><th>Destino</th><th>Contexto</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${stamp(row.createdAt)}</td><td>${esc(row.station?.name || 'Global')}</td><td>${esc(row.actorUser?.name || row.actorKind)}</td><td>${esc(row.action)}</td><td><span class="badge">${esc(row.outcome)}</span></td><td>${esc(row.targetId || row.terminal?.code || '—')}</td><td>${esc(JSON.stringify(row.details || {}))}</td></tr>`).join('') || '<tr><td colspan="7">No hay eventos.</td></tr>'}</tbody></table></section>`;
  } catch (error) { showError(error); }
}

async function renderView(view, filters = {}) {
  if (view === 'dashboard') return renderDashboard();
  if (view === 'operations') return renderOperations(filters);
  if (view === 'terminals') return renderTerminals();
  if (view === 'inventory') return renderInventory();
  if (view === 'movements') {
    if (!inventoryRows.length) inventoryRows = await api(`/control/inventory${selectedStation ? `?stationId=${encodeURIComponent(selectedStation)}` : ''}`);
    return renderMovements(filters);
  }
  if (view === 'supply') return renderSupply();
  if (view === 'incidents') return renderIncidents(filters);
  if (view === 'accounts') return renderAccounts();
  if (view === 'audit') return renderAudit(filters);
}

async function route(filters = {}) {
  const view = initialView(location.hash);
  const routeItem = nav.find(([id]) => id === view);
  if (!routeItem || (routeItem[2] && !has(routeItem[2])) || (view === 'accounts' && !session.global)) {
    app.innerHTML = `${heading('ACCESO', 'Acceso denegado')}${panel('Tu cuenta no tiene permiso para abrir esta sección.', 'denied')}`;
    return;
  }
  shell(view);
  try { await renderView(view, filters); }
  catch (error) { showError(error); }
}

async function boot() {
  const parts = location.hash.split('?');
  if (parts[0] === '#/verify') {
    try {
      const token = new URLSearchParams(parts[1] || '').get('token');
      if (!token) throw new Error('El enlace no contiene un token válido.');
      const result = await api('/control/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
      history.replaceState(null, '', `${location.pathname}${location.search}#login`);
      login(result.message);
    } catch (error) { login(incidentMessage(error)); }
    return;
  }
  if (location.hash === '#request-access') { requestAccess(); return; }
  try { session = await apiClient.session(); await route(); }
  catch (error) { session = null; login(error.status === 403 ? 'Esta cuenta no tiene acceso aprobado a Primax Control.' : 'Inicia sesión para continuar.'); }
}

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (busy) return;
  if (['login-form', 'request-form'].includes(form.id)) {
    event.preventDefault(); busy = true;
    const button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Validando…';
    try {
      if (form.id === 'request-form') {
        const result = await api('/control/access-requests', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        history.replaceState(null, '', `${location.pathname}${location.search}#login`); login(result.message);
      } else {
        session = await apiClient.login(Object.fromEntries(new FormData(form)));
        location.hash = '#dashboard'; await route();
      }
    } catch (error) { form.id === 'request-form' ? requestAccess(incidentMessage(error)) : login(incidentMessage(error)); }
    finally { busy = false; }
    return;
  }
  const filterViews = { 'operation-filters': renderOperations, 'movement-filters': renderMovements, 'incident-filters': renderIncidents, 'audit-filters': renderAudit };
  const filter = filterViews[form.id];
  if (filter) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    if (!values.stationId) values.stationId = selectedStation;
    await filter(values);
    return;
  }
  if (form.id === 'supply-form') {
    event.preventDefault(); busy = true;
    const button = form.querySelector('button[type="submit']'); button.disabled = true;
    const errorBox = form.querySelector('.error'); const successBox = form.querySelector('.success-message'); errorBox.textContent = '';
    try {
      const body = Object.fromEntries(new FormData(form));
      const result = await api('/control/inventory/receipts', { method: 'POST', body: JSON.stringify(body) });
      await renderSupply(`Recibidos ${fmt(result.movement.physicalDeltaLiters, 3)} L. Movimiento ${result.movement.id.slice(0, 8)} registrado${result.replayed ? ' (reintento idempotente)' : ''}.`);
    } catch (error) { errorBox.textContent = incidentMessage(error); button.disabled = false; }
    finally { busy = false; }
    return;
  }
  if (form.id === 'account-access-form') {
    event.preventDefault(); busy = true;
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      const userId = form.dataset.userId;
      const formData = new FormData(form);
      const body = { role: formData.get('role'), stationIds: formData.getAll('stationIds'), permissions: formData.getAll('permissions') };
      await api(`/control/accounts/${userId}/${form.dataset.mode === 'approve' ? 'approve' : 'access'}`, { method: 'POST', body: JSON.stringify(body) });
      document.querySelector('#account-dialog').close(); await renderAccounts();
    } catch (error) { form.querySelector('.error').textContent = incidentMessage(error); button.disabled = false; }
    finally { busy = false; }
  }
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.id === 'resend-link') {
    const email = window.prompt('Correo de la solicitud:'); if (!email) return;
    try { const result = await api('/control/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }); login(result.message); }
    catch (error) { login(incidentMessage(error)); }
    return;
  }
  if (target.dataset.operation) {
    try {
      const detail = await api(`/control/operations/${encodeURIComponent(target.dataset.operation)}`);
      const dialog = document.querySelector('#operation-dialog');
      dialog.innerHTML = `<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><p class="eyebrow">DETALLE DE OPERACIÓN</p><h2 class="mono">${esc(detail.operationId)}</h2><dl><dt>Estación</dt><dd>${esc(detail.station?.name || '—')}</dd><dt>Terminal / surtidor</dt><dd>${esc(detail.terminalOperation?.terminal?.code || '—')} / ${esc(detail.terminalOperation?.pump?.code || '—')}</dd><dt>Combustible</dt><dd>${esc(detail.fuel?.name || '—')}</dd><dt>Estado físico</dt><dd>${esc(detail.terminalOperation?.status || detail.authorization?.status || '—')}</dd><dt>Estado financiero</dt><dd>${esc(detail.payment?.status || detail.transaction?.status || '—')}</dd><dt>Pago / reembolso</dt><dd>${detail.payment ? `${fmt(detail.payment.amount)} · reembolsado ${fmt(detail.payment.refundedAmount)}` : '—'}</dd><dt>Despacho</dt><dd>${fmt(detail.authorization?.dispensedGallons, 3)} gal · ${fmt(detail.authorization?.dispensedAmount)} PEN</dd><dt>Reserva</dt><dd>${detail.reservation ? `${esc(detail.reservation.status)} · inicial ${fmt(detail.reservation.initialLiters, 3)} L · pendiente ${fmt(detail.reservation.remainingLiters, 3)} L` : '—'}</dd><dt>Incidencia</dt><dd>${detail.incident ? `${esc(detail.incident.code)} · ${esc(detail.incident.status)}` : '—'}</dd></dl><h3>Movimientos de la reserva</h3><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Δ físico L</th><th>Δ reservado L</th><th>Físico luego</th></tr></thead><tbody>${(detail.reservation?.movements || []).map((move) => `<tr><td>${stamp(move.createdAt)}</td><td>${esc(move.kind)}</td><td>${fmt(move.physicalDeltaLiters, 6)}</td><td>${fmt(move.reservedDeltaLiters, 6)}</td><td>${fmt(move.litersAfter, 3)}</td></tr>`).join('') || '<tr><td colspan="5">Sin movimientos de reserva.</td></tr>'}</tbody></table></div>`;
      dialog.showModal();
    } catch (error) { window.alert(incidentMessage(error)); }
  }
  if (target.dataset.incident) {
    try {
      const detail = await api(`/control/incidents/${encodeURIComponent(target.dataset.incident)}`);
      const isInc001 = detail.code === 'INC_001';
      const dialog = document.querySelector('#incident-dialog');
      dialog.innerHTML = `<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><p class="eyebrow">${esc(detail.code.replaceAll('_', '-'))}</p><h2>${esc(detail.summary)}</h2><p>${esc(detail.status.replaceAll('_', ' '))}</p>${isInc001 ? '<section class="incident-notice"><strong>Pago confirmado · despacho cero · operación detenida.</strong><br>Resolver esta incidencia no reembolsa el pago.</section>' : ''}<dl><dt>Operación</dt><dd>${esc(detail.operationId || '—')}</dd><dt>Pago</dt><dd>${esc(detail.payment?.status || '—')} ${detail.payment ? `· ${fmt(detail.payment.amount)} · reembolso ${fmt(detail.payment.refundedAmount)}` : ''}</dd><dt>Despacho</dt><dd>${esc(detail.authorization?.dispensedAmount ?? '—')} PEN · ${esc(detail.authorization?.dispensedGallons ?? '—')} gal</dd><dt>Resolución</dt><dd>${esc(detail.resolution || 'Pendiente')}</dd></dl>${has('ADMIN_INCIDENT_MANAGE') && ['OPEN','IN_REVIEW'].includes(detail.status) ? `<div class="actions">${detail.status === 'OPEN' ? '<button class="secondary" data-incident-status="IN_REVIEW">Iniciar revisión</button>' : '<button class="primary" data-incident-status="RESOLVED">Resolver</button>'}<button class="quiet" data-incident-status="DISMISSED">Descartar</button></div>` : ''}`;
      dialog.showModal();
      dialog.querySelectorAll('[data-incident-status]').forEach((button) => button.addEventListener('click', async () => {
        const reason = button.dataset.incidentStatus === 'IN_REVIEW' ? 'Revisión administrativa iniciada' : window.prompt('Motivo de resolución o descarte:');
        if (!reason) return; button.disabled = true;
        try { await api(`/control/incidents/${detail.id}/status`, { method: 'POST', body: JSON.stringify({ status: button.dataset.incidentStatus, reason }) }); dialog.close(); await renderIncidents(); }
        catch (error) { window.alert(incidentMessage(error)); button.disabled = false; }
      }));
    } catch (error) { window.alert(incidentMessage(error)); }
  }
  if (target.dataset.terminalAction) {
    const prompt = target.dataset.terminalAction === 'RESTORE' ? 'Restaurar dejará la terminal bloqueada hasta que Supervisor la habilite. ¿Continuar?' : 'Marcar fuera de servicio impedirá nuevas habilitaciones. ¿Continuar?';
    if (!window.confirm(prompt)) return;
    target.disabled = true;
    try { await api(`/control/terminals/${target.dataset.terminalId}/status`, { method: 'POST', body: JSON.stringify({ action: target.dataset.terminalAction }) }); await renderTerminals(); }
    catch (error) { target.disabled = false; window.alert(incidentMessage(error)); }
  }
  if (target.dataset.inspectPair || target.dataset.reconcile) {
    const pair = (target.dataset.inspectPair || target.dataset.reconcile).split(':');
    try {
      if (target.dataset.reconcile) {
        if (!window.confirm('Conciliar inspecciona el ledger y compromisos legacy; no ajustará los litros físicos. ¿Continuar?')) return;
        target.disabled = true;
        const result = await api(`/control/inventory/${pair[0]}/${pair[1]}/reconcile`, { method: 'POST' });
        window.alert(`Conciliación terminada: ${result.status}. Incidencias de ledger: ${result.issues.length}.`);
        await renderInventory();
      } else {
        const report = await api(`/control/inventory/${pair[0]}/${pair[1]}/reconciliation`);
        const dialog = document.querySelector('#reconciliation-dialog');
        dialog.innerHTML = `<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><p class="eyebrow">CONCILIACIÓN · SOLO INSPECCIÓN</p><h2>${esc(report.status)}</h2><p>${esc(report.reason || 'Sin razón de revisión registrada')}</p><dl><dt>Físico</dt><dd>${esc(report.physicalLiters)} L</dd><dt>Reservado</dt><dd>${esc(report.reservedLiters)} L</dd><dt>Disponible</dt><dd>${esc(report.availableLiters)} L</dd><dt>Reservas abiertas</dt><dd>${esc(report.openReservationLiters)} L</dd><dt>Movimientos</dt><dd>${report.movementCount}</dd></dl><h3>Hallazgos</h3><ul>${report.issues.map((issue) => `<li class="mono">${esc(issue)}</li>`).join('') || '<li>Sin hallazgos.</li>'}</ul><p class="muted">La inspección no modifica el stock físico.</p>`;
        dialog.showModal();
      }
    } catch (error) { if (target.dataset.reconcile) target.disabled = false; window.alert(incidentMessage(error)); }
  }
  if (target.dataset.editAccount) {
    const account = accountRows.find((row) => row.user.id === target.dataset.editAccount); if (!account) return;
    const dialog = document.querySelector('#account-dialog');
    const currentStations = account.stations.map((item) => item.stationId);
    const currentPermissions = account.grants || [];
    const grantOptions = session.permissions.filter((permission) => permission.startsWith('ADMIN_'));
    dialog.innerHTML = `<form id="account-access-form" data-user-id="${account.user.id}" data-mode="${account.status === 'PENDING_APPROVAL' ? 'approve' : 'update'}"><button type="button" class="close" data-close-account aria-label="Cerrar">×</button><p class="eyebrow">GRANTS Y ALCANCE</p><h2>${account.status === 'PENDING_APPROVAL' ? 'Aprobar cuenta' : 'Actualizar cuenta'}</h2><p>${esc(account.user.name)} · ${esc(account.user.email)}</p><label>Rol<select name="role"><option value="ENCARGADO" ${account.role === 'ENCARGADO' ? 'selected' : ''}>ENCARGADO</option><option value="ADMIN" ${account.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option></select></label><h3>Estaciones permitidas</h3><div class="check-list">${session.stations.map((station) => `<label><input type="checkbox" name="stationIds" value="${station.id}" ${currentStations.includes(station.id) ? 'checked' : ''}>${esc(station.name)} · ${esc(station.code)}</label>`).join('')}</div><h3>Permisos</h3><div class="check-list">${grantOptions.map((permission) => `<label><input type="checkbox" name="permissions" value="${permission}" ${currentPermissions.includes(permission) || ['ADMIN_CONTROL_ACCESS','ADMIN_DASHBOARD_VIEW'].includes(permission) ? 'checked' : ''} ${['ADMIN_CONTROL_ACCESS','ADMIN_DASHBOARD_VIEW'].includes(permission) ? 'required' : ''}>${esc(permission)}</label>`).join('')}</div><p class="error" role="alert"></p><button class="primary" type="submit">Guardar acceso</button></form>`;
    dialog.showModal();
  }
  if (target.dataset.closeAccount !== undefined) document.querySelector('#account-dialog')?.close();
  if (target.dataset.accountStatus) {
    const isReject = target.dataset.accountStatus === 'REJECTED';
    const reason = window.prompt(isReject ? 'Motivo del rechazo:' : 'Motivo para deshabilitar:');
    if (!reason) return;
    try { await api(`/control/accounts/${target.dataset.user}/${isReject ? 'reject' : 'disable'}`, { method: 'POST', body: JSON.stringify({ reason }) }); await renderAccounts(); }
    catch (error) { window.alert(incidentMessage(error)); }
  }
});

window.addEventListener('hashchange', () => { if (session) void route(); else if (location.hash === '#request-access') requestAccess(); else if (location.hash === '#login' || !location.hash) login(); });
void boot();
