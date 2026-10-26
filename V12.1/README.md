# Primax FuelFlow V11_1.1 — HTTP exclusivamente por loopback

Trabajar desde `C:\Users\HP\Desktop\V11_1.1`. El original se conserva intacto. Esta versión usa **http://127.0.0.1:25443** para PrintAgent, sin certificados ni cambios de confianza de Windows. La configuración HTTPS anterior queda inactiva y sus claves se conservan protegidas.

## Iniciar las aplicaciones

Requisitos: Docker Desktop con contenedores Linux y Node.js 22 o 24.

```powershell
cd C:\Users\HP\Desktop\V11_1.1
node tools/start-v11_1_1.cjs
```

El iniciador comprueba la base y volumen privados, los puertos y los proveedores locales. Rechaza variables heredadas que apunten a otras versiones o a proveedores externos. Inicia Backend, FrontEnd_1, FrontEnd_2, OCR, PostgreSQL y Mailpit. Puede reutilizar las imágenes ya construidas.

| Componente | URL |
|---|---|
| FuelFlow | http://localhost:26081/src/index.html |
| FuelFlow, alternativa con IP literal | http://127.0.0.1:26081/src/index.html |
| Primax Prime | http://localhost:26082/ |
| Backend | http://localhost:26000/api/v1/health |
| Mailpit DEMO | http://localhost:26025/ |
| PrintAgent, API restringida | http://127.0.0.1:25443 |

El proyecto Compose es `primax-v11-1-1`, base `primax_v11_1_1`, volumen `primax-v11-1-1_postgres_data`. PostgreSQL y OCR no publican puertos; las aplicaciones se enlazan a 127.0.0.1. No uses los overrides LAN o de base administrada para esta instalación.

```powershell
# Estado y diagnóstico de arranque
node tools/start-v11_1_1.cjs --check
docker compose --project-name primax-v11-1-1 --file compose.yaml ps
docker compose --project-name primax-v11-1-1 --file compose.yaml logs --tail 60 backend migrate seed
# Detener conservando datos
node tools/start-v11_1_1.cjs --stop
```

Después de editar fuentes, detener y arrancar con `node tools/start-v11_1_1.cjs --rebuild`. No borrar volúmenes ni historial de trabajos. Las claves de Compose y cuentas iniciales son DEMO local: Prime `demo@primaxprime.pe` / `Prime123`; administración `admin-demo` / `LocalAdminV10!`. No se habilitan pagos reales, SMTP externo ni validez SUNAT.

## PrintAgent sin certificados

En otra terminal:

```powershell
cd C:\Users\HP\Desktop\V11_1.1
node PrintAgent/server.mjs PrintAgent/config.http.local.json
```

El destino obligatorio es **PeriPage A6(1)**, driver PeriPage A6, USB001, **203 × 203 DPI**. Se verifica con un probe antes de aceptar solicitudes. No se usa la impresora predeterminada. Ctrl+C detiene el agente.

El servidor escucha solamente en **127.0.0.1:25443**, sin IPv6, LAN ni Internet. Exige Host `127.0.0.1:25443` y Origin exacto emparejado. Los trabajos requieren `X-FuelFlow-Print: 1`; sus POST requieren `Content-Type: application/json`, admitiendo el parámetro estándar `charset=utf-8`. Sus GET no necesitan Content-Type porque no llevan cuerpo. CORS no admite comodines o credenciales. `localhost:26081` y `127.0.0.1:26081` son orígenes distintos y ambos están expresamente configurados. No se permite acceso desde otras versiones, LAN o sitios remotos.

La configuración nueva conserva el historial **PrintAgent/data-v11_1_1**. No se cambia la identidad de los trabajos al pasar de HTTPS a HTTP. No borres ese directorio para resolver errores. El archivo anterior `config.local.json` y certificados no se utilizan y no se sobrescribieron. El script antiguo para confiar certificados quedó deshabilitado.

Para otra instalación, el configurador crea un archivo nuevo con las medidas reales y se niega a sobrescribirlo:

```powershell
node PrintAgent/configure.mjs --printer 'PeriPage A6(1)' --origin http://localhost:26081 --origin http://127.0.0.1:26081 --out PrintAgent/config.http.local.json --confirm-a6
```

No repetirlo sobre la configuración existente. No requiere clave ni certificado.

## Diagnóstico sin imprimir

Con el puerto 25443 libre:

```powershell
node tools/diagnose-print-v11_1_1.cjs
```

El comando inicia temporalmente el agente real con `--diagnostic`, bloquea trabajos, consulta GET `/health`, verifica la dirección de escucha y lo detiene. No imprime ni modifica certificados, driver, cola o impresora predeterminada. La consulta de salud es de solo lectura y basta su Origin autorizado; no exige encabezados de impresión o cuerpo JSON. Abrir `/health` directamente en la barra del navegador sigue siendo rechazado por falta de Origin.

Con el agente ya iniciado, comprobar su salud sin generar trabajos:

```powershell
curl.exe -i -H "Origin: http://localhost:26081" http://127.0.0.1:25443/health
```

El 403 anterior se debía a exigir encabezados de impresión también en GET `/health`, y a rechazar el parámetro JSON UTF-8. Los errores de trabajos ahora identifican el encabezado que falta, sin omitir el control. `PrintAgent/config.local.json` es la configuración HTTPS histórica; la activa es `PrintAgent/config.http.local.json`.

El botón **Finalizar e imprimir** consulta la transacción confirmada, consulta el mismo `receipt-ID` y únicamente cierra al recibir `accepted` con ese ID. Bloquea dobles clics y conserva el ticket ante errores. `unknown` solo se consulta; nunca se reenvía automáticamente. `accepted` no confirma papel físico. **Finalizar y no imprimir** no contacta al agente ni crea otra venta.

El formato es 57 × 100 mm nominales: Windows lo representa como 224 × 394 centésimas de pulgada, **56,896 × 100,076 mm**. Se mantienen el diseño de boleta y factura, medición previa, una sola página y rechazo de exceso. El usuario aprobó la segunda prueba física: importe completo, letras legibles y tamaño correcto. Toda impresión adicional de prueba requiere una nueva autorización.

El usuario confirmó que el cabezal solo aprovecha unos **48 mm**, aunque el driver informa 51,93 mm al seleccionar ese papel. El motor ahora limita el área de contenido a **48 mm**, con márgenes internos de 1 mm por lado (aproximadamente 46 mm para texto y total). Las medidas informadas por el driver se conservan para detectar cambios de instalación, pero no se usan para ensanchar el contenido por encima del cabezal. Se mantienen 10 pt en el encabezado, 9 pt en el total y 7 pt en el cuerpo.

La prueba física inicial fue aceptada por Windows y salió, pero recortó el final del total. El usuario autorizó y aprobó una segunda prueba con el diseño corregido a 48 mm. Los resultados y la aprobación visual se registran en [el informe físico](docs/v11_1_1/final-physical/RESULTADOS-FISICOS.md). No se debe repetir un trabajo ni borrar sus marcadores de autorización para hacer otra prueba.

Windows tiene activada la gestión automática de la predeterminada. El adaptador conserva la selección anterior y solo la restaura si Windows la cambia a la cola que acaba de usar; no desactiva esa gestión ni sustituye una tercera elección del usuario. El destino del trabajo sigue siendo exclusivamente `PeriPage A6(1)`.

## Navegador y seguridad

Recargar FuelFlow para obtener los módulos actualizados. Debe abrirse desde `localhost` o `127.0.0.1` en este PC. Si una política del navegador bloquea el acceso local, se conserva el ticket y se informa el error; no se cambian políticas, flags ni permisos automáticamente.

HTTP por loopback no cifra ni autentica criptográficamente al servidor. Es apropiado aquí bajo el supuesto de un PC y usuario local confiables; Origin/Host/CORS protegen frente a otros sitios web, no frente a malware o procesos nativos del mismo equipo. No extender este transporte a una red o Internet. [Comparación y alcance](http-local.md).

## Pruebas

```powershell
# Suite segura, sin pagos, migraciones ni impresión física
node tools/validate-v11_1_1.cjs
# Chrome y Edge contra la web ya iniciada; agente real en diagnóstico y adaptador simulado
node FrontEnd_2/node_modules/@playwright/test/cli.js test --config tools/playwright.http-live.cjs
```

La segunda prueba necesita el puerto 25443 libre. En una instalación limpia, instalar dependencias solo en la copia: `npm ci --prefix Backend`, `npm run prisma:generate --prefix Backend`, `npm ci --prefix FrontEnd_2`. Ya no se necesita OpenSSL para la validación del agente.

[Resultados actuales](docs/v11_1_1/RESULTADOS.md) · [Evidencias HTTP](docs/v11_1_1/http-local). Los documentos con HTTPS o versiones anteriores son históricos y no son instrucciones de esta instalación.
