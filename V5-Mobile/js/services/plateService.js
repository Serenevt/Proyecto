(function (F) {
  'use strict';
  F.plateService = {
    normalize: F.validation.normalizePlate, validate: F.validation.plate,
    async simulateRead() {
      const random = (count, chars) => Array.from({ length: count }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      return random(3, 'ABCDEFGHJKLMNPQRSTUVWXYZ') + '-' + random(3, '0123456789');
    },
  };
})(globalThis.FuelFlow);
