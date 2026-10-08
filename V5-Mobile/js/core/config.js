(function (F) {
  'use strict';
  F.config = Object.freeze({
    PRECIOS: { Regular: 16.50, Premium: 18.20, 'Diésel': 14.80 },
    LITROS_POR_TICK: 0.5, TICK_MS: 300, DESCUENTO: 0.05,
    MONTO_MIN: 10, MONTO_MAX: 500, DNI_LONG: 8, RUC_LONG: 11,
    BILLETES: [200, 100, 50, 20], MONEDAS: [1, 0.5, 0.2, 0.1],
    CODIGO_IDIOMA: { es: 'es-PE', en: 'en-US', qu: 'qu' },
    LOCALE_IDIOMA: { es: 'es-PE', en: 'en-US', qu: 'es-PE' },
    TRANSACCIONES_EJEMPLO: [
      { hora: '08:12', placa: 'BKL-482', combustible: 'Premium', monto: 120, estado: 'Pagado' },
      { hora: '09:03', placa: 'ABC-123', combustible: 'Diésel', monto: 85.5, estado: 'Pendiente' },
      { hora: '10:27', placa: 'FGT-991', combustible: 'Regular', monto: 50, estado: 'Pagado' },
      { hora: '11:15', placa: 'D4X-207', combustible: 'Premium', monto: 200, estado: 'Pagado' },
      { hora: '12:40', placa: 'PQR-555', combustible: 'Diésel', monto: 64.3, estado: 'Pagado' },
    ],
    ALERTAS_EJEMPLO: ['alerta_1', 'alerta_2', 'alerta_3'],
  });
  F.newId = () => globalThis.crypto?.randomUUID?.() || `v5-${Date.now()}-${Math.random().toString(36).slice(2)}`;
})(globalThis.FuelFlow = globalThis.FuelFlow || {});
