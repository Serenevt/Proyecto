# Validación V11_4

Trabajo ejecutado el 24–25 de octubre de 2026, America/Lima. Los registros UTC corresponden al 25. V11_4 está preparada dentro del alcance comprobable; **no se realizó impresión física** ni cobro real.

## Base, entorno y aislamiento

Se creó `C:\Users\MATHIAS\Desktop\V11_4` desde el **contenido actual de trabajo** de `C:\Users\MATHIAS\Desktop\V11_3`, no desde V11_2 ni un commit. V11_4 no existía. Se verificaron 664 archivos de la copia antes de editar, excluyendo dependencias/cachés, Git y archivos secretos locales; no había config.local.json ni claves TLS en PrintAgent de la base. La estructura Backend, FrontEnd_1, FrontEnd_2, PlateRecognition, PostgreSQL y PrintAgent se conserva. Git informó «not a git repository» en V11_3 y V11_4. No hubo commit/push ni publicación.

Se leyeron README y documentación vigente de impresión, validación y build. No se encontraron AGENTS.md aplicables en las ubicaciones examinadas. Node observado v24.22.1; Git 2.56.0.windows.3; Docker Engine 29.9.2. [Sistema Windows consultado](windows-v11_4.json).

- Proyecto Docker `primax-v11-4`, base `primax_v11_4`, volumen nuevo `primax-v11-4_postgres_data`, redes propias app/data.
- Puertos libres comprobados antes de arrancar: FuelFlow 24081, Prime 24082, backend 24000, Mailpit 24025, agente 24443. PostgreSQL opcional 24543; servidor aislado de prueba 24381.
- No se reutilizaron bases/volúmenes de versiones anteriores ni se borraron registros. Al comenzar no había contenedores activos; no se detuvieron servicios ajenos.
- [Manifiesto de versiones anteriores](baseline-previous-v11_4.json): V11, V11_2 y V11_3 conservaron todos los hashes verificados durante la entrega. La comprobación excluye dependencias/cachés; todas las ediciones de la tarea se dirigieron a V11_4.
- [Inventario de archivos modificados/nuevos](CHANGED-FILES-V11_4.md). Sin cambios de esquema ni migraciones. Backend conserva sus fuentes; solo se adapta la guardia de la prueba DEMO a la base exclusiva V11_4. Prime conserva sus fuentes funcionales y OCR no cambia.

## Arranque y URLs verificadas

```powershell
Set-Location 'C:\Users\MATHIAS\Desktop\V11_4'
docker compose -p primax-v11-4 up -d --build
docker compose -p primax-v11-4 ps
```

| Servicio | URL |
|---|---|
| FuelFlow | http://localhost:24081/src/index.html |
| Primax Prime | http://localhost:24082/ |
| Backend health | http://localhost:24000/api/v1/health |
| Mailpit DEMO | http://localhost:24025/ |
| PrintAgent, tras instalación física | https://localhost:24443 |

No hace falta .env para el DEMO local. No introducir credenciales o URLs de bases anteriores. Detener únicamente esta versión con `docker compose -p primax-v11-4 stop`; no usar eliminación de volúmenes. Los seis servicios están saludables después del reinicio. El agente físico es independiente de Docker y todavía requiere instalación en el equipo de la A6.

## Implementación y garantías de transacción

Los botones finales ya estaban corregidos en V11_3 y se conservaron: **Finalizar e imprimir** y **Finalizar y no imprimir**, sin botones extra ni modal de comprobante. La excepción de impresión y la imposibilidad de finalizar se muestran en el ticket principal.

La venta se registra definitivamente en POST `/api/v1/transactions`, después de autorización/avance; `operationId` único, hash de petición y vínculos de autorización/pago mantienen la idempotencia en PostgreSQL. Backend guarda receiptType, receiptDni, receiptRuc y receiptBusinessName. No se cambió esa lógica, precios, descuentos, autorizaciones ni despacho.

`assertCanFinish` conserva las guardias anteriores: inFlight/authorizing, intervención, autorización sin resultado y payload sin confirmación. También comprueba que el ID confirmado coincide con la operación local actual; evita imprimir o limpiar otra venta si cambia en otra pestaña. La nueva consulta `confirmedForPrint` hace **GET del mismo ID**, verifica identidad/bloqueos antes y después y persiste el resultado actualizado. No llama a POST de venta/pago. Si falla backend, se conserva el ticket y no se contacta al agente.

`finish` limpia exclusivamente `fuelflow:operation:v1` cuando las guardias permiten cerrar. Finalizar sin imprimir no llama a printReceipt, no consulta al agente ni descarga/abre ventanas. El backend conserva la venta. Recargar recupera el resultado y la misma identidad; la API mantiene replay para ventas cuya respuesta se perdió.

Para imprimir se usa la transacción confirmada, no la identidad del snapshot anterior. El contrato v2 diferencia BOLETA/DNI de FACTURA/RUC/razón social y conserva decimales como strings canónicos, sin redondear por Number. Campos faltantes esenciales, fecha inválida o precisión no admitida producen error antes del envío. El renderizador usa fecha de Lima, importes en S/, galones a tres decimales y dinero/precio a dos según el esquema existente. No se inventan números fiscales, IGV ni autorizaciones SUNAT; siempre DEMO y advertencia fiscal. Surtidor 03 corresponde al simulador ya configurado.

## Impresión, formato e idempotencia

Se reemplaza texto plano por contrato estructurado v2 validado. La entrada HTTP no admite estilos, impresora, copias, páginas, comandos ni campos arbitrarios. El agente mantiene Host/origen exactos, JSON/cabecera obligatoria y escucha loopback. GET de estado no expone identidad del cliente ni contenido/hash del ticket. Los antiguos POST de texto se rechazan; trabajos ya aceptados o inciertos siguen consultables sin reenviarse ni borrar historial.

ID estable `receipt-<transaction.id>`, consulta previa, agrupación concurrente y registro atómico/fsync antes del adaptador. accepted finaliza interfaz pero conserva `physicalConfirmed:false`; retryable permite reintentar el mismo contenido; unknown no se reenvía automáticamente. Respuesta perdida y reinicio conservan esas garantías. Un cambio de contenido bajo un ID existente se rechaza; no se fuerza una nueva impresión borrando datos.

Formato lógico **228 × 394 centésimas de pulgada**, equivalente aproximado a **57,912 × 100,076 mm**. Se aplica antes del probe y medición. El ancho anterior de 48,05 mm y el de 52,93 mm del formato personalizado son antecedentes distintos, no valores intercambiables. La nueva configuración captura ancho/alto/origen del **formato final**. No se quitó la comprobación de área: se compara contra la medida correcta.

ThermalLayout.cs usa encabezado 10 pt centrado/negrita, cuerpo 7 pt, TOTAL 9 pt negrita, importes a la derecha y agradecimiento centrado. Ajusta texto por medidas GDI, mantiene todos los caracteres y reserva márgenes. Si cabe, puede distribuir espacio sobrante como interlineado sin reducir fuentes. Si no cabe en una página de 100 mm, rechaza **antes de Print()**. No hay longitud automática, recorte, segunda página ni fallback mayor. Se repiten comprobaciones al imprimir; cualquier fallo posterior a iniciar el envío se trata conservadoramente como unknown.

## Pruebas ejecutadas y resultados finales

| Prueba | Resultado |
|---|---:|
| Unitarias FuelFlow | 77/77 |
| Unitarias Prime | 27/27 |
| PrintAgent: contrato, configuración, HTTP, persistencia e idempotencia | 25/25 |
| Backend unitarias | 135/135, 14 suites |
| Backend E2E en PostgreSQL V11_4 | 237/237, 9 suites |
| Backend lint y compilación TypeScript | Correctos |
| Chrome contra contenedores V11_4 | 29/29, sin omitidos ni flaky |
| Chrome con servidor aislado de impresión | 5/5 |
| Layout GDI offscreen con cuatro documentos/áreas | 4/4 |
| Sintaxis JS y análisis sintáctico PowerShell | Correctos |
| OCR en contenedor, regresión | 11/11 |
| Nginx -t en ambos frontends | Correctos |
| Comparación byte a byte de archivos servidos | 33/33 |
| Reinicio de servicios y persistencia financiera | Correcto |

Las cifras son de ejecuciones nuevas de esta tarea. [Resultado Chrome](browser-v11_4-results.json), [unitarias FuelFlow](unit-fuelflow-v11_4.log), [Prime](unit-prime-v11_4.log), [agente](unit-agent-v11_4.log), [backend](backend-checks-v11_4.log). El log backend incluye el envoltorio NativeCommandError de PowerShell al capturar mensajes Docker por stderr; las suites finales muestran 135 y 237 pruebas aprobadas, y lint/tsc sin errores. Las E2E incluyen fallos intencionados para probar recuperación y conservan sus esquemas de evidencia.

Una ejecución intermedia de la batería extendida alcanzó la deuda máxima S/200 de su cliente DEMO compartido. Se aisló el caso adicional en otra cuenta de prueba y se ejecutó de nuevo la batería completa: **29/29**. No se aumentó ni alteró el límite comercial.

Escenarios comprobados en navegador:

1. Dos acciones finales exactas, sin Generar comprobante, ticket-overlay ni modal DEMO.
2. Prepago/pospago × boleta/factura sobre ventas DEMO reales de PostgreSQL, un único POST de impresión simulado y cero POST financieros al finalizar.
3. Doble clic y acciones deshabilitadas durante envío; finalizar sin imprimir genera cero solicitudes al agente, popups o descargas.
4. Agente desconectado, retryable, unknown y respuesta POST perdida: ticket conservado, consulta previa y ausencia de reenvío incierto.
5. Backend 503 antes de imprimir: no se contacta al agente; se puede cerrar sin imprimir sin borrar la venta persistida.
6. Intervención pendiente bloquea ambos cierres y conserva localStorage; cambio de otra pestaña durante GET se comprueba además en unitarias.
7. Snapshot viejo de boleta no sustituye la factura, RUC y razón social confirmados por backend.
8. Error «excede 100 mm» permanece en pantalla y permite finalizar sin imprimir. Esa respuesta se simula en el navegador; el rechazo geométrico real se prueba por separado en GDI.
9. Prime muestra solo la tarjeta inferior de deuda, con exactamente título/importe/mensaje y cero botones internos, al iniciar sesión, recargar, navegar, actualizar y crear nueva deuda. Recarga sigue accesible: saldo 20 → 40 → 30.
10. Stock, cámara/revisión/cancelación, membresía, Yape/Plin DEMO, recuperación y autorización pasan regresión. Los streams de cámara sintéticos no certifican hardware real.

## Medición GDI y muestras visuales

Se compiló y ejecutó **el mismo ThermalLayout.cs** sobre un bitmap System.Drawing de 203 DPI, sin PrintDocument.Print, sin spooler y sin seleccionar otra impresora. Las áreas son fixtures tomadas de los antecedentes del usuario, no probes nuevos de una A6. Prueba: `node tools/test-layout-v11_4.cjs`. [Planos y métricas](layout-results-v11_4.json).

| Caso | Ancho útil supuesto | Contenido mínimo requerido | Alto disponible | Resultado |
|---|---:|---:|---:|---|
| Boleta | 52,93 mm | 71,84 mm | 97,08 mm | Cabe, una página |
| Factura con saldo pendiente | 52,93 mm | 78,16 mm | 97,08 mm | Cabe, una página |
| Boleta, ancho más estrecho | 48,05 mm | 74,75 mm | 97,08 mm | Cabe, una página |
| Factura/estación/combustible largos | 48,05 mm | 136,09 mm | 97,08 mm | Rechazo; no se genera imagen parcial ni impresión |

Se verificaron límites de todas las cajas, alineación de título/pie, TOTAL en negrita, importe a la derecha y una página. El espacio adicional como interlineado no cambia la altura mínima de la tabla ni reduce fuentes. Se inspeccionaron visualmente las muestras:

- [Boleta 52,93](evidence-v11_4/boleta-52_93.png).
- [Factura 52,93](evidence-v11_4/factura-52_93.png).
- [Boleta 48,05](evidence-v11_4/boleta-48_05.png).

Son **renderizados de diagnóstico**, no descargas de reemplazo ofrecidas en la venta ni fotografías de papel. GDI bitmap no certifica el comportamiento del driver real; el adaptador repetirá medición con su Graphics específico antes de enviar.

## Build servido, caché y reinicio

[Archivos servidos](served-builds-v11_4.json): los 12 HTML/JS/CSS de FuelFlow y 21 de Prime coinciden byte a byte con sus builds locales. Responden no-store y X-FuelFlow-Version: V11_4. Se conserva versionado por contenido en recursos/imports transitivos. Chrome encontró cero service workers en ambos orígenes. [Imágenes, puertos, etiquetas y montajes](docker-runtime-v11_4.json) identifican la carpeta V11_4; los frontends no sirven fuentes de V11_3.

- FuelFlow: `V11_4-eeaa1b05d973`.
- Prime: `V11_4-daa0e8740d07`.

Después de reiniciar únicamente postgres, backend, frontend1, frontend2, OCR y Mailpit de V11_4, se recuperó el mismo ticket, se finalizó sin imprimir, se inició sesión en Prime y se recargó. Persistieron los builds, la ausencia del modal y el saldo S/30. [Informe](restart-v11_4.json): **49 transacciones / 55 pagos / 34 deudas antes y después**, cero solicitudes al agente y cero POST financieros al finalizar. Son registros DEMO de las distintas ejecuciones de prueba; no representan cobros reales.

Para repetir: ejecutar primero batería Chrome, `node tools/verify-restart-v11_4.cjs --before`, reiniciar esos seis servicios y ejecutar `node tools/verify-restart-v11_4.cjs`. Las fixtures de cuentas son ficticias locales y no entran en las imágenes web.

## Capturas de interfaz ejecutada

- [Ticket tras reinicio](evidence-v11_4/ticket-after-restart.png).
- [Prepago boleta](evidence-v11_4/ticket-PREPAGO-BOLETA.png) y [prepago factura](evidence-v11_4/ticket-PREPAGO-FACTURA.png).
- [Pospago boleta](evidence-v11_4/ticket-POSTPAGO-BOLETA.png) y [pospago factura](evidence-v11_4/ticket-POSTPAGO-FACTURA.png).
- [Error de conexión inline](evidence-v11_4/ticket-error-inline.png) y [rechazo de formato inline](evidence-v11_4/ticket-overflow-inline.png).
- [Prime escritorio](evidence-v11_4/prime-debt-desktop.png), [móvil](evidence-v11_4/prime-debt-mobile.png) y [después de reinicio](evidence-v11_4/prime-after-restart.png).

Capturas tomadas desde Chrome contra los puertos V11_4 e inspeccionadas visualmente. Las animaciones se desactivan solo al capturar para no registrar transiciones.

## Pendientes físicos y limitaciones precisas

**No se ejecutó PrintDocument.Print ni se aprobó impresión física durante las pruebas.** Accepted del adaptador/spooler significa aceptación del sistema, nunca papel confirmado. En pruebas del agente/navegador se usaron adaptador o respuestas simuladas; en layout, gráficos GDI offscreen reales.

[Inventario de impresoras](printers-v11_4.json): no existe PeriPage A6(1) en el entorno actual. [Probe intentado](probe-v11_4.log) fue bloqueado antes de consultar el driver:

```text
No se puede cargar el archivo C:\Users\MATHIAS\Desktop\V11_4\PrintAgent\probe.ps1 porque la ejecución de scripts está deshabilitada en este sistema.
FullyQualifiedErrorId: UnauthorizedAccess
```

No se modificó la política de seguridad, no se usó Bypass, no se instalaron drivers de variante desconocida ni se cambiaron certificados/secretos. El error no impidió implementar y comprobar contrato, API, persistencia, render GDI, Docker o navegador. La ejecución real del wrapper PowerShell, el probe de la A6, confianza TLS, permiso local del navegador y recepción en su cola quedan pendientes.

En el PC de impresión: identificar A6, instalar su driver y USB de datos; autorizar scripts según política administrativa; ejecutar el nuevo probe con formato final; emparejar una vez mediante configure.mjs con certificados confiables existentes; autorizar el origen exacto y permiso de red local del navegador. Solo tras autorización física específica, hacer una venta DEMO controlada, medir rollo/avance con regla y registrar foto/resultado por separado de accepted. Si el driver alimenta 210/297 mm pese a pedir 394 unidades, detener el uso; no existe fallback automático habilitado.

[Guía de instalación y prueba física controlada](PRINTING-A6-V11_4.md). La conexión desde una web HTTPS remota está contemplada mediante origen autorizado/CSP/TLS/LNA; no se publicó ni probó un dominio remoto real. No hay certificación SUNAT, proveedor comercial ni precisión física de 100 mm validada. Las advertencias DEMO siguen presentes.
