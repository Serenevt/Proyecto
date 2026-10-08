(function (F) {
  'use strict';
  let current = null, timer = null;
  const listeners = new Set();
  const emit = () => listeners.forEach(listener => listener({ ...current }));
  function pause() { clearInterval(timer); timer = null; }
  function resume() {
    if (!current?.active || timer !== null || globalThis.document?.hidden) return;
    timer = setInterval(() => {
      current.litros = F.round(current.litros + F.config.LITROS_POR_TICK);
      current.total = F.round(current.litros * current.price);
      if (current.target && current.total >= current.target) {
        current.total = current.target;
        current.litros = F.round(current.target / current.price);
        current.active = false;
        current.automatic = true;
        pause();
      }
      emit();
    }, F.config.TICK_MS);
  }
  F.fuelService = {
    async list() { return Object.entries(F.config.PRECIOS).map(([nombre, precio]) => ({ id: nombre, nombre, precio, moneda: 'PEN' })); },
    async startDispense({ id, price, target = null }) {
      if (!id || !Number.isFinite(price) || price <= 0 || (target !== null && !F.validation.amount(target))) throw new Error('INVALID_DISPENSE');
      if (current?.active) return { ...current };
      pause();
      current = { id, price, target, litros: 0, total: 0, active: true, automatic: false };
      emit(); resume(); return { ...current };
    },
    async stopDispense() {
      pause();
      if (!current) return null;
      current.active = false; emit(); return { ...current };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    pause, resume,
    getSnapshot() { return current ? { ...current } : null; },
  };
})(globalThis.FuelFlow);
