# Validación V11_2 — 24 de octubre de 2026, America/Lima

> Actualizaci?n de impresi?n y presentaci?n de deuda: [VALIDATION-PRINT-A6-V11_2.md](VALIDATION-PRINT-A6-V11_2.md). Las descripciones de popup/di?logo y sus pruebas en este informe corresponden a la implementaci?n anterior y quedan sustituidas por el agente local A6.

## Alcance y origen de la evidencia

Se copió V11 a C:\Users\MATHIAS\Desktop\V11_2 después de comprobar que la carpeta destino no existía. Se revisaron las instrucciones disponibles, README, docs/DEPLOYMENT-V11.md y docs/VALIDATION-V11.md antes de editar código. No se encontraron AGENTS.md aplicables en el proyecto ni en sus directorios ascendientes revisados.

Los informes V11 y anteriores se conservaron sin reescribir: son evidencia histórica. Los 542 resultados mencionados en VALIDATION-V11.md no se atribuyen a esta ejecución. La tabla siguiente corresponde a comprobaciones ejecutadas en V11_2; no suma reejecuciones ni intentos fallidos durante el desarrollo. No se ejecutaron todos los grupos históricos de Android ni las antiguas suites visuales de Prime.

## Cambios implementados

1. **Inventario dentro de las tarjetas.** Se consulta GET /fuels/inventory y se filtra por los IDs del combustible y la estación del catálogo de esta operación. La línea está inmediatamente después del precio. Muestra litros, unidad nativa de FuelInventory; las conversiones galón/litro del despacho y sus restricciones permanecen en backend. Hay estado de carga y mensaje exacto “Disponibilidad no disponible”. Se consulta al entrar, regresar a selección y recuperar foco en esa pantalla. No hay stock prefijado en la interfaz. La nueva base tiene datos DEMO propios inicializados por el seed existente; las cantidades mostradas son su inventario persistido, no datos leídos de V11.
2. **Billeteras DEMO.** FuelFlow prepago y Prime para deuda pospago presentan QR ficticio local, “QR de demostración” y “Pago simulado”. Se retiró el formulario personal de pago, conservando los campos fiscales/de identificación de boleta/factura. POST /online-orders/:id/demo-confirm requiere actor autorizado, importe exacto y moneda PEN. El backend persiste eventos DEMO y captura la orden usando el mismo proceso transaccional de liquidación. La consulta GET por sí sola no simula un pago.
3. **Separación del proveedor.** DemoWalletProvider no usa fetch ni cobra a una pasarela. CulqiProvider sigue siendo un adapter comercial independiente. La simulación requiere APP_MODE=local, PAYMENT_ENV=demo y DEMO_WALLET_ENABLED=true; la configuración y la ruta la rechazan en producción o fuera del DEMO. La selección de adapter se realiza en backend. El frontend no recibe ni publica claves del proveedor. Cancelación, reembolso y recuperación de creación interrumpida DEMO tienen evidencia persistida explícita; no se afirma devolución bancaria.
4. **Integridad financiera.** Se conservan UUID idempotentes, validación de catálogo, precio, stock, pertenencia de membresía y autorización previa al despacho. Los eventos de confirmación y los de captura tienen claves únicas; las transacciones serializables y el bloqueo por orden controlan las carreras. Cambiar de método cancela primero la orden pendiente en backend. Un pago capturado no se borra localmente para cambiar de método. El pago de deuda actualiza la misma Transaction y su saldo pendiente; no crea un segundo consumo ni comprobante.
5. **Captura de placa.** El botón se ofrece en datos de boleta y factura y reutiliza la cámara/OCR existentes. Se requieren revisión y confirmación explícitas, con corrección del resultado. Abrir, cancelar y confirmar no reinician DNI, RUC o razón social. La placa puede seguir introduciéndose manualmente.
6. **Membresía pospago.** Se eliminó el segundo botón inyectado y la antigua acción de búsqueda que aparentaba ser captura. El único botón abre getUserMedia, envía kind=membership al OCR y requiere revisión antes de completar el campo. La vinculación sigue exigiendo la verificación backend de placa, código y membresía activa. Se conserva entrada manual. No se usan placas o códigos fijos como reconocimiento.
7. **Ciclo de cámara.** Cierre, cancelación, abandono de paso y pagehide detienen tracks y limpian referencias. Si el permiso se resuelve después de cancelar, el stream tardío también se detiene. La baja confianza, los errores y la falta de permiso conservan la alternativa manual.
8. **Finalización e impresión.** Se sustituyó Descargar .txt por Finalizar e imprimir y se muestran las opciones Finalizar y no imprimir. La versión imprimible es un documento separado, con texto del resultado ya confirmado, estilos legibles, sin navegación ni botones y sin HTML del usuario interpretado. El comprobante permanece durante el diálogo. afterprint o el cierre de la ventana finalizan la atención, sin POST de compra adicional; afterprint también ocurre al cancelar y no prueba impresión física. Si se bloquea o falla print, el comprobante conserva sus botones y muestra un aviso con posibilidad de reintentar. La opción sin impresión no abre ventanas ni descarga archivos.
9. **Estado y naturaleza del comprobante.** Se conservan los estados de deuda pendiente/parcial. Las vistas y la versión imprimible se identifican como DEMO, sin validez fiscal ni validación SUNAT. No se registra “impreso físicamente”.

## Resultados automáticos finales

| Grupo ejecutado en V11_2 | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Backend, 14 suites unitarias | 135 | 0 | 0 |
| Backend PostgreSQL, 9 suites E2E | 237 | 0 | 0 |
| FuelFlow unitarias, incluidas impresión y estados financieros | 58 | 0 | 0 |
| Prime unitarias | 26 | 0 | 0 |
| Chrome, nueva suite V11_2 | 16 | 0 | 0 |
| OCR Tesseract/OpenCV con fixtures | 11 | 0 | 0 |
| **Total, sin duplicar reejecuciones** | **483** | **0** | **0** |

También pasaron: builds de backend y ambas interfaces, lint del backend, validación Compose y arranque local Docker. Se comprobaron seis servicios saludables, migraciones/seed completados y el montaje real del volumen exclusivo. Los errores HTTP/Prisma provocados por pruebas negativas y los reintentos de serialización no representan fallos de suite.

Las ocho pruebas E2E nuevas cubren Yape y Plin sin customer, bloqueo antes de confirmar, importe incorrecto, actor incorrecto, doble confirmación concurrente, replay de orden/compra, una sola transacción, deuda pospago liquidada una vez, stock insuficiente, cancelación idempotente, reembolso DEMO, recuperación de intento interrumpido y rechazo de configuración productiva.

Las 16 de Chrome cubren disponibilidad por estación/combustible debajo del precio en 1280 y 390 px; carga/error/regreso; placa en boleta y factura con OCR de fixture real y corrección; cámara denegada/baja confianza/cancelación; un único botón de membresía; revisión previa; detención al cerrar/abandonar y tras un permiso tardío; prepago Yape/Plin con backend real; pospago Yape/Plin desde Prime con backend real; replay de la misma transacción; cambio de método; finalización con y sin impresión; ventana bloqueada y autenticación obligatoria de la ruta DEMO.

Evidencia adicional:

- [Resultado estructurado de Chrome](browser-v11_2-results.json).
- [Inventario escritorio](stock-1280-v11_2.png), [inventario móvil](stock-390-v11_2.png) y [documento imprimible](receipt-v11_2.png).
- Logs locales unit-fuelflow-v11_2.log y unit-prime-v11_2.log, ignorados por Git.
- Nuevo código de pruebas en Backend/test/v11_2-demo.e2e-spec.ts, FrontEnd_1/tests/printReceipt.test.js y tools/v11_2.spec.cjs; se adaptó la expectativa de estado del ticket para conservar simultáneamente el estado financiero y su identificación DEMO.

Durante el desarrollo se detectaron y corrigieron una carrera en la inserción del evento de confirmación y el aviso de impresión que quedaba detrás del comprobante. También se ajustó la preparación del navegador para seleccionar el idioma antes de las pruebas. Los resultados finales anteriores corresponden a ejecuciones posteriores a las correcciones.

## Aislamiento comprobado

- Proyecto Docker primax-v11-2; volumen primax-v11-2_postgres_data montado en /var/lib/postgresql/data.
- Backend conectado a host postgres, base /primax_v11_2; APP_MODE=local, PAYMENT_ENV=demo y DEMO_WALLET_ENABLED=true comprobados en el contenedor, sin imprimir credenciales.
- FuelFlow localhost:22081, Prime localhost:22082, API localhost:22000/api/v1 y Mailpit localhost:22025. Todos enlazados a loopback.
- PostgreSQL y OCR sin puerto de host; redes primax-v11-2_app y primax-v11-2_data. No hay volumen externo ni conexión a la base original.
- Las E2E se ejecutaron dentro de tests en la red de esta copia, en esquemas aleatorios separados. El nuevo grupo DEMO exige que DATABASE_URL identifique primax_v11_2. Se conservaron los esquemas de evidencia.
- No se borraron contenedores, volúmenes ni datos de V11. No se hizo reset de ninguna base original. No se hizo commit, push ni despliegue público.

Arranque desde la raíz de V11_2:

```powershell
docker compose -p primax-v11-2 up -d --build
```

Los comandos reproducibles de pruebas y las direcciones están en [README](../README.md). Los ejemplos conservan valores seguros; no se documentaron secretos reales ni se copió un .env con credenciales.

## Conservación de V11

Antes de copiar se registraron SHA-256 de los 373 archivos de V11 en v11-original-baseline.json. La verificación de cierre [V11-ORIGINAL-INTEGRITY.json](V11-ORIGINAL-INTEGRITY.json) coteja archivos y hashes: **373 presentes, cero modificaciones, cero adiciones y cero eliminaciones**. El verificador reproducible solo lee V11 y escribe el informe dentro de V11_2:

```powershell
node tools/verify-v11-original.cjs
```

## Validaciones físicas/manuales pendientes

- Cámara física: placas y tarjetas reales, reflejos, inclinación, iluminación, foco, permisos, cancelación y liberación en los dispositivos que se utilizarán. El navegador automatizado utilizó streams de canvas y fixtures; esto no certifica hardware ni calidad OCR en campo.
- Impresión: apertura/cancelación del diálogo nativo y prueba con la impresora y papel reales, en el navegador del kiosco. Chrome verificó una ventana real con el documento preparado, pero sustituyó window.print para no lanzar un diálogo interactivo durante la automatización. La salida física permanece pendiente y nunca se registra como confirmada automáticamente.
- Probar permisos en móvil real por localhost/HTTPS apropiado; no se afirma cámara sobre HTTP LAN inseguro.
- No se validaron proveedor comercial, cobros bancarios, SUNAT, producción, despliegue público ni APK físico; no forman parte de esta entrega DEMO local.
