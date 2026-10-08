# Contrato conceptual de API

No hay servidor, endpoints activos ni cliente HTTP. Los servicios actuales devuelven promesas y objetos de dominio; un adaptador futuro traducirá estos contratos sin exponer HTTP a las pantallas. Los eventos de despacho y asistencia se proporcionan por suscripciones con función de desuscripción.

## Interfaces locales

| Servicio | Métodos |
| --- | --- |
| fuelService | list, startDispense, stopDispense, subscribe, pause, resume |
| transactionService | list, get, save, updatePayment |
| paymentService | authorize, confirm |
| plateService | simulateRead, normalize, validate |
| assistanceService | request, cancel, subscribe |
| receiptService | build, exportText |
| settingsService | getLanguage, setLanguage |

Los servicios no renderizan elementos DOM. `receiptService.exportText` es el adaptador de plataforma de exportación web. Errores de dominio se traducen en la interfaz; la persistencia local informa `persisted` en los resultados de escritura. Autorización, cobro y transacción tienen identidades estables; las llamadas repetidas no crean pagos/transacciones duplicados en una sesión.

## Rutas propuestas

| Ruta | Entrada | Respuesta conceptual |
| --- | --- | --- |
| GET /api/combustibles | Ninguna | Lista de id, nombre, precioPorLitro, moneda |
| POST /api/transacciones | idOperacion, modalidad, vehículo, combustible y datos del comprobante | Transacción con id, fecha y estado |
| GET /api/transacciones/:id | id | Transacción, totales y estado de pago |
| POST /api/pagos | idOperacion, transaccionId, operación autorizar/cobrar, método e importe | Pago autorizado, pagado o rechazado |
| POST /api/incidentes | idOperacion, transaccionId opcional, surtidorId, tipo | Incidente con id y estado |
| GET /api/comprobantes/:id | id de comprobante | Snapshot de comprobante y contenido exportable |

Para listados de administración, seguimiento/cancelación de asistencia y control de despacho se requerirán contratos adicionales en la fase de integración. No se simulan rutas HTTP inexistentes en esta versión.

## Ejemplos ilustrativos

```json
{"combustibles":[{"id":"regular","nombre":"Regular","precioPorLitro":16.50,"moneda":"PEN"}]}
```

```json
{"idOperacion":"op-123","modalidad":"PREPAGO","combustibleId":"regular","montoObjetivo":50,"vehiculo":{"placa":"ABC-123"},"comprobante":{"tipo":"BOLETA","receptor":{"dni":"70123456"}}}
```

```json
{"id":"tx-123","fecha":"2026-10-07T18:00:00Z","estado":"Pendiente","moneda":"PEN","total":50}
```

```json
{"idOperacion":"pay-123","transaccionId":"tx-123","operacion":"cobrar","metodo":"YAPE","importe":50,"moneda":"PEN"}
```

```json
{"id":"pay-123","transaccionId":"tx-123","estado":"Pagado","importe":50,"moneda":"PEN"}
```

```json
{"idOperacion":"help-123","transaccionId":"tx-123","surtidorId":"03","tipo":"ASISTENCIA"}
```

```json
{"id":"incident-123","estado":"Solicitado"}
```

```json
{"id":"receipt-123","transaccionId":"tx-123","tipo":"BOLETA","receptor":{"dni":"70123456"},"total":50,"moneda":"PEN"}
```

Fechas ISO 8601 y valores monetarios en PEN. `idOperacion` será clave de idempotencia: repetir la misma operación debe retornar su resultado, nunca cobrar dos veces. Una autorización de postpago no debe marcar el cobro como pagado. El servidor calculará y validará los totales, sin confiar en precios enviados por el cliente. Antes de integración real se deberá acordar descuento, redondeo, parada anticipada y posibles reembolsos del prepago.

Errores propuestos: `{ "error": { "code": "INVALID_DOCUMENT", "field": "dni" } }`, `TRANSACTION_NOT_FOUND`, `PAYMENT_REJECTED`, `SERVICE_UNAVAILABLE`. El adaptador convertirá validación a errores de campo; rechazo y falta de servicio conservarán los datos para reintento. Autenticación y permisos quedan pendientes de una arquitectura de backend.
