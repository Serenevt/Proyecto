# Validación V11_3

Realizada en Windows con Docker Desktop y Google Chrome. Fecha local: 24 de octubre de 2026, America/Lima (registros UTC del 25 de octubre). Esta entrega no se publicó ni se hizo commit/push.

## Copia y aislamiento

- Ruta: `C:\Users\MATHIAS\Desktop\V11_3`, inicialmente vacía, copiada de `C:\Users\MATHIAS\Desktop\V11_2` sin dependencias/cachés locales.
- Se leyeron README, instrucciones/documentación de impresión, validación y Docker. No se encontraron archivos AGENTS.md aplicables en el árbol examinado.
- Proyecto `primax-v11-3`; base `primax_v11_3`; volumen **nuevo** `primax-v11-3_postgres_data`; redes app/data propias. Sin montar datos de versiones anteriores.
- Puertos loopback: FuelFlow 23081, Prime 23082, API 23000, Mailpit 23025; PostgreSQL opcional 23543. Agente local 23443. Servidor aislado de pruebas de impresión 23381.
- Al iniciar no había contenedores activos en `docker ps`. No se detuvieron, eliminaron ni reconstruyeron servicios de V11/V11_2.
- [Registro Docker](docker-runtime-v11_3.json): etiquetas del proyecto y working directory V11_3, imágenes y montajes. Frontends servidos desde imágenes compiladas, sin montajes de fuentes.
- V11 original: 373 archivos, cero cambios/agregados/eliminados frente a la línea base heredada; [informe](V11-ORIGINAL-INTEGRITY.json). V11_2 y V11 conservaron sus hashes durante las comprobaciones finales: [huellas](previous-versions-v11_3.json). El registro de huellas excluye dependencias/cachés; todas las escrituras de esta tarea se dirigieron a V11_3.

## Arranque reproducible

```powershell
Set-Location 'C:\Users\MATHIAS\Desktop\V11_3'
docker compose -p primax-v11-3 up -d --build
docker compose -p primax-v11-3 ps
```

URLs verificadas:

- FuelFlow: http://localhost:23081/src/index.html (la raíz redirige conservando puerto).
- Primax Prime: http://localhost:23082/.
- API: http://localhost:23000/api/v1/health.
- Mailpit local: http://localhost:23025/.

No se necesita `.env` para los valores DEMO locales. No utilizar variables, bases ni volúmenes de otra versión. El seed solo inicializa esta base. Para detener: `docker compose -p primax-v11-3 stop`. No eliminar volúmenes.

## Causa de los problemas anteriores y corrección

1. **El modal seguía en el código ejecutable.** V11_2 tenía los botones principales renombrados, pero `imprimirYFinalizar` abría `ticket-overlay` al fallar. El HTML conservaba vista previa, dos botones adicionales y traducciones «Comprobante DEMO». Se eliminaron el nodo, sus controles, traducciones y listeners. Los fallos ahora se presentan en `#print-error` dentro de la pantalla Ticket digital. La recuperación presenta directamente el ticket.
2. **La tarjeta inferior aún generaba controles de pago.** El renderer `views.inicio` iteraba deudas e insertaba botones Yape/Plin y recarga en ella. Ahora genera solo h2, importe y mensaje solicitado. El bloque superior ya no estaba en el renderer recibido y se verificó que no existe en los archivos servidos. La recarga permanece como acceso independiente. No se alteraron servicios, conciliaciones o registros de deuda.
3. **Los fuentes no se sirven directamente en Docker.** FuelFlow copia src/assets a dist y Nginx sirve `/usr/share/nginx/html/src/index.html`; Prime compila a www y copia ese resultado a la imagen. Editar una copia del disco o un dist antiguo no cambia contenedores construidos anteriormente. Se reconstruyeron las imágenes de V11_3 y se comprobó el contenido HTTP real.
4. **Caché de código sin versionado suficiente.** FuelFlow retenía JS/CSS una hora y usaba un `?v=7` fijo; los módulos importados no tenían versión. Prime no enviaba política explícita para JS/CSS. Ahora los builds limpian únicamente su salida generada, calculan una versión por contenido y versionan HTML/imports transitivos. HTML, JS y CSS usan `no-store`. No se encontró service worker en los fuentes y Chrome devolvió cero registros en los dos orígenes.

No había servicios previos activos al iniciar, por lo que no es posible atribuir una URL o imagen concreta a la sesión histórica del usuario. Las causas anteriores se comprobaron en fuentes/configuración recibidos; la entrega actual sí se verificó por HTTP y navegador.

## Archivos servidos y caché

[Comprobación byte a byte](served-builds-v11_3.json): 12 archivos HTML/JS/CSS de FuelFlow y 21 de Prime coinciden con los builds locales. Todos devolvieron `Cache-Control: no-store` y `X-FuelFlow-Version: V11_3`. Nginx `-t` pasó en ambos contenedores.

| Aplicación | Build servido |
|---|---|
| FuelFlow | V11_3-ab2135e5e004 |
| Prime | V11_3-daa0e8740d07 |

Consultar http://localhost:23081/build.json y http://localhost:23082/build.json. Si se cambia el código, reconstruir desde esta carpeta; las versiones se recalculan automáticamente. El agente permanece en el equipo físico y no dentro de un contenedor web.

## Pruebas automáticas y navegador

| Grupo | Resultado final |
|---|---:|
| FuelFlow, unitarias | 62/62 |
| Prime, unitarias | 27/27 |
| Agente, almacén persistente y API | 4/4 |
| Backend, unitarias | 135/135, 14 suites |
| Backend, E2E PostgreSQL | 237/237, 9 suites |
| Backend lint y compilación TypeScript | Correctos |
| Navegador contra contenedores V11_3 | 25/25 |
| Navegador, servidor aislado de impresión | 5/5 |
| OCR dentro de su contenedor | 11/11 |
| Sintaxis Node del agente/configurador y análisis sintáctico PowerShell del adaptador | Correctos |
| Nginx y comparación de archivos servidos | Correctos |

Evidencias: [resultado navegador JSON](browser-v11_3-results.json), [backend](backend-checks-v11_3.log), [unitarias FuelFlow](unit-fuelflow-v11_3.log), [Prime](unit-prime-v11_3.log), [agente](unit-agent-v11_3.log). El test DEMO heredado exigía literalmente base V11_2: se adaptó su guardia a V11_3, manteniendo el aislamiento y conservando sus esquemas de evidencia. Las primeras ejecuciones detectaron ese requisito de prueba y selectores antiguos; la tabla corresponde a ejecuciones finales corregidas.

Matriz obligatoria comprobada en Chrome:

| Requisito | Evidencia automática |
|---|---|
| Dos acciones exactas en Ticket digital | Conteo y texto de los dos botones en prepago/pospago × boleta/factura recuperados de PostgreSQL |
| Sin Generar comprobante ni modal DEMO | Texto ausente; nodos ticket-overlay, btn-imprimir, ticket-close y comprobante-text ausentes |
| Un clic / doble clic sin duplicar | Un POST al agente simulado, botones deshabilitados; almacén real de archivos agrupa concurrentes y persiste por ID |
| Finalizar sin imprimir | Cero solicitudes al agente, cero descargas, popups o POST financieros |
| Error, respuesta perdida y reintento | Ticket y operación guardados; GET previo; accepted no se reenvía; unknown no se reenvía; retryable conserva ID |
| Sin duplicados financieros | Finalizar/reintentar producen cero POST financieros; E2E y unitarias comprueban replay, UUID, cobro, stock y recibo únicos |
| Sin bloque superior Prime | Ausencia en login, reload, navegación, refresh y creación de otra deuda |
| Tarjeta inferior exacta | Tres hijos: título, importe de backend y mensaje; cero botones internos; acceso de recarga separado |
| Saldo sincronizado | Nueva deuda: 20 → 40; recarga parcial: 40 → 30, persistente al recargar |
| Conservación de mejoras anteriores | Stock, cámara/revisión/cancelación, boleta/factura, membresía, Yape/Plin DEMO y recuperación pasan regresión |

Las respuestas del sistema de impresión se simulan **solo en las pruebas**. El código desplegado no tiene modo mock, descarga ni window.print de respaldo. Las operaciones financieras de los tests de navegador son DEMO reales de PostgreSQL V11_3. Los streams sintéticos de cámara no certifican capturas con hardware real.

## Reinicio y persistencia

Se reiniciaron únicamente postgres, backend, frontend1, frontend2, OCR y Mailpit de V11_3. Después se abrió de nuevo FuelFlow, se recuperó el mismo comprobante y se finalizó sin imprimir. Se inició sesión en Prime y se recargó la página: tarjeta y saldo S/30 permanecieron correctos. [Informe](restart-v11_3.json).

- Transacciones/pagos/deudas antes: **37 / 41 / 25**.
- Transacciones/pagos/deudas después: **37 / 41 / 25**.
- Cero solicitudes al agente y cero POST financieros al finalizar.
- Mismos builds; modal obsoleto ausente.

Estos conteos son datos DEMO creados por las pruebas, no registros comerciales. Prueba repetible para una nueva corrida: ejecutar primero la batería de navegador, `node tools/verify-restart-v11_3.cjs --before`, reiniciar los seis servicios citados y ejecutar `node tools/verify-restart-v11_3.cjs`. Las fixtures contienen cuentas ficticias locales y no se publican por Nginx.

## Capturas de la aplicación ejecutada

- [Ticket prepago boleta](evidence-v11_3/ticket-PREPAGO-BOLETA.png).
- [Ticket prepago factura](evidence-v11_3/ticket-PREPAGO-FACTURA.png).
- [Ticket pospago boleta pendiente](evidence-v11_3/ticket-POSTPAGO-BOLETA.png).
- [Ticket pospago factura pendiente](evidence-v11_3/ticket-POSTPAGO-FACTURA.png).
- [Error de impresión en el ticket principal](evidence-v11_3/ticket-error-inline.png).
- [Prime escritorio](evidence-v11_3/prime-debt-desktop.png) y [Prime móvil](evidence-v11_3/prime-debt-mobile.png).
- [Ticket después de reiniciar](evidence-v11_3/ticket-after-restart.png) y [Prime después de reiniciar](evidence-v11_3/prime-after-restart.png).

Se inspeccionaron visualmente las capturas. Se desactivaron animaciones únicamente al capturarlas para evitar registrar la transición de entrada.

## Impresión directa: software y validación física separados

La integración está implementada: un clic consulta/envía comprobante existente al agente HTTPS, finaliza al recibir accepted y conserva el ticket ante fallo. Configurador de emparejamiento único, cola/driver USB explícitos, orígenes/Host restringidos, configuración/claves fuera de frontend y almacén persistente están disponibles. El ticket térmico incluye identificación, fecha, estación, surtidor, placa, combustible, cantidad, precio, descuentos, total y estado real; las operaciones pendientes no figuran pagadas.

**No se confirmó impresión física ni aceptación en una cola A6 real.** Las pruebas de aceptación usaron respuestas/adaptador simulados. [Inventario real de impresoras](printers-v11_3.json): EPSON, PDF y OneNote; ninguna A6. Además, la ejecución `powershell.exe -NoProfile -NonInteractive -File PrintAgent/probe.ps1 -PrinterName 'PeriPage A6'` devolvió:

```text
No se puede cargar el archivo C:\Users\MATHIAS\Desktop\V11_3\PrintAgent\probe.ps1 porque la ejecución de scripts está deshabilitada en este sistema.
FullyQualifiedErrorId: UnauthorizedAccess
```

No se cambió la política de ejecución ni se utilizó Bypass. No se instaló un driver sin conocer variante física, no se imprimió en otra cola y no se creó una tarea automática. No hay fallo de autorización Docker: la construcción y ejecución local sí se completaron.

Paso pendiente exacto: conectar/identificar la A6 por USB de datos; instalar su driver oficial, habilitar scripts según política administrativa; medir y confirmar área imprimible de esa unidad; provisionar TLS confiable; emparejar con `configure.mjs`; autorizar el origen y permiso local del navegador durante instalación; probar un ticket sobre papel y registrar el resultado. [Guía completa](PRINTING-A6-V11_3.md). La fuente PeriPage confirma la ruta USB/driver para la variante publicada, pero no permite adivinar el ancho útil de una unidad ausente. La web remota requiere HTTPS y su origen real autorizado; no se realizó despliegue público para probarla.
