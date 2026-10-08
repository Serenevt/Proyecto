(function (F) {
  'use strict';
  F.freshPurchase = () => ({
    combustible: null, modalidad: null, montoPrepago: 0, montoTexto: '', placa: '',
    esMiembro: false, codigoCliente: '', tipoComprobante: null, dni: '', ruc: '', razonSocial: '',
    metodoPago: null, efectivoIngresado: 0, efectivoPila: [], litros: 0, total: 0,
    ultimoAnuncioLitros: 0, pagoAutorizado: false, pagoEstado: 'Pendiente',
    transactionId: null, transaction: null, busy: false, stopped: false, despachoTimer: null,
  });
  F.state = { ...F.freshPurchase(), vozActivada: true, adminAutenticado: false, idioma: 'es',
    screen: 'pantalla-inicio', adminReturn: 'pantalla-inicio' };
  F.$ = id => document.getElementById(id);
  F.mascotaEstado = { boca: false, ojos: false, hablando: false, timerHabla: null, ultimoTexto: '' };
  // A new generation invalidates pending callbacks without changing customer preferences.
  let generation = 0;
  const timers = new Set();
  F.operations = {
    get generation() { return generation; },
    later(callback, delay) {
      const token = generation;
      const timer = setTimeout(() => { timers.delete(timer); if (token === generation) callback(); }, delay);
      timers.add(timer);
      return timer;
    },
    cancel() { generation++; timers.forEach(clearTimeout); timers.clear(); },
  };
})(globalThis.FuelFlow);
