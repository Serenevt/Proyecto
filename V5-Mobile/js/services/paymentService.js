(function (F) {
  'use strict';
  const completed = new Map();
  function simulate(kind, request) {
    if (!request.id || !Number.isFinite(request.amount) || request.amount < 0) return Promise.reject(new Error('INVALID_PAYMENT'));
    const key = `${kind}:${request.id}`;
    if (!completed.has(key)) {
      completed.set(key, new Promise(resolve => setTimeout(() => resolve({
        id: request.id, metodo: request.method || null, importe: request.amount,
        estado: kind === 'authorize' ? 'Autorizado' : 'Pagado', simulated: true,
      }), 2000)));
    }
    return completed.get(key);
  }
  F.paymentService = { authorize: request => simulate('authorize', request), confirm: request => simulate('confirm', request) };
})(globalThis.FuelFlow);
