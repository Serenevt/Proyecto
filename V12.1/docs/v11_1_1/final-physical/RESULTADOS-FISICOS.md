# V11_1.1 — corrección y validación física final

**Resultado: aprobado por el usuario.** La segunda prueba salió con importe completo, letras legibles y tamaño correcto. Se realizaron dos pruebas físicas, cada una con su autorización expresa y un identificador distinto. No se enviarán más pruebas sin una nueva autorización.

## Causa y corrección del 403

La validación conjunta de `routes.mjs` exigía `X-FuelFlow-Print: 1` y `Content-Type` exactamente `application/json` también a GET `/health`. Por eso una consulta con solo el Origin autorizado devolvía `403 — Solicitud no autorizada`. También rechazaba el tipo válido `application/json; charset=utf-8`. Con los dos encabezados exactos sí respondía 200: el rechazo no provenía de la impresora, un token secreto o el puerto. [Reproducción anterior](403-before.json) · [Comprobación corregida](403-after.json).

Ahora GET `/health`, de solo lectura, exige loopback, Host y Origin autorizados, sin exigir encabezados de un cuerpo inexistente. GET de trabajos mantiene el marcador; POST mantiene marcador y JSON UTF-8 validado. Se admiten únicamente los encabezados previstos en el preflight de cada método. Los errores de trabajos indican `PRINT_MARKER_REQUIRED`, `JSON_CONTENT_TYPE_REQUIRED` o `FETCH_MODE` según el rechazo. Se conservan la restricción a 127.0.0.1, Host exacto, Origin exacto, límites, CORS cerrado, idempotencia y bloqueo de estados desconocidos.

La configuración activa es **PrintAgent/config.http.local.json**. `config.local.json` es la configuración HTTPS histórica, revisada y no sobrescrita. No se instalaron certificados ni se modificó la confianza de Windows.

## Ajuste físico de 48 mm

El driver informa aproximadamente 51,93 mm de área imprimible para el papel personalizado. El usuario confirmó papel de 57 mm y ancho efectivo de impresión de unos 48 mm; en la primera prueba el importe de origen `S/ 12.00` quedó recortado a `12.` en el papel.

El motor ahora limita el área a **48 mm**, con **1 mm de margen interno por lado**, dejando unos **46 mm útiles**. El total se alinea dentro de ese límite. Las medidas del driver se siguen verificando para detectar cambios, pero no se usan para exceder el cabezal real.

Se mantienen Arial **10 pt** en PRIMAX FUELFLOW centrado, **9 pt** en TOTAL y **7 pt** en el cuerpo. Se conservan boleta/factura, advertencias DEMO y sin validez fiscal, datos de operación/cliente, combustible, cantidad, precio, subtotal, descuento y agradecimiento. El ticket de prueba lleva el aviso **PRUEBA DE IMPRESIÓN — SIN VALIDEZ FISCAL**. No se redujo la tipografía para hacer caber el contenido.

Papel lógico de Windows: **224 × 394 centésimas de pulgada = 56,896 × 100,076 mm**, aproximando 57 × 100 mm. La segunda prueba requiere **77,66 mm** de contenido frente a **97,08 mm** disponibles, con una sola página. El usuario confirmó visualmente el tamaño correcto; no se presenta esa aprobación como una calibración metrológica.

## Trabajos enviados y resultados separados

| Comprobación | Primera prueba | Segunda prueba autorizada |
|---|---|---|
| ID estable | receipt-physical-test-5420d52f77bc | receipt-physical-test-62df0adf1b02 |
| Comunicación frontend/PrintAgent | Confirmada | Confirmada |
| Estado PrintAgent | accepted | accepted |
| Windows aceptó | Sí, trabajo 4 | Sí, trabajo 5 |
| POST físico | Uno | Uno |
| Salida del papel | Confirmada por usuario | Confirmada por usuario |
| Formato aprobado | No: recorte del total | **Sí: importe completo, letras legibles y tamaño correcto** |
| Cobros/ventas reales | Ninguno | Ninguno |

La segunda autorización corresponde al mensaje del usuario que pidió otra prueba después de indicar el ancho de 48 mm. El primer trabajo no se reenvió. Cada prueba tiene un marcador exclusivo persistido antes de su POST, y una nueva ejecución del mismo comando se niega a enviar otro trabajo. No se borraron historiales ni se reenviaron trabajos desconocidos.

Ambas pruebas usaron el botón azul real en un perfil de Chrome aislado, con respuestas GET del Backend ficticias e interceptación que bloquea todo POST financiero. El comprobante viajó a PrintAgent y a su adaptador USB real, sin diálogo de impresión de Chrome. Los datos fueron DEMO-001, DNI 00000000, un galón ficticio, subtotal 15, descuento 3 y total 12.00; no se creó una transacción financiera.

Evidencias: [primera prueba](physical-result.json), [segunda prueba](second-test/physical-result.json), [resultado final](FINAL-RESULT.json), [vista corregida](second-test/ticket-preview.png), [cola final](final-printer-state.json). Las respuestas automáticas del agente no afirman salida física; la confirmación del usuario se registra separadamente en estos resultados.

## Impresora y predeterminada

Destino exclusivo **PeriPage A6(1)**, driver **PeriPage A6**, **USB001**, **203 DPI**. No se instaló controlador, no se crearon colas, no se pausaron o eliminaron trabajos.

En la primera prueba Windows, con gestión automática activada, cambió la selección predeterminada desde `PeriPage A6` a la cola utilizada. Se restauró la selección original sin modificar ese modo automático. Se añadió al adaptador una protección que conserva la selección anterior y solo la restaura si Windows la cambia al destino recién utilizado; respeta una tercera elección diferente. Sus ramas se prueban con ajustes simulados, sin imprimir.

La segunda prueba confirmó `original: PeriPage A6`, `after: PeriPage A6`, `restored: true`, `preserved: true`. Su destino siguió siendo PeriPage A6(1). [Restauración inicial](default-printer-restored.json) · [Estado de la segunda prueba](second-test/physical-result.json).

## Archivos principales corregidos

- `PrintAgent/routes.mjs` y `FrontEnd_1/src/js/printReceipt.js`: encabezados y diagnóstico 403.
- `PrintAgent/ThermalLayout.cs`, `config.mjs`, `config.example.json`, `configure.mjs` y configuración HTTP local: límite real de 48 mm y aviso de prueba.
- `PrintAgent/print.ps1` y nuevo `print-state.psm1`: preservación de la predeterminada.
- `PrintAgent/store.mjs` y `contract.mjs`: conservación del resultado de esa preservación, manteniendo estados e identidad.
- Nuevas pruebas de encabezados y predeterminada, comprobación de diseño, generador de vista y herramienta de prueba física con autorización de un solo envío.
- README, comparación de seguridad e informes actualizados.

`server.mjs` se revisó: mantiene HTTP solo en 127.0.0.1:25443 y carga por defecto la configuración HTTP correcta. No fue necesario cambiar la lógica de ventas o cobros del Backend.

## Pruebas automáticas

**329 ejecuciones satisfactorias**: FrontEnd_1 88, FrontEnd_2 27, PrintAgent 53, Backend 135, aislamiento 5, interfaz/HTTP 13 y Chrome/Edge contra la web iniciada 8. Pasaron también lint, compilación y **5 casos térmicos**, incluido total completo dentro de 48 mm y rechazo del exceso de contenido. [Resumen](second-test/test-summary.json).

Los 466 archivos originales de `C:\Users\HP\Desktop\Prueba\V11_1` siguen sin cambios. Todo el código editado está en `C:\Users\HP\Desktop\V11_1.1`. No hubo git push, borrado de bases o volúmenes, cambios de lógica financiera ni cobros o ventas reales.

## Inicio correcto

```powershell
cd C:\Users\HP\Desktop\V11_1.1
node tools/start-v11_1_1.cjs
# En otra terminal, solo si PrintAgent no está ya iniciado:
node PrintAgent/server.mjs PrintAgent/config.http.local.json
```

FuelFlow: http://localhost:26081/src/index.html. Prime: http://localhost:26082/. Backend: http://localhost:26000/api/v1/health. El agente queda iniciado al terminar esta sesión; no abrir otro proceso sobre 25443. Recargar FuelFlow para obtener el módulo actualizado.

Consulta segura, sin impresión:

```powershell
curl.exe -i -H "Origin: http://localhost:26081" http://127.0.0.1:25443/health
```

No ejecutar otra prueba física a partir de estos archivos sin nueva autorización. Los marcadores de ambos envíos deben conservarse.
