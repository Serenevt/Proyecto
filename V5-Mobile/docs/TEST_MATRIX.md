# Matriz de aceptación V5 Mobile

## Automatización

- `npm.cmd test`: reglas V4, descuento/redondeo, historial idempotente, actualización por id, migración sin escritura V4, almacenamiento corrupto/denegado, pago/autorización, despacho y cancelación de temporizadores.
- `npm.cmd run test:mobile`: Chrome con 360×800, 390×844 y 412×915; cuatro métodos de prepago, boleta/factura, membresía, combustibles, postpago, cambio de idioma, ticket/descarga, admin, asistencia, errores, retorno, apertura file:// y almacenamiento denegado. Anchos extra 320, 768 y 1024.
- Los tests registran errores JavaScript; verifican ancho del documento, tamaño de acciones y separación respecto al dock. Capturan screenshot y trace al fallar.
- Comparar SHA-256 de V4 con `V4_BASELINE.json`; revisar Git para confirmar que todas las modificaciones están dentro de V5-Mobile.

## Revisión manual de navegador y Android

| Escenario | Resultado esperado |
| --- | --- |
| Todas las pantallas en tres resoluciones | Sin scroll horizontal ni controles recortados |
| Teclado abierto en DNI, RUC, razón social y placa | Campo enfocado visible; confirmar y volver alcanzables |
| Fuente aumentada y texto largo en tres idiomas | Texto legible y acciones sin solapamiento |
| Pantalla de despacho | Litros/soles visibles, DETENER accesible, una sola transacción |
| Parada anticipada de prepago/postpago | Volumen parcial, totales y estado coherentes con referencia |
| Fondo/retorno y bloqueo del dispositivo | No acumula litros mientras está oculto |
| Voz disponible, silenciada y ausente | Compra completa en todos los casos; mascota repite indicación |
| Diálogos con teclado/TalkBack | Foco contenido, nombre anunciado y retorno al abrir/cerrar |
| Sin almacenamiento persistente | Aviso visible, compra utilizable durante sesión |
| Descarga en Chrome y posteriormente WebView | Comprobante descargable o exportado por adaptador nativo |
| Historial de dos operaciones con la misma placa | Solo se actualiza el pago de la transacción seleccionada |

## Criterios de cierre antes de APK

Flujos conservados, tests aprobados, cero errores de ejecución, sin solapamientos ni scroll horizontal, controles táctiles ≥48 px, traducciones funcionales, estado de pago coherente entre resumen/historial/comprobante, ausencia de duplicados, almacenamiento encapsulado, servicios sustituibles, documentación completa y V4 intacta.

## Resultado de implementación — 7 de octubre de 2026

- 10 pruebas de reglas y servicios aprobadas con Node 24.
- 36 pruebas de navegador aprobadas con Playwright 1.64 y Chrome en Windows: 12 escenarios en cada una de las tres resoluciones objetivo.
- Build estático generado correctamente; comprobación de sintaxis JavaScript y `git diff --check` aprobadas.
- Ocho archivos de V4 verificados por SHA-256 sin cambios. Las modificaciones se limitan a V5-Mobile; sin commits, push ni cambio de rama.
- Revisadas capturas de inicio, pago y resumen. Corregido el efecto de CSS que alteraba la posición de las acciones inferiores y añadido desplazamiento al panel de pago seleccionado.
- La suite final se ejecutó fuera del sandbox para permitir el cierre de procesos de navegador/servidor en Windows; terminó con código 0.

Las comprobaciones de dispositivo físico, teclado Android, TalkBack y WebView deberán registrarse en la fase Android; no se dan por aprobadas mediante emulación de viewport. Capacitor y la generación de APK siguen pendientes de esa fase.
