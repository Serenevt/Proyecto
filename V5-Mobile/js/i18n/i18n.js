(function (F) {
'use strict';
const { state, $, mascotaEstado } = F;
const I18N = F.I18N;
const hablar = (...args) => F.hablar(...args);
const pintarInfoDespacho = (...args) => F.pintarInfoDespacho(...args);
const refrescarAdmin = (...args) => F.refrescarAdmin(...args);
const actualizarEstado = (...args) => F.actualizarEstado(...args);

function t(clave, params) {
  const pack = I18N[state.idioma] || I18N.es;
  let texto = pack[clave] || I18N.es[clave] || clave;
  if (params) {
    Object.keys(params).forEach((k) => { texto = texto.split('{' + k + '}').join(params[k]); });
  }
  return texto;
}

/**
 * Aplica el idioma a toda la página:
 *  - [data-i18n]      → contenido (admite etiquetas <em>, <b>)
 *  - [data-i18n-ph]   → placeholder
 *  - [data-i18n-title]→ title
 *  - [data-i18n-aria] → aria-label
 */
function setIdioma(lang, hablarSaludo = false) {
  if (!I18N[lang]) lang = 'es';
  state.idioma = lang;
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach((el) => { el.innerHTML = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });

  // Idioma elegido se resalta en el selector
  document.querySelectorAll('.lang-opt').forEach((b) =>
    b.classList.toggle('selected-lang', b.dataset.lang === lang));

  F.settingsService.setLanguage(lang);

  refrescarTextosDinamicos();   // textos que se generan por JS
  refrescarAdmin();             // tabla, métricas y alertas

  if (hablarSaludo) hablar(t('voz_bienvenida'));
}

/** Actualiza los textos creados dinámicamente al cambiar de idioma. */
function refrescarTextosDinamicos() {
  actualizarEstado(document.querySelector('.screen.active h2')?.textContent || t('status_listo'));
  if (!mascotaEstado.hablando) $('voice-status-text').textContent = state.vozActivada ? t('voice_ready') : t('voice_muted');
  if (state.combustible) {
    const label = `${state.combustible.nombre} · S/ ${state.combustible.precio.toFixed(2)}`;
    ['resumen-fuel-mini', 'mini-fuel', 'prep-mini-fuel'].forEach(id => $(id).textContent = label);
    $('mini-modalidad').textContent = t(state.modalidad === 'PREPAGO' ? 'prepago' : 'postpago');
    $('mini-monto').textContent = state.modalidad === 'PREPAGO' ? 'S/ ' + state.montoPrepago.toFixed(2) : t('mini_post');
    $('prep-mini-monto').textContent = 'S/ ' + state.montoPrepago.toFixed(2);
    const doc = state.tipoComprobante ? t(state.tipoComprobante === 'FACTURA' ? 'doc_factura' : 'doc_boleta') : '—';
    ['resumen-doc-mini', 'prep-mini-doc'].forEach(id => $(id).textContent = doc);
    if (state.screen === 'pantalla-despacho') {
      $('despacho-titulo').textContent = t('despacho_title', { fuel: state.combustible.nombre }); pintarInfoDespacho();
    }
    if (state.screen === 'pantalla-resumen' && state.transaction) F.renderSummary();
    if (state.screen === 'pantalla-metodo' && state.metodoPago) F.refreshPaymentText();
  }
  if (state.screen === 'pantalla-procesamiento') F.renderProcessing();
  if (F.dialogs.isOpen('help-overlay')) F.renderAssistance();
  if (F.dialogs.isOpen('ticket-overlay')) F.generarComprobante();
  F.updateProgress();
  F.syncErrors();
}

Object.assign(F, { t, setIdioma, refrescarTextosDinamicos });
})(globalThis.FuelFlow);
