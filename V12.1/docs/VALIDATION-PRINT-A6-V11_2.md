# Validación de deuda e impresión A6 — V11_2

Fecha: 2026-10-24, America/Lima. Trabajo limitado a `C:\Users\MATHIAS\Desktop\V11_2`. Sin commit, push, despliegue, migraciones ni cambios de registros financieros.

| Verificación ejecutada | Resultado |
|---|---|
| `npm.cmd --prefix FrontEnd_1 test` | 62/62: recuperación/idempotencia financiera existente, cliente de impresión y datos del ticket |
| `npm.cmd --prefix FrontEnd_2 test` | 27/27: una sola tarjeta de deuda, acceso al pago, actualización del total y saldo disponible preservado |
| `npm.cmd --prefix PrintAgent test` | 4/4: concurrencia, repetición tras reinicio, hash, resultado desconocido, fallo recuperable, rutas/orígenes/Host/cabeceras/límites |
| Playwright `tools/playwright.print.cjs` | 5/5 en Chrome instalado, contra código fuente actual y API/agente interceptados |
| Builds FuelFlow y Prime | Correctos; artefactos locales `dist/` y `www/` actualizados |
| Parser PowerShell y `node --check` | Sin errores de sintaxis en adaptador, probe, servidor, rutas y UI modificados |
| `node tools/verify-v11-original.cjs` | 373 archivos de referencia, 373 actuales; ninguno cambiado, agregado ni ausente; `intact: true` |

Total: 98 pruebas automáticas aprobadas, sin sumar reejecuciones. La primera ejecución de la prueba HTTP falló por el manejo de Host de fetch/Undici; se corrigió el cliente de prueba para usar `http.request` y comprobar el Host real recibido. La primera ejecución Playwright pasó las cinco pruebas pero el cierre del servidor hijo por el mecanismo Windows de Playwright quedó esperando; se detuvo sólo el PID del servidor temporal del puerto 22381 y se reemplazó el arranque de pruebas por un proceso hijo administrado directamente.

Las cinco pruebas de navegador verifican: texto de los botones, bloqueo de acciones durante envío, finalización al aceptar, finalización sin contactar agente, ticket conservado ante agente inaccesible/impresora desconectada simulada/resultado desconocido, consulta al reintentar y **cero POST financieros**. `window.open` y `window.print` se sustituyen por funciones que fallan si la UI intenta usarlas. Las pruebas de cliente verifican pérdida de respuesta después del POST, consulta posterior que recupera aceptación y ausencia de un segundo POST.

La prueba de ticket comprueba boleta y factura, razón social larga, operación/fecha/estación/surtidor/placa, galones/precio, subtotal/descuento/total, método/estado financiero/deuda y leyendas DEMO/SUNAT. La maquetación GDI usa el ancho del driver confirmado durante instalación; **no se ha renderizado ni medido con una A6 real**. El contenido y las reglas de ajuste se comprobaron por software; la legibilidad y avance físico siguen pendientes.

Límites comprobados del entorno:

- `Get-Printer`: acceso denegado. No se pudo inventariar cola, driver ni dispositivo.
- Ejecución de `powershell.exe -File PrintAgent/print.ps1` con entrada de prueba sin impresora válida: bloqueada por política de ejecución, antes de poder ejecutar el adaptador. No se cambió la política. El parser sí se ejecutó y pasó. El agente incluye probe de arranque para detectar esta dependencia antes de aceptar trabajos.
- Docker CLI: acceso denegado al named pipe. No se reiniciaron contenedores ni se ejecutó la suite histórica `tools/v11_2.spec.cjs` contra el despliegue ya existente. Esa suite fue actualizada para el nuevo contrato de agente, pero **no se reporta como ejecutada** en esta entrega.
- No hubo instalación de driver/certificado/servicio ni impresión física. Los ensayos del agente y del navegador usan adaptador/respuestas simuladas; no validan TLS, LNA, driver, USB ni hardware.

Pendientes exactos para habilitar la A6: variante física y driver oficial, cola USB accesible y permisos PowerShell aprobados, ancho/área obtenidos con `probe.ps1` y contraste físico, configuración local de origen/certificado, permiso inicial del navegador, arranque con la cuenta final y prueba en papel sin diálogos. Instalación, arranque, estados y plan de pruebas físicas: [PRINTING-A6-V11_2.md](PRINTING-A6-V11_2.md).

La aceptación se informa como trabajo aceptado por Windows, siempre con `physicalConfirmed: false`. Un resultado desconocido se conserva en disco y no se reenvía automáticamente. La indisponibilidad de impresión no toca cobros, deuda ni abastecimiento.
