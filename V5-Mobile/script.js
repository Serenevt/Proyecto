(function (F) {
'use strict';
const { state, $ } = F;
const abrirAdmin = (...args) => F.abrirAdmin(...args);
const abrirAsistencia = (...args) => F.abrirAsistencia(...args);
const actualizarMontoDisplay = (...args) => F.actualizarMontoDisplay(...args);
const cancelarAsistencia = (...args) => F.cancelarAsistencia(...args);
const cerrarAsistencia = (...args) => F.cerrarAsistencia(...args);
const confirmarPagoEfectivo = (...args) => F.confirmarPagoEfectivo(...args);
const confirmarPagoNFC = (...args) => F.confirmarPagoNFC(...args);
const confirmarPagoQR = (...args) => F.confirmarPagoQR(...args);
const continuarDatos = (...args) => F.continuarDatos(...args);
const continuarIdentificacion = (...args) => F.continuarIdentificacion(...args);
const descargarTxt = (...args) => F.descargarTxt(...args);
const detenerDespacho = (...args) => F.detenerDespacho(...args);
const elegirComprobante = (...args) => F.elegirComprobante(...args);
const elegirMetodoPago = (...args) => F.elegirMetodoPago(...args);
const elegirModalidad = (...args) => F.elegirModalidad(...args);
const finalizar = (...args) => F.finalizar(...args);
const generarComprobante = (...args) => F.generarComprobante(...args);
const hablar = (...args) => F.hablar(...args);
const iniciar = (...args) => F.iniciar(...args);
const iniciarParpadeoMascota = (...args) => F.iniciarParpadeoMascota(...args);
const iniciarReloj = (...args) => F.iniciarReloj(...args);
const irAIdentificacion = (...args) => F.irAIdentificacion(...args);
const loginAdmin = (...args) => F.loginAdmin(...args);
const mascotaHablando = (...args) => F.mascotaHablando(...args);
const pagarAhora = (...args) => F.pagarAhora(...args);
const pintarMascota = (...args) => F.pintarMascota(...args);
const repetirFraseMascota = (...args) => F.repetirFraseMascota(...args);
const retirarEfectivo = (...args) => F.retirarEfectivo(...args);
const seleccionarCombustible = (...args) => F.seleccionarCombustible(...args);
const setIdioma = (...args) => F.setIdioma(...args);
const simularCamara = (...args) => F.simularCamara(...args);
const t = (...args) => F.t(...args);
const teclaPresionada = (...args) => F.teclaPresionada(...args);
const validarYConfirmarMonto = (...args) => F.validarYConfirmarMonto(...args);
const volverAMetodos = (...args) => F.volverAMetodos(...args);
const mostrarPantalla = (...args) => F.mostrarPantalla(...args);
const cerrarModal = (...args) => F.cerrarModal(...args);
const abrirIdiomas = (...args) => F.abrirIdiomas(...args);
const cerrarIdiomas = (...args) => F.cerrarIdiomas(...args);

async function init() {
  iniciarReloj();
  await F.transactionService.list();
  F.catalog = await F.fuelService.list();
  F.dialogs.init();
  actualizarMontoDisplay();
  pintarMascota();               // imagen base del asistente
  iniciarParpadeoMascota();      // parpadeo periódico de ojos
  try { if ('speechSynthesis' in window) window.speechSynthesis.getVoices(); } catch (e) {}

  // Idioma guardado (o español por defecto y muestra el selector en el 1er ingreso)
  const idiomaGuardado = await F.settingsService.getLanguage();
  setIdioma(idiomaGuardado || 'es', false);
  if (!idiomaGuardado) F.operations.later(abrirIdiomas, 600);  // primera visita

  // Navegación genérica "Volver"
  document.querySelectorAll('[data-nav]').forEach((b) =>
    b.addEventListener('click', () => { if (state.screen === 'pantalla-admin') mostrarPantalla(state.adminReturn); else F.back(); }));

  // 1. Inicio
  $('btn-iniciar').addEventListener('click', iniciar);

  // 2. Combustible
  document.querySelectorAll('.fuel-card').forEach((card) =>
    card.addEventListener('click', () => seleccionarCombustible(card.dataset.fuel, card.dataset.price, card)));

  // 3. Pago
  $('btn-prepago').addEventListener('click', () => elegirModalidad('PREPAGO'));
  $('btn-postpago').addEventListener('click', () => elegirModalidad('POSTPAGO'));
  $('btn-postpago-continuar').addEventListener('click', () => {
    hablar(t('voz_postpago'));
    irAIdentificacion();
  });
  document.querySelectorAll('.keypad button').forEach((b) =>
    b.addEventListener('click', () => teclaPresionada(b.dataset.key)));
  document.querySelectorAll('.quick-amounts .chip').forEach((c) =>
    c.addEventListener('click', () => {
      document.querySelectorAll('.quick-amounts .chip').forEach((x) => x.classList.remove('selected'));
      c.classList.add('selected');
      if (c.dataset.monto !== 'otro') { state.montoTexto = c.dataset.monto; actualizarMontoDisplay(); }
      else { state.montoTexto = ''; actualizarMontoDisplay(); }
      $('monto-error').classList.add('hidden');
    }));
  $('btn-confirmar-monto').addEventListener('click', validarYConfirmarMonto);

  // 4. Identificación
  $('check-membresia').addEventListener('change', (e) =>
    $('membresia-panel').classList.toggle('hidden', !e.target.checked));
  $('input-placa').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
  $('btn-simular-camara').addEventListener('click', () => simularCamara());
  $('btn-continuar-ident').addEventListener('click', continuarIdentificacion);

  // 4b. Tipo de comprobante (solo prepago)
  $('btn-boleta').addEventListener('click', () => elegirComprobante('BOLETA'));
  $('btn-factura').addEventListener('click', () => elegirComprobante('FACTURA'));

  // 4c. Datos del comprobante (solo prepago)
  $('prep-btn-camara').addEventListener('click', () =>
    simularCamara({ input: 'prep-input-placa', cam: 'prep-cam-plate' }));
  $('prep-input-placa').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
  $('prep-check-membresia').addEventListener('change', (e) =>
    $('prep-membresia-panel').classList.toggle('hidden', !e.target.checked));
  $('input-dni').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
    $('dni-error').classList.add('hidden');
  });
  $('input-ruc').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
    $('ruc-error').classList.add('hidden');
  });
  $('btn-continuar-datos').addEventListener('click', continuarDatos);
  $('prep-input-placa').addEventListener('keydown', (e) => { if (e.key === 'Enter') continuarDatos(); });

  // 4d. Método de pago (solo prepago)
  document.querySelectorAll('[data-metodo]').forEach((b) =>
    b.addEventListener('click', () => elegirMetodoPago(b.dataset.metodo)));
  document.querySelectorAll('.btn-metodo-volver').forEach((b) =>
    b.addEventListener('click', volverAMetodos));
  $('btn-qr-pagado').addEventListener('click', confirmarPagoQR);
  $('btn-nfc-tap').addEventListener('click', confirmarPagoNFC);
  $('btn-ef-retirar').addEventListener('click', retirarEfectivo);
  $('btn-ef-confirmar').addEventListener('click', confirmarPagoEfectivo);

  // 6. Despacho
  $('btn-detener').addEventListener('click', () => detenerDespacho(false));

  // 7. Resumen
  $('btn-pagar-ahora').addEventListener('click', pagarAhora);
  $('btn-comprobante').addEventListener('click', generarComprobante);
  $('btn-descargar-txt').addEventListener('click', descargarTxt);
  $('ticket-close').addEventListener('click', () => F.dialogs.close('ticket-overlay'));
  $('btn-finalizar').addEventListener('click', finalizar);

  // 8. Admin
  $('btn-admin-open').addEventListener('click', abrirAdmin);
  $('btn-admin-login').addEventListener('click', loginAdmin);
  $('admin-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') loginAdmin(); });
  $('btn-admin-logout').addEventListener('click', () => {
    state.adminAutenticado = false;
    $('admin-dash').classList.add('hidden');
    $('admin-login').classList.remove('hidden');
    mostrarPantalla(state.adminReturn);
  });

  // Voz on/off
  $('btn-voice-toggle').addEventListener('click', () => {
    state.vozActivada = !state.vozActivada;
    if (!state.vozActivada) {
      try { window.speechSynthesis?.cancel(); } catch (e) {}
      mascotaHablando(false);
    }
    $('btn-voice-toggle').textContent = state.vozActivada ? '🔊' : '🔇';
    $('voice-status').classList.toggle('muted', !state.vozActivada);
    $('voice-status-text').textContent = state.vozActivada ? t('voice_ready') : t('voice_muted');
  });

  // Asistencia humana (visible en todas las pantallas)
  $('btn-ayuda').addEventListener('click', abrirAsistencia);
  $('help-btn-cancelar').addEventListener('click', cancelarAsistencia);
  $('help-btn-cerrar').addEventListener('click', cerrarAsistencia);

  // 0. Idioma (botón 🌐 del topbar)
  $('btn-lang').addEventListener('click', abrirIdiomas);
  $('lang-close').addEventListener('click', cerrarIdiomas);
  document.querySelectorAll('.lang-opt').forEach((b) =>
    b.addEventListener('click', () => {
      setIdioma(b.dataset.lang, true);   // cambia textos y la mascota saluda en ese idioma
      cerrarIdiomas();
    }));

  // Mascota: tocarla repite la última frase
  const marco = document.querySelector('.mascota-frame');
  if (marco) {
    marco.style.pointerEvents = 'auto';
    marco.style.cursor = 'pointer';
    marco.addEventListener('click', repetirFraseMascota);
  }

  // Modal
  $('modal-ok').addEventListener('click', cerrarModal);

  const viewport = window.visualViewport;
  if (viewport) {
    const adjust = () => {
      document.documentElement.style.setProperty('--visible-height', viewport.height + 'px');
      document.body.classList.toggle('keyboard-open', document.activeElement?.matches('input') && viewport.height < window.innerHeight * .8);
    };
    viewport.addEventListener('resize', adjust); adjust();
  }
  document.addEventListener('focusin', event => {
    if (event.target.matches('input')) setTimeout(() => event.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { F.fuelService.pause(); window.speechSynthesis?.cancel(); mascotaHablando(false); }
    else F.fuelService.resume();
  });
  document.addEventListener('input', event => {
    if (!event.target.matches('input')) return;
    const errorId = event.target.getAttribute('aria-describedby');
    if (errorId) $(errorId)?.classList.add('hidden');
    F.syncErrors();
  });
  new MutationObserver(F.syncErrors).observe(document.querySelector('.stage'), { attributes: true, subtree: true, attributeFilter: ['class'] });
  if (F.storage.failures.length) F.storageNotice();
  F.updateProgress();
  // Permite Enter en placa para continuar
  $('input-placa').addEventListener('keydown', (e) => { if (e.key === 'Enter') continuarIdentificacion(); });
}

// Arranque cuando el DOM está listo (funciona con file://)
document.addEventListener('DOMContentLoaded', () => init().catch(F.showError));

Object.assign(F, { init });
})(globalThis.FuelFlow);
