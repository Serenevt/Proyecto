(function (F) {
  'use strict';
  const { state, $ } = F;
  const routes = {
    'pantalla-inicio': ['pantalla-combustible'],
    'pantalla-combustible': ['pantalla-inicio', 'pantalla-pago'],
    'pantalla-pago': ['pantalla-combustible', 'pantalla-comprobante', 'pantalla-identificacion'],
    'pantalla-comprobante': ['pantalla-pago', 'pantalla-datos'],
    'pantalla-datos': ['pantalla-comprobante', 'pantalla-metodo'],
    'pantalla-metodo': ['pantalla-datos', 'pantalla-procesamiento'],
    'pantalla-identificacion': ['pantalla-pago', 'pantalla-procesamiento'],
    'pantalla-procesamiento': ['pantalla-despacho', 'pantalla-resumen', 'pantalla-metodo', 'pantalla-identificacion'],
    'pantalla-despacho': ['pantalla-resumen'],
    'pantalla-resumen': ['pantalla-procesamiento', 'pantalla-inicio'],
  };
  F.updateProgress = () => {
    const flow = state.modalidad === 'POSTPAGO'
      ? ['pantalla-combustible', 'pantalla-pago', 'pantalla-identificacion']
      : ['pantalla-combustible', 'pantalla-pago', 'pantalla-comprobante', 'pantalla-datos', 'pantalla-metodo'];
    const index = flow.indexOf(state.screen);
    $('flow-progress').classList.toggle('hidden', index < 0);
    if (index >= 0) {
      const label = F.t('mobile_step', { current: index + 1, total: flow.length });
      $('progress-label').textContent = label;
      $('progress-track').setAttribute('aria-valuenow', index + 1);
      $('progress-track').setAttribute('aria-valuemax', flow.length);
      $('progress-track').setAttribute('aria-valuetext', label);
      $('progress-fill').style.width = `${(index + 1) / flow.length * 100}%`;
      document.querySelector(`#${state.screen} .step`)?.classList.add('hidden');
    }
  };
  F.mostrarPantalla = (id, force = false) => {
    if (!$(id) || (id === 'pantalla-admin' && (state.busy || state.screen === 'pantalla-despacho'))) return false;
    if (!force && id !== state.screen && id !== 'pantalla-admin' && state.screen !== 'pantalla-admin'
      && !routes[state.screen]?.includes(id)) return false;
    if (id === 'pantalla-datos' && !state.tipoComprobante) return false;
    if (id !== state.screen) F.operations.cancel();
    if (id === 'pantalla-admin') state.adminReturn = state.screen;
    document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === id));
    state.screen = id;
    $('btn-admin-open').disabled = state.busy || id === 'pantalla-despacho' || id === 'pantalla-procesamiento';
    document.body.classList.toggle('dispensing', id === 'pantalla-despacho');
    F.updateProgress();
    const title = $(id).querySelector('h2');
    if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0, behavior: 'instant' });
    F.actualizarEstado('📍 ' + (title?.textContent || F.t('status_listo')));
    return true;
  };
  F.actualizarEstado = text => { $('status-state').textContent = '● ' + text.replace(/^●\s*/, ''); };
  F.back = () => {
    if (F.dialogs.current) return F.dialogs.dismiss();
    if (state.busy || state.screen === 'pantalla-despacho') return false;
    if (state.screen === 'pantalla-admin') return F.mostrarPantalla(state.adminReturn);
    const previous = {
      'pantalla-combustible': 'pantalla-inicio', 'pantalla-pago': 'pantalla-combustible',
      'pantalla-comprobante': 'pantalla-pago', 'pantalla-datos': 'pantalla-comprobante',
      'pantalla-metodo': 'pantalla-datos', 'pantalla-identificacion': 'pantalla-pago',
    };
    return previous[state.screen] ? F.mostrarPantalla(previous[state.screen]) : false;
  };
})(globalThis.FuelFlow);
