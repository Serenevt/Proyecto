(function (F) {
  'use strict';
  F.round = value => Math.round(value * 100) / 100;
  // Preserve V4: subtotal derives from litres rounded to two decimals.
  F.totals = (litres, price, member) => {
    const subtotal = F.round(litres * price);
    const descuento = member ? F.round(subtotal * F.config.DESCUENTO) : 0;
    return { subtotal, descuento, total: F.round(subtotal - descuento) };
  };
})(globalThis.FuelFlow);
