(function (F) {
'use strict';
const { state, $ } = F;
const { MONTO_MIN, MONTO_MAX, BILLETES, MONEDAS, LOCALE_IDIOMA } = F.config;
const detenerProgresoAyuda = (...args) => F.detenerProgresoAyuda(...args);
const hablar = (...args) => F.hablar(...args);
const refrescarAdmin = (...args) => F.refrescarAdmin(...args);
const t = (...args) => F.t(...args);
const mostrarPantalla = (...args) => F.mostrarPantalla(...args);
const actualizarEstado = (...args) => F.actualizarEstado(...args);
const mostrarModal = (...args) => F.mostrarModal(...args);

function iniciar() {
  if (!state.transactionId) state.transactionId = F.newId();
  hablar(t('voz_bienvenida')); mostrarPantalla('pantalla-combustible');
}

function seleccionarCombustible(nombre, precio, tarjeta) {
  if (state.busy) return;
  const fuel = F.catalog.find(item => item.nombre === nombre);
  if (!fuel) return;
  F.operations.cancel();
  if (state.combustible?.nombre !== nombre) F.invalidatePurchase();
  document.querySelectorAll('.fuel-card').forEach(card => card.classList.toggle('selected', card === tarjeta));
  state.combustible = { nombre: fuel.nombre, precio: fuel.precio };
  $('resumen-fuel-mini').textContent = `${nombre} · S/ ${fuel.precio.toFixed(2)}`;
  hablar(t('voz_seleccion', { fuel: nombre }));
  F.operations.later(() => mostrarPantalla('pantalla-pago'), 900);
}

function elegirModalidad(modo) {
  if (state.busy) return;
  if (state.modalidad !== modo) F.invalidatePurchase();
  state.modalidad = modo;
  $('btn-prepago').classList.toggle('selected', modo === 'PREPAGO');
  $('btn-postpago').classList.toggle('selected', modo === 'POSTPAGO');
  const esPre = modo === 'PREPAGO';
  $('prepago-panel').classList.toggle('hidden', !esPre);
  $('btn-confirmar-monto').classList.toggle('hidden', !esPre);
  $('btn-postpago-continuar').classList.toggle('hidden', esPre);
  F.updateProgress();
  if (!esPre) hablar(t('voz_postpago'));
  else $('prepago-panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function actualizarMontoDisplay() {
  const n = parseFloat(state.montoTexto || '0');
  $('monto-display').textContent = 'S/ ' + (isNaN(n) ? 0 : n).toFixed(2);
}

// Teclado numérico virtual
function teclaPresionada(key) {
  $('monto-error').classList.add('hidden');
  if (key === 'C') { state.montoTexto = ''; }
  else if (key === '←') { state.montoTexto = state.montoTexto.slice(0, -1); }
  else if (/^[0-9]$/.test(key)) {
    if (state.montoTexto.replace('.', '').length >= 5) return; // evita montos absurdos
    state.montoTexto += key;
  }
  actualizarMontoDisplay();
}

function validarYConfirmarMonto() {
  const monto = parseFloat(state.montoTexto || '0');
  const err = $('monto-error');
  if (!F.validation.amount(monto)) {
    err.textContent = t('err_monto', { min: MONTO_MIN, max: MONTO_MAX });
    err.classList.remove('hidden');
    hablar(t('voz_monto_invalido'));
    return;
  }
  state.montoPrepago = Math.round(monto * 100) / 100;
  hablar(t('voz_monto_ok', { monto: state.montoPrepago }));
  irAComprobante();
}

// ---------- Prepago: tipo de comprobante ----------
function irAComprobante() {
  $('resumen-doc-mini').textContent = state.tipoComprobante ? t(state.tipoComprobante === 'FACTURA' ? 'doc_factura' : 'doc_boleta') : '—';
  mostrarPantalla('pantalla-comprobante'); hablar(t('voz_doc'));
}

function elegirComprobante(tipo) {
  if (state.tipoComprobante !== tipo) {
    state.dni = ''; state.ruc = ''; state.razonSocial = ''; state.metodoPago = null;
    ['input-dni', 'input-ruc', 'input-razon'].forEach(id => $(id).value = '');
  }
  state.tipoComprobante = tipo;
  $('btn-boleta').classList.toggle('selected', tipo === 'BOLETA');
  $('btn-factura').classList.toggle('selected', tipo === 'FACTURA');
  $('resumen-doc-mini').textContent = t(tipo === 'BOLETA' ? 'doc_boleta' : 'doc_factura');
  irADatos();
}

function irADatos() {
  const esFactura = state.tipoComprobante === 'FACTURA';
  $('panel-dni').classList.toggle('hidden', esFactura);
  $('panel-ruc').classList.toggle('hidden', !esFactura);
  $('prep-mini-doc').textContent = esFactura ? t('doc_factura') : t('doc_boleta');
  $('prep-mini-fuel').textContent = state.combustible
    ? `${state.combustible.nombre} (S/ ${state.combustible.precio.toFixed(2)})` : '—';
  $('prep-mini-monto').textContent = 'S/ ' + state.montoPrepago.toFixed(2);
  ['dni-error', 'ruc-error', 'razon-error', 'prep-placa-error', 'prep-codigo-error'].forEach((id) =>
    $(id).classList.add('hidden'));
  mostrarPantalla('pantalla-datos');
  hablar(esFactura ? t('voz_datos_factura') : t('voz_datos_boleta'));
}

function irAIdentificacion() {
  // Rellena el mini resumen antes de mostrar
  $('mini-fuel').textContent = state.combustible ? `${state.combustible.nombre} (S/ ${state.combustible.precio.toFixed(2)})` : '—';
  $('mini-modalidad').textContent = state.modalidad || '—';
  $('mini-monto').textContent = state.modalidad === 'PREPAGO' ? 'S/ ' + state.montoPrepago.toFixed(2) : t('mini_post');
  mostrarPantalla('pantalla-identificacion');
  hablar(t('voz_ingrese_placa'));
}

// ---------- Identificación / membresía ----------
function normalizarPlaca(v) { return F.validation.normalizePlate(v); }
function placaValida(v) { return F.plateService.validate(v); }
function formatearPlaca(v) { return F.validation.formatPlate(v); }

function continuarIdentificacion() {
  const placaRaw = $('input-placa').value;
  const errP = $('placa-error');
  if (!placaRaw.trim()) {
    errP.textContent = t('err_placa_vacia');
    errP.classList.remove('hidden'); return;
  }
  if (!placaValida(placaRaw)) {
    errP.textContent = t('err_placa_formato');
    errP.classList.remove('hidden');
    hablar(t('voz_placa_invalida'));
    return;
  }
  errP.classList.add('hidden');
  state.placa = formatearPlaca(placaRaw);
  state.esMiembro = $('check-membresia').checked;

  if (state.esMiembro) {
    const cod = $('input-codigo').value.trim();
    const errC = $('codigo-error');
    if (!cod) {
      errC.textContent = t('err_codigo');
      errC.classList.remove('hidden'); return;
    }
    errC.classList.add('hidden');
    state.codigoCliente = cod.toUpperCase();
  } else { state.codigoCliente = ''; }

  procesarPago();
}

// Simula la cámara ANPR rellenando una placa aleatoria
// ids: { input, cam } → permite reutilizarlo en el paso de prepago
async function simularCamara(ids = { input: 'input-placa', cam: 'cam-plate' }) {
  const screen = state.screen;
  const placa = await F.plateService.simulateRead();
  if (screen !== state.screen) return;
  $(ids.input).value = placa; $(ids.cam).textContent = placa;
  hablar(t('voz_camara', { placa: placa.split('').join(' ') }));
}

// ---------- Procesamiento de pago ----------
async function procesarPago() {
  if (state.busy || !['pantalla-metodo', 'pantalla-identificacion'].includes(state.screen)) return;
  state.busy = true;
  mostrarPantalla('pantalla-procesamiento');
  F.renderProcessing();
  hablar(t(state.modalidad === 'PREPAGO' ? 'voz_proc_pre' : 'voz_proc_post'));
  const token = F.operations.generation;
  try {
    const request = { id: state.transactionId, amount: state.montoPrepago, method: state.metodoPago };
    const payment = await F.paymentService[state.modalidad === 'PREPAGO' ? 'confirm' : 'authorize'](request);
    if (token !== F.operations.generation) return;
    state.pagoAutorizado = true; state.pago = payment;
    state.pagoEstado = state.modalidad === 'PREPAGO' ? 'Pagado' : 'Pendiente';
    hablar(t('voz_autorizado'));
    mostrarModal(t('modal_pago_t'), t('modal_pago_m'), '✅', () => { state.busy = false; simularDespacho(); });
  } catch (error) {
    state.busy = false;
    mostrarPantalla(state.modalidad === 'PREPAGO' ? 'pantalla-metodo' : 'pantalla-identificacion');
    F.showError(error);
  }
}

// ---------- Simulación de despacho ----------
function pintarInfoDespacho() {
  const esPre = state.modalidad === 'PREPAGO';
  $('despacho-info').textContent = esPre
    ? t('info_prepago', { monto: state.montoPrepago.toFixed(2) })
    : t('info_postpago');
}

async function simularDespacho() {
  if (state.screen !== 'pantalla-procesamiento' || !state.pagoAutorizado || state.despachoTimer) return;
  state.litros = 0; state.total = 0; state.ultimoAnuncioLitros = 0; state.stopped = false;
  $('btn-detener').disabled = false;
  $('precio-count').textContent = 'S/ ' + state.combustible.precio.toFixed(2);
  $('despacho-titulo').textContent = t('despacho_title', { fuel: state.combustible.nombre });
  const esPre = state.modalidad === 'PREPAGO';
  $('meta-prepago').classList.toggle('hidden', !esPre);
  $('meta-monto').textContent = 'S/ ' + state.montoPrepago.toFixed(2);
  pintarInfoDespacho(); mostrarPantalla('pantalla-despacho'); actualizarEstado(t('step_live'));
  state.despachoTimer = F.fuelService.subscribe(snapshot => {
    if (state.screen !== 'pantalla-despacho') return;
    state.litros = snapshot.litros; state.total = snapshot.total;
    pintarDespacho(esPre);
    if (snapshot.automatic) { detenerDespacho(true); return; }
    if (Math.floor(state.litros) - state.ultimoAnuncioLitros >= 10) {
      state.ultimoAnuncioLitros = Math.floor(state.litros);
      hablar(t('voz_litros', { n: state.ultimoAnuncioLitros }));
    }
  });
  await F.fuelService.startDispense({ id: state.transactionId, price: state.combustible.precio, target: esPre ? state.montoPrepago : null });
}

function pintarDespacho(esPre) {
  $('litros-count').textContent = state.litros.toFixed(2) + ' L';
  $('soles-count').textContent = 'S/ ' + state.total.toFixed(2);
  let pct;
  if (esPre) pct = Math.min(100, (state.total / state.montoPrepago) * 100);
  else pct = Math.min(100, (state.litros / 60) * 100); // 60 L = tanque referencial
  $('despacho-bar').style.width = pct + '%';
  $('dispatch-progress').setAttribute('aria-valuenow', Math.floor(pct));
  $('fuel-level').style.height = pct + '%';
  $('despacho-pct').textContent = Math.floor(pct) + '%';
}

async function detenerDespacho(automatico = false) {
  if (state.stopped || state.screen !== 'pantalla-despacho') return;
  if (state.litros <= 0) { mostrarModal(t('modal_sincarga_t'), t('modal_sincarga_m'), '⚠️'); return; }
  state.stopped = true; $('btn-detener').disabled = true;
  if (state.despachoTimer) state.despachoTimer(); state.despachoTimer = null;
  await F.fuelService.stopDispense();
  hablar(automatico ? t('voz_prepago_listo') : t('voz_detenida'));
  F.operations.later(mostrarResumen, 700);
}

// ---------- Resumen final / ticket ----------
function calcularTotales() { return F.totals(state.litros, state.combustible.precio, state.esMiembro); }

async function mostrarResumen() {
  if (state.busy) return;
  state.busy = true;
  try {
    const { subtotal, descuento, total } = calcularTotales();
    const result = await F.transactionService.save({
      id: state.transactionId, hora: new Date().toLocaleTimeString(LOCALE_IDIOMA[state.idioma], { hour: '2-digit', minute: '2-digit' }),
      placa: state.placa, combustible: state.combustible.nombre, precio: state.combustible.precio,
      litros: state.litros, subtotal, descuento, monto: total, estado: state.pagoEstado,
      modalidad: state.modalidad, montoPrepago: state.montoPrepago, tipoComprobante: state.tipoComprobante || 'BOLETA',
      cliente: { dni: state.dni || null, ruc: state.ruc || null, razonSocial: state.razonSocial || null },
      esMiembro: state.esMiembro, codigoCliente: state.codigoCliente, pago: state.pago,
    });
    state.transaction = result.transaction;
    state.busy = false; mostrarPantalla('pantalla-resumen'); F.renderSummary();
    refrescarAdmin(); hablar(t('voz_ticket', { doc: t(state.tipoComprobante === 'FACTURA' ? 'doc_factura' : 'doc_boleta') }));
    if (!result.persisted) F.storageNotice();
  } catch (error) { state.busy = false; F.showError(error); }
}

// Botón PAGAR AHORA (solo postpago): simula cobro final
async function pagarAhora() {
  if (state.busy || state.pagoEstado === 'Pagado' || !state.transaction) return;
  state.busy = true; mostrarPantalla('pantalla-procesamiento'); F.renderProcessing();
  hablar(t('voz_proc_pre'));
  const token = F.operations.generation;
  try {
    const payment = await F.paymentService.confirm({ id: state.transactionId, amount: state.transaction.monto, method: null });
    if (token !== F.operations.generation) return;
    const result = await F.transactionService.updatePayment(state.transactionId, payment);
    state.transaction = result.transaction; state.pagoEstado = payment.estado; state.pago = payment;
    state.busy = false; mostrarPantalla('pantalla-resumen'); F.renderSummary(); refrescarAdmin();
    mostrarModal(t('modal_pagook_t'), t('modal_pagook_m'), '✅'); hablar(t('voz_pago_recibido'));
    if (!result.persisted) F.storageNotice();
  } catch (error) { state.busy = false; mostrarPantalla('pantalla-resumen'); F.showError(error); }
}

// Comprobante: vista previa + descarga .txt real (funciona con file://)
async function generarComprobante() {
  if (!state.transaction) return;
  state.receipt = await F.receiptService.build(state.transaction);
  $('comprobante-text').textContent = state.receipt.text;
  if (!F.dialogs.isOpen('ticket-overlay')) F.dialogs.open('ticket-overlay');
}
async function descargarTxt() {
  if (state.receipt) await F.receiptService.exportText(state.receipt, state.placa);
}

// Reinicia toda la aplicación al estado inicial
function finalizar() {
  F.operations.cancel();
  if (state.despachoTimer) state.despachoTimer();
  F.fuelService.stopDispense(); detenerProgresoAyuda();
  Object.assign(state, F.freshPurchase(), { pago: null, receipt: null });
  document.querySelectorAll('.fuel-card,.pay-card,.chip').forEach(control => control.classList.remove('selected'));
  document.querySelectorAll('.form-card input').forEach(input => { input.value = ''; input.checked = false; });
  document.querySelectorAll('.error').forEach(error => error.classList.add('hidden'));
  ['membresia-panel', 'prep-membresia-panel', 'panel-ruc', 'panel-qr', 'panel-nfc', 'panel-efectivo', 'ef-ok', 'prepago-panel', 'btn-postpago-continuar', 'btn-confirmar-monto'].forEach(id => $(id).classList.add('hidden'));
  $('panel-dni').classList.remove('hidden'); $('btn-nfc-tap').disabled = false;
  actualizarMontoDisplay(); mostrarPantalla('pantalla-inicio', true); F.syncErrors();
  hablar(t('voz_sesion')); actualizarEstado(t('status_listo'));
}

/* ============================================================================
 * 6b. PREPAGO: TIPO DE COMPROBANTE → DATOS → MÉTODO DE PAGO
 *     Solo aplica al flujo PREPAGO; el POSTPAGO sigue igual.
 * ========================================================================== */

// ---------- Validadores de documento ----------
function dniValido(v) { return F.validation.dni(v); }
function rucValido(v) { return F.validation.ruc(v); }

// ---------- Confirma DNI/RUC + placa ----------
function continuarDatos() {
  const err = (id, texto) => { $(id).textContent = texto; $(id).classList.remove('hidden'); };
  const ok = (id) => $(id).classList.add('hidden');
  let valido = true;

  // Documento según el tipo de comprobante elegido
  if (state.tipoComprobante === 'FACTURA') {
    const ruc = $('input-ruc').value.trim();
    const razon = $('input-razon').value.trim();
    if (!rucValido(ruc)) { err('ruc-error', t('err_ruc')); valido = false; } else ok('ruc-error');
    if (!razon) { err('razon-error', t('err_razon')); valido = false; } else ok('razon-error');
    state.ruc = ruc; state.razonSocial = razon;
  } else {
    const dni = $('input-dni').value.trim();
    if (!dniValido(dni)) { err('dni-error', t('err_dni')); valido = false; } else ok('dni-error');
    state.dni = dni;
  }

  // Placa del vehículo
  const placaRaw = $('prep-input-placa').value;
  if (!placaRaw.trim()) { err('prep-placa-error', t('err_placa_vacia')); valido = false; }
  else if (!placaValida(placaRaw)) {
    err('prep-placa-error', t('err_placa_formato')); valido = false;
    hablar(t('voz_placa_invalida'));
  }
  else ok('prep-placa-error');

  // Membresía (descuento 5 %)
  state.esMiembro = $('prep-check-membresia').checked;
  if (state.esMiembro) {
    const cod = $('prep-input-codigo').value.trim();
    if (!cod) { err('prep-codigo-error', t('err_codigo')); return; }
    ok('prep-codigo-error');
    state.codigoCliente = cod.toUpperCase();
  } else { state.codigoCliente = ''; }

  if (!valido) return;

  state.placa = formatearPlaca(placaRaw);
  hablar(t('voz_datos_ok'));
  irAMetodoPago();
}

// ---------- Pantalla de método de pago ----------
function irAMetodoPago() {
  state.metodoPago = null;
  state.efectivoIngresado = 0;
  state.efectivoPila = [];
  $('metodo-monto').textContent = 'S/ ' + state.montoPrepago.toFixed(2);
  document.querySelectorAll('[data-metodo]').forEach((b) => b.classList.remove('selected'));
  ['panel-qr', 'panel-nfc', 'panel-efectivo'].forEach((id) => $(id).classList.add('hidden'));
  pintarEfectivo();
  mostrarPantalla('pantalla-metodo');
  // No se habla aquí: continuarDatos() ya anunció "ahora seleccione su método de pago"
}

function elegirMetodoPago(metodo) {
  if (state.busy) return;
  F.operations.cancel();
  $('btn-nfc-tap').disabled = false;
  state.metodoPago = metodo;
  document.querySelectorAll('[data-metodo]').forEach((b) =>
    b.classList.toggle('selected', b.dataset.metodo === metodo));
  ['panel-qr', 'panel-nfc', 'panel-efectivo'].forEach((id) => $(id).classList.add('hidden'));
  $('btn-nfc-tap').disabled = false;

  if (metodo === 'YAPE' || metodo === 'PLIN') {
    $('panel-qr').classList.remove('hidden');
    $('qr-titulo').textContent = metodo === 'YAPE' ? t('m_yape') : t('m_plin');
    $('qr-msg').textContent = t('qr_msg', {
      app: metodo === 'YAPE' ? 'Yape' : 'Plin',
      monto: state.montoPrepago.toFixed(2),
    });
    pintarQR($('qr-code'), metodo + '|' + state.montoPrepago + '|' + state.placa);
    hablar(t('voz_metodo_sel', { metodo }));
  } else if (metodo === 'TARJETA') {
    $('panel-nfc').classList.remove('hidden');
    $('nfc-zone').classList.remove('tap');
    $('nfc-msg').textContent = t('nfc_hint');
    hablar(t('voz_nfc'));
  } else {
    $('panel-efectivo').classList.remove('hidden');
    hablar(t('voz_efectivo'));
  }
  const panel = ['YAPE', 'PLIN'].includes(metodo) ? 'panel-qr' : metodo === 'TARJETA' ? 'panel-nfc' : 'panel-efectivo';
  $(panel).scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/** Vuelve a la lista de métodos dejando el panel abierto cerrado. */
function volverAMetodos() {
  F.operations.cancel(); state.metodoPago = null;
  ['panel-qr', 'panel-nfc', 'panel-efectivo'].forEach(id => $(id).classList.add('hidden'));
  $('btn-nfc-tap').disabled = false;
  document.querySelectorAll('[data-metodo]').forEach(button => button.classList.remove('selected'));
}

// ---------- Yape / Plin: QR ----------
/** Dibuja un QR decorativo (21x21 con 3 patrones de localización) según una semilla. */
function pintarQR(el, semilla) {
  const N = 21;
  let s = 2166136261 >>> 0;
  for (let i = 0; i < semilla.length; i++) { s ^= semilla.charCodeAt(i); s = Math.imul(s, 16777619) >>> 0; }
  const aleatorio = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 13) & 1; };
  const enFinder = (f, g) => {
    const esquina = (oa, ob) => f >= oa && f < oa + 7 && g >= ob && g < ob + 7;
    if (!esquina(0, 0) && !esquina(0, N - 7) && !esquina(N - 7, 0)) return false;
    const a = f < 7 ? f : f - (N - 7);
    const b = g < 7 ? g : g - (N - 7);
    const d = Math.max(Math.abs(a - 3), Math.abs(b - 3));
    return d === 3 || d <= 1;   // anillo exterior + centro 3x3
  };
  let d = '';
  for (let f = 0; f < N; f++) {
    for (let g = 0; g < N; g++) {
      if (enFinder(f, g) || aleatorio()) d += `M${g} ${f}h1v1h-1z`;
    }
  }
  el.innerHTML =
    `<svg viewBox="-2 -2 ${N + 4} ${N + 4}" width="100%" height="100%" shape-rendering="crispEdges">` +
    `<rect x="-2" y="-2" width="${N + 4}" height="${N + 4}" fill="#ffffff"/>` +
    `<path d="${d}" fill="#171b2e"/></svg>`;
}

function confirmarPagoQR() {
  hablar(t('voz_pago_qr_ok'));
  procesarPago();
}

// ---------- Tarjeta: contactless NFC ----------
function confirmarPagoNFC() {
  if ($('btn-nfc-tap').disabled || state.busy) return;
  $('btn-nfc-tap').disabled = true; $('nfc-zone').classList.add('tap');
  $('nfc-msg').textContent = t('nfc_ok'); hablar(t('voz_nfc_ok'));
  F.operations.later(procesarPago, 900);
}

// ---------- Efectivo: billetes y monedas ----------
function soles(n) { return 'S/ ' + n.toFixed(2); }

function pintarEfectivo() {
  // Botones de billetes y monedas (se generan una sola vez)
  const mk = (contenedor, lista, etiqueta) => {
    if (contenedor.childElementCount) return;
    lista.forEach((v) => {
      const b = document.createElement('button');
      b.className = 'chip chip-dinero';
      b.type = 'button';
      b.dataset.valor = v;
      b.textContent = etiqueta(v);
      b.addEventListener('click', () => insertarEfectivo(v));
      contenedor.appendChild(b);
    });
  };
  mk($('ef-billetes'), BILLETES, (v) => soles(v));
  mk($('ef-monedas'), MONEDAS, (v) => soles(v));
  actualizarEfectivo();
}

function insertarEfectivo(valor) {
  state.efectivoPila.push(valor);
  state.efectivoIngresado = Math.round((state.efectivoIngresado + valor) * 100) / 100;
  $('ef-error').classList.add('hidden');
  actualizarEfectivo();
}

/** "Devolver" saca el último billete o moneda insertado. */
function retirarEfectivo() {
  const ultimo = state.efectivoPila.pop();
  if (ultimo === undefined) return;
  state.efectivoIngresado = Math.max(0, Math.round((state.efectivoIngresado - ultimo) * 100) / 100);
  actualizarEfectivo();
}

function actualizarEfectivo() {
  const falta = Math.max(0, Math.round((state.montoPrepago - state.efectivoIngresado) * 100) / 100);
  $('ef-total').textContent = soles(state.efectivoIngresado);
  $('ef-faltante').textContent = soles(falta);
  $('ef-ok').classList.toggle('hidden', falta > 0);
  $('btn-ef-retirar').disabled = state.efectivoPila.length === 0;
  $('btn-ef-confirmar').disabled = falta > 0;
  $('btn-ef-confirmar').classList.toggle('btn-disabled', falta > 0);
}

function confirmarPagoEfectivo() {
  if (state.efectivoIngresado < state.montoPrepago) {
    $('ef-error').textContent = t('err_ef_incompleto', { falta: soles(Math.max(0, Math.round((state.montoPrepago - state.efectivoIngresado) * 100) / 100)) });
    $('ef-error').classList.remove('hidden');
    hablar(t('voz_ef_incompleto'));
    return;
  }
  const cambio = Math.round((state.efectivoIngresado - state.montoPrepago) * 100) / 100;
  hablar(t('voz_ef_ok', { cambio: soles(cambio) }));
  procesarPago();
}

/* ============================================================================
 * 7. PANEL ADMIN
 * ========================================================================== */

function invalidatePurchase() {
  Object.assign(state, { tipoComprobante: null, metodoPago: null, pagoAutorizado: false, pagoEstado: 'Pendiente',
    transaction: null, pago: null, dni: '', ruc: '', razonSocial: '', efectivoIngresado: 0, efectivoPila: [] });
  document.querySelectorAll('[data-metodo],#btn-boleta,#btn-factura').forEach(button => button.classList.remove('selected'));
  ['panel-qr','panel-nfc','panel-efectivo'].forEach(id => $(id).classList.add('hidden'));
}
function renderProcessing() {
  const postAuthorization = state.modalidad === 'POSTPAGO' && !state.transaction;
  document.querySelector('#pantalla-procesamiento h2').textContent = t(postAuthorization ? 'authorize_title' : 'proc_title');
  document.querySelector('#pantalla-procesamiento .hint').textContent = t('simulation');
}
function renderSummary() {
  const tx = state.transaction;
  if (!tx) return;
  const doc = tx.tipoComprobante === 'FACTURA';
  const values = {
    't-placa': tx.placa + (tx.esMiembro ? ' ' + t('miembro_tag') : ''),
    't-doc': t(doc ? 'doc_factura_full' : 'doc_boleta_full'),
    't-docnum': doc ? `RUC ${tx.cliente.ruc || '—'} · ${tx.cliente.razonSocial || '—'}` : `DNI ${tx.cliente.dni || '—'}`,
    't-fuel': tx.combustible, 't-litros': `${tx.litros.toFixed(2)} L`, 't-precio': soles(tx.precio),
    't-subtotal': soles(tx.subtotal), 't-descuento': (tx.esMiembro ? '- ' : '') + soles(tx.descuento), 't-total': soles(tx.monto),
    't-modalidad': t(tx.modalidad === 'PREPAGO' ? 'prepago' : 'postpago') + (tx.modalidad === 'PREPAGO' ? ` (${soles(tx.montoPrepago)})` : ''),
    't-estado': t(tx.estado === 'Pagado' ? 'estado_pagado' : 'estado_pendiente'),
  };
  Object.entries(values).forEach(([id, value]) => $(id).textContent = value);
  $('btn-pagar-ahora').classList.toggle('hidden', tx.estado === 'Pagado' || tx.modalidad !== 'POSTPAGO');
}
function refreshPaymentText() {
  if (['YAPE','PLIN'].includes(state.metodoPago)) $('qr-msg').textContent = t('qr_msg', {
    app: state.metodoPago === 'YAPE' ? 'Yape' : 'Plin', monto: state.montoPrepago.toFixed(2),
  });
  if (state.metodoPago === 'TARJETA') $('nfc-msg').textContent = t($('btn-nfc-tap').disabled ? 'nfc_ok' : 'nfc_hint');
}
function syncErrors() {
  const map = { 'input-placa':'placa-error','input-codigo':'codigo-error','prep-input-placa':'prep-placa-error',
    'prep-input-codigo':'prep-codigo-error','input-dni':'dni-error','input-ruc':'ruc-error','input-razon':'razon-error',
    'admin-user':'admin-error','admin-pass':'admin-error' };
  Object.entries(map).forEach(([id, error]) => $(id).setAttribute('aria-invalid', String(!$(error).classList.contains('hidden'))));
}
function storageNotice() { $('storage-notice').classList.remove('hidden'); }
function showError(error) {
  console.error(error);
  mostrarModal(t('error_title'), t('service_error'), '⚠️');
}

Object.assign(F, { iniciar, seleccionarCombustible, elegirModalidad, actualizarMontoDisplay, teclaPresionada, validarYConfirmarMonto, irAComprobante, elegirComprobante, irADatos, irAIdentificacion, normalizarPlaca, placaValida, formatearPlaca, continuarIdentificacion, simularCamara, procesarPago, pintarInfoDespacho, simularDespacho, pintarDespacho, detenerDespacho, calcularTotales, mostrarResumen, pagarAhora, generarComprobante, descargarTxt, finalizar, dniValido, rucValido, continuarDatos, irAMetodoPago, elegirMetodoPago, volverAMetodos, pintarQR, confirmarPagoQR, confirmarPagoNFC, soles, pintarEfectivo, insertarEfectivo, retirarEfectivo, actualizarEfectivo, confirmarPagoEfectivo, invalidatePurchase, renderProcessing, renderSummary, refreshPaymentText, syncErrors, storageNotice, showError });
})(globalThis.FuelFlow);
