(function (F) {
  'use strict';
  const normalize = value => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  F.validation = {
    normalizePlate: normalize,
    plate: value => /^[A-Z0-9]{6}$/.test(normalize(value)),
    formatPlate: value => { const p = normalize(value); return p.length === 6 ? p.slice(0, 3) + '-' + p.slice(3) : p; },
    dni: value => /^\d{8}$/.test(String(value).trim()),
    ruc: value => /^\d{11}$/.test(String(value).trim()),
    amount: value => Number.isFinite(value) && value >= F.config.MONTO_MIN && value <= F.config.MONTO_MAX,
  };
})(globalThis.FuelFlow);
