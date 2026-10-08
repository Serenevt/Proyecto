(function (F) {
  'use strict';
  const requests = new Map();
  const notify = request => request.listeners.forEach(listener => listener({ id: request.id, progress: request.progress, status: request.status }));
  F.assistanceService = {
    async request() {
      const request = { id: F.newId(), progress: 0, status: 'requested', listeners: new Set(), started: Date.now() };
      requests.set(request.id, request);
      request.timer = setInterval(() => {
        request.progress = Math.min(100, (Date.now() - request.started) / 6000 * 100);
        if (request.progress >= 100) { request.status = 'arrived'; clearInterval(request.timer); }
        notify(request);
      }, 80);
      return { id: request.id, progress: 0, status: request.status };
    },
    async cancel(id) {
      const request = requests.get(id);
      if (!request) return;
      clearInterval(request.timer); request.status = 'cancelled'; notify(request); requests.delete(id);
    },
    subscribe(id, listener) {
      const request = requests.get(id);
      if (!request) return () => {};
      request.listeners.add(listener); notify(request);
      return () => request.listeners.delete(listener);
    },
  };
})(globalThis.FuelFlow);
