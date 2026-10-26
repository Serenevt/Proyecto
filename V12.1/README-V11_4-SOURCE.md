# FuelFlow / Primax Prime · V11_4

Copia del **árbol de trabajo actual** de `C:\Users\MATHIAS\Desktop\V11_3`, verificada antes de editar (664 archivos de trabajo, excluyendo dependencias/cachés). No se partió de V11_2 ni de un commit. V11_3 no contenía repositorio `.git`. Se conservaron V11, V11_2 y V11_3; no hubo commit, push ni publicación.

## Ejecutar en Windows 11

Requiere Docker Desktop con contenedores Linux:

```powershell
Set-Location 'C:\Users\MATHIAS\Desktop\V11_4'
docker compose -p primax-v11-4 up -d --build
docker compose -p primax-v11-4 ps
```

- FuelFlow: http://localhost:24081/src/index.html
- Primax Prime: http://localhost:24082/
- Backend: http://localhost:24000/api/v1/health
- Mailpit DEMO: http://localhost:24025/

Base `primax_v11_4`, volumen nuevo `primax-v11-4_postgres_data`, redes propias y puertos loopback. PostgreSQL no se publica por defecto; override opcional `compose.database-local.yaml` usa 24543. No usar variables/bases/volúmenes de otras versiones. No hace falta `.env` para el DEMO local. Para detener solo esta versión: `docker compose -p primax-v11-4 stop`. No eliminar volúmenes ni registros.

## Cambios de esta entrega

- Se conservan las dos acciones directas del ticket y la eliminación del modal DEMO de V11_3. Los errores permanecen en la misma pantalla.
- Antes de imprimir se comprueban los bloqueos de cierre y la identidad de la operación; GET de la transacción existente actualiza el estado financiero sin cobrar ni registrar otra venta. Si falla backend, se conserva la operación. Finalizar sin imprimir no consulta al agente.
- Contrato de comprobante **v2 estructurado**, validado y sin parámetros arbitrarios de impresora, fuente, páginas o copias. Boleta utiliza DNI; factura RUC/razón social. Los importes decimales se conservan como strings. No se imprimen null/undefined/NaN.
- Diseño GDI real con encabezado centrado 10 pt, cuerpo 7 pt, TOTAL 9 pt en negrita, importes a la derecha y agradecimiento centrado. Mismo motor para medición y dibujo. Pruebas offscreen con System.Drawing a 203 DPI sin enviar trabajos.
- Papel solicitado al driver: **228 × 394 centésimas de pulgada = 57,912 × 100,076 mm**. Área útil medida después de aplicar ese formato. Rechazo antes de impresión si no cabe. Sin recorte, reducción de fuente, longitud automática, segunda página ni formato alternativo.
- Identificador persistente por comprobante, consulta previa, bloqueo durante envío y estados accepted/retryable/unknown. Respuesta perdida o reinicio no autoriza reenviar un trabajo incierto. GET de estado no expone el contenido del ticket.
- Prime conserva su tarjeta inferior de deuda con importe backend y mensaje solicitado, sin botones internos; acceso de recarga separado. No se modificó su lógica funcional.
- Builds V11_4 versionados por contenido; se conserva `no-store` en HTML/JS/CSS. Docker compila los fuentes de esta copia.

No se modificaron precios, descuentos, autorizaciones, despacho ni el esquema de la base. Se conserva **DEMO / Sin validez fiscal / No validado por SUNAT**. No existe integración fiscal SUNAT certificada.

## PrintAgent e instalación física

[Guía de instalación, configuración y prueba controlada](docs/PRINTING-A6-V11_4.md).

El agente se ejecuta en el PC de la A6 y escucha solo `https://localhost:24443` en loopback; autoriza `http://localhost:24081` o el origen HTTPS remoto exacto. No comparte el puerto ni almacén con versiones anteriores. Configuración inicial por `configure.mjs`, una vez, sin selector durante ventas. Las claves TLS y credenciales permanecen fuera del frontend.

**No se imprimió físicamente durante esta tarea.** En el equipo de esta sesión no aparece PeriPage A6(1), solo EPSON/PDF/OneNote; además `-File probe.ps1` está bloqueado por política de scripts (`UnauthorizedAccess`). Los datos de cola/driver/USB001 y la página Windows proporcionados por el usuario son antecedentes, no una nueva comprobación nuestra. El ancho útil final y los 100 mm físicos necesitan prueba autorizada en la unidad real. No se modificaron políticas, certificados, impresoras predeterminadas ni secretos.

## Validación

[Resultados y capturas](docs/VALIDATION-V11_4.md). [Lista de archivos cambiados](docs/CHANGED-FILES-V11_4.md).

```powershell
npm.cmd --prefix FrontEnd_2 ci --no-audit --no-fund
npm.cmd --prefix FrontEnd_1 test
npm.cmd --prefix FrontEnd_2 test
npm.cmd --prefix PrintAgent test
node tools/test-layout-v11_4.cjs
docker compose -p primax-v11-4 --profile test build tests
docker compose -p primax-v11-4 --profile test run --rm --no-deps tests
node FrontEnd_2/node_modules/@playwright/test/cli.js test -c tools/playwright.v11_4.cjs
node FrontEnd_2/node_modules/@playwright/test/cli.js test -c tools/playwright.print.cjs
node tools/verify-previous-v11_4.cjs --verify
```

Las pruebas usan ventas y pagos **DEMO locales**, y un adaptador/respuestas de impresión simulados. El test de layout usa GDI offscreen y no llama a PrintDocument.Print. Esperar servicios saludables antes de las pruebas. Los registros E2E se conservan en esquemas exclusivos de V11_4. Evitar ejecuciones repetidas de registros inmediatamente por el límite de autenticación.

La documentación y evidencias de V11_3 se conservaron como historia; sus URLs, resultados y configuración no corresponden a V11_4.
