(function (F) {
'use strict';
const { state, $ } = F;
const hablar = (...args) => F.hablar(...args);
const t = (...args) => F.t(...args);


let requestId = null, unsubscribe = null, requestVersion = 0, helpProgress = 0, helpArrived = false;
function detenerProgresoAyuda() {
  requestVersion++;
  if (unsubscribe) unsubscribe(); unsubscribe = null;
  if (requestId) F.assistanceService.cancel(requestId); requestId = null;
}
function pintarProgresoAyuda(pct) {
  $('help-bar').style.width = pct + '%';
  $('help-bar-wrap').setAttribute('aria-valuenow', Math.floor(pct));
  document.querySelectorAll('#help-pasos li').forEach((li, index) => {
    const threshold = 100 / 3 * (index + 1);
    li.classList.toggle('done', pct >= threshold); li.classList.toggle('active', pct >= threshold - 100 / 3 && pct < threshold);
  });
}
function renderAssistance() {
  const suffix = helpArrived ? 'llegada' : 'llamando';
  $('help-icon').textContent = helpArrived ? '🛎️' : '📞';
  $('help-title').textContent = t('help_t_' + suffix); $('help-msg').textContent = t('help_m_' + suffix);
  $('help-estado').textContent = t('help_e_' + suffix);
  ['help-cargando','help-bar-wrap','help-btn-cancelar'].forEach(id => $(id).classList.toggle('hidden', helpArrived));
  $('help-btn-cerrar').classList.toggle('hidden', !helpArrived);
  pintarProgresoAyuda(helpProgress);
}
async function abrirAsistencia() {
  detenerProgresoAyuda();
  const token = requestVersion;
  helpProgress = 0; helpArrived = false; renderAssistance(); F.dialogs.open('help-overlay');
  hablar(t('voz_help_llamando'));
  const request = await F.assistanceService.request();
  if (token !== requestVersion) { await F.assistanceService.cancel(request.id); return; }
  requestId = request.id;
  unsubscribe = F.assistanceService.subscribe(requestId, event => {
    helpProgress = event.progress;
    const justArrived = !helpArrived && event.status === 'arrived';
    helpArrived = event.status === 'arrived'; renderAssistance();
    if (justArrived) {
      hablar(t('voz_help_llegada'));
      if (F.dialogs.current === 'help-overlay') $('help-btn-cerrar').focus();
    }
  });
}
function cancelarAsistencia() { detenerProgresoAyuda(); F.dialogs.close('help-overlay'); hablar(t('voz_help_cancelada')); }
function cerrarAsistencia() { detenerProgresoAyuda(); F.dialogs.close('help-overlay'); $('voice-status-text').textContent = t(state.vozActivada ? 'voice_ready' : 'voice_muted'); }

Object.assign(F, { detenerProgresoAyuda, pintarProgresoAyuda, renderAssistance, abrirAsistencia, cancelarAsistencia, cerrarAsistencia });
})(globalThis.FuelFlow);
