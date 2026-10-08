# Modelo conceptual futuro

Este documento no crea tablas, migraciones ni una conexión PostgreSQL. Los objetos locales son una demostración; una versión con servidor deberá resolver autenticación, autorización y reglas comerciales antes de usar datos reales.

| Entidad | Atributos conceptuales | Relaciones |
| --- | --- | --- |
| Cliente | id, tipoDocumento, dni/ruc, nombre/razonSocial | Vehículos y membresías |
| Vehículo | id, placa normalizada | Cliente opcional; transacciones |
| Membresía | id, código, estado, porcentaje | Cliente |
| Combustible | id, nombre, precioPorLitro, moneda PEN | Transacciones |
| Transacción | id, fecha, modalidad, litros, precioAplicado, subtotal, descuento, total, estado | Vehículo, combustible, pagos y comprobante |
| Pago | id, importe, método, estado, fecha | Transacción |
| Comprobante | id, tipo, datos del receptor, fecha | Transacción |
| Incidente | id, tipo, estado, surtidor, fecha | Transacción opcional |

Guardar snapshots de precio, descuento y datos del receptor: cambiar catálogo o cliente no debe alterar una compra pasada. Boleta usa DNI; factura usa RUC y razón social. Documentos y placas se representan como texto. Las fechas nuevas usan ISO 8601; `hora` es solo una representación local. Moneda PEN, importe expresado en soles con dos decimales. Para persistencia futura, definir precisión decimal explícita para importes y volumen; no basar dinero real en floats JavaScript.

## Representación local de V5

`fuelflow_v5_transactions_v1` almacena `{version: 1, records: [...]}`. Cada operación nueva incluye id, createdAt, hora, placa, combustible, precio, litros, subtotal, descuento, monto, estado, modalidad, montoPrepago, tipoComprobante, cliente, esMiembro, codigoCliente y pago. `demo` distingue ejemplos de compras nuevas. Pago autorizado no implica transacción pagada: en postpago queda pendiente hasta confirmar el cobro.

Solo el adaptador `core/storage.js` accede a localStorage. Al iniciar sin datos V5, copia un historial V4 válido o siembra cinco ejemplos. Nunca escribe `primax_transacciones` ni `primax_idioma`. Los registros migrados mantienen los campos disponibles; no se inventan fechas, clientes ni litros. Se asigna id si falta. Un formato V5 inválido legible se conserva en una clave de recuperación antes de inicializar un historial utilizable. Si el almacenamiento falla, la copia en memoria permite terminar la sesión.

Una migración futura debe aceptar registros legados incompletos y distinguirlos de compras completas. No hay sincronización HTTP ni persistencia de compras incompletas: recargar durante una compra inicia una sesión nueva, preservando solo historial y preferencias que pudieron guardarse.
