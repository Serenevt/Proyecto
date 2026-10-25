# V11_1 — publicación del estado funcional V11_4

Esta carpeta publica el estado de trabajo más reciente de **V11_4** bajo el nombre **V11_1**. Se conservan sus interfaces, flujos, reglas comerciales, pruebas y motor de impresión. Los cambios adicionales son de empaquetado, configuración de ejemplo, herramientas de validación y documentación. [Informe de publicación](docs/PUBLICATION-VALIDATION.md) · [Exclusiones](docs/PUBLICATION-EXCLUSIONS.md).

## Arranque local con Docker Compose

Requisitos: Git, Docker con contenedores Linux y Docker Compose v2. Docker debe estar iniciado. En Windows 11 puede utilizarse Docker Desktop. No hace falta Node, npm, Python ni PostgreSQL instalados en el host para arrancar la aplicación.

```powershell
git clone --branch publicar-v11_1-desde-v11_4 https://github.com/Serenevt/Proyecto.git
cd Proyecto/V11_1
docker compose up -d
```

La primera ejecución construye las imágenes que falten, instala dependencias en ellas, espera PostgreSQL, aplica migraciones y crea datos DEMO idempotentes. La disponibilidad depende de la descarga/construcción y los healthchecks; no es inmediata. Consultar:

```powershell
docker compose ps
docker compose logs --tail 80 backend migrate seed
```

Mientras el pull request de esta publicación no esté fusionado, después de clonar debe seleccionarse la rama `publicar-v11_1-desde-v11_4` antes de entrar en V11_1. La secuencia corta anterior funcionará directamente desde la rama predeterminada **una vez revisado y fusionado el PR**. Esta tarea no lo fusiona.

| Servicio | URL predeterminada |
|---|---|
| FuelFlow | http://localhost:25081/src/index.html |
| Primax Prime | http://localhost:25082/ |
| Backend health | http://localhost:25000/api/v1/health |
| Mailpit, correo DEMO local | http://localhost:25025/ |

Cuenta Prime inicial exclusivamente DEMO: `demo@primaxprime.pe`, contraseña `Prime123`, membresía `PRIME-0001`, placa `ABC-123`. No tiene saldo artificial inicial; puede usarse la recarga DEMO existente. La administración local usa `admin-demo` / `LocalAdminV10!` mientras se mantengan los valores DEMO de Compose. No son credenciales de producción. No se incrustan credenciales de servidor en el frontend.

## Persistencia y seguridad local

Proyecto predeterminado `primax-v11-1`, base **primax_v11_1**, volumen `primax-v11-1_postgres_data` y redes propias. No se conecta a V11/V11_2/V11_3/V11_4. PostgreSQL y OCR no publican puertos; las aplicaciones y Mailpit se enlazan solo a 127.0.0.1. Las claves de ejemplo son públicas y exclusivamente locales. No publicar estos puertos en Internet ni tratar este Compose DEMO como configuración de producción.

Para detener sin perder datos: `docker compose stop`. Para volver: `docker compose up -d`. Reinicio: `docker compose restart`. Para incorporar cambios de fuentes/imagen: `docker compose up -d --build`. No ejecutar resets, no eliminar volúmenes ni borrar el historial de ventas/impresión para resolver errores.

El seed se permite únicamente con APP_MODE=local, PAYMENT_ENV=demo y DEMO_WALLET_ENABLED=true. El script original conserva updates vacíos en sus upserts: no restablece contraseñas, saldos, precios, inventario ni ediciones existentes. El arranque publicado tampoco permite activar resincronización de contraseña. Las validaciones originales de producción permanecen sin cambios.

## Configuración opcional

El recorrido básico **no requiere .env ni copiar .env.example**. El .env.example existente es una plantilla de integración avanzada con marcadores, no un archivo listo para este arranque. No copiar credenciales de otro proyecto.

Si los puertos están ocupados, definir variables antes de arrancar o en un .env local no versionado. Por ejemplo, en PowerShell:

```powershell
$env:FRONTEND1_PORT='26081'
$env:FRONTEND2_PORT='26082'
$env:PORT='26000'
$env:MAILPIT_PORT='26025'
docker compose up -d
```

Los proxies internos continúan usando nombres de servicio y el CORS local incorpora los dos puertos frontend configurados. Al cambiar FuelFlow, cambiar también su origen exacto autorizado en PrintAgent durante instalación. Para otra instancia independiente puede usarse COMPOSE_PROJECT_NAME con puertos propios. No compartir un volumen/base entre copias.

`compose.database-local.yaml` ofrece acceso PostgreSQL opcional solo a loopback 25543; no se necesita para usar la web. `compose.lan.yaml` y `compose.database-managed.yaml` son configuraciones avanzadas heredadas y **no forman parte del arranque validado de un comando**; no usarlas para pruebas contra datos reales.

## PeriPage Mini A6 USB y PrintAgent en Windows

Docker Compose arranca las aplicaciones aunque la impresora/agente no estén disponibles. **No instala un driver Windows, crea una cola, confía certificados ni imprime físicamente.** El agente corre en el PC Windows conectado a la A6, incluso si la web está alojada en otro equipo.

Se conserva sin cambios el motor de V11_4: formato lógico 228 × 394 centésimas de pulgada (aprox. 57,912 × 100,076 mm), medición previa, encabezado/cuerpo/total diferenciados, ajuste de texto y rechazo seguro si no cabe. No hay descarga, window.print, vista previa, otra impresora ni segunda página de respaldo. El ticket tiene solo Finalizar e imprimir y Finalizar y no imprimir. Ante fallo se conserva la operación y el error aparece en el ticket principal.

Preparación única:

1. Instalar el driver oficial de la variante PeriPage A6 y conectar USB de datos. Verificar cola exacta (esperada PeriPage A6(1)), controlador PeriPage A6 y puerto USB correspondiente. No cambiar la predeterminada.
2. Autorizar los scripts bajo la política administrativa del equipo, sin Bypass. Ejecutar el probe existente sobre el formato final; comparar área útil de ese formato, no el ancho predeterminado.
3. Reutilizar certificado/clave localhost confiables si existen, o provisionarlos localmente con la PKI/mkcert oficial. No distribuir claves privadas. Guardar configuración y datos en carpeta exclusiva, por ejemplo `C:\FuelFlowPrintV11_1`, con ACL apropiadas.
4. Con Node 22/24 instalado **solo para el agente Windows**, emparejar una vez y arrancar con los scripts originales:

```powershell
node PrintAgent/configure.mjs --printer 'PeriPage A6(1)' --origin http://localhost:25081 --key 'RUTA_REAL/localhost-key.pem' --cert 'RUTA_REAL/localhost.pem' --out 'C:/FuelFlowPrintV11_1/config.local.json' --confirm-a6
node PrintAgent/server.mjs 'C:/FuelFlowPrintV11_1/config.local.json'
```

El agente mantiene `https://localhost:24443`, restringido a loopback, Host, origen exacto y solicitudes previstas. No ejecutar dos agentes sobre el mismo puerto ni reutilizar un almacén ajeno. El nombre interno data-v11_4 del script se conserva y queda relativo a la carpeta exclusiva de configuración V11_1. Para web remota se requiere HTTPS, origen autorizado real, CSP que permita localhost:24443, confianza TLS y permiso de acceso local del navegador concedido durante instalación.

Diagnóstico y procedimiento físico controlado detallados en [PRINTING-A6-V11_4.md](docs/PRINTING-A6-V11_4.md); donde la guía histórica use 24081 o rutas del equipo original, aplicar el origen **25081** y las rutas locales elegidas arriba. El configurador obtiene las medidas reales del driver; no introducir a ciegas 48,05 o 52,93 mm.

No se realizaron impresiones físicas en esta publicación. Una prueba futura exige autorización específica, una única operación DEMO, comprobación de ID/cola y medición con regla del avance de 100 mm. Accepted indica aceptación del sistema de impresión, no papel confirmado. No reenviar unknown ni borrar historial. La precisión física depende del driver/unidad y sigue pendiente.

## Alcance del DEMO y validación

Yape/Plin y los demás medios conservan las simulaciones y controles de V11_4; no representan cobros comerciales. Mailpit captura el correo localmente y no envía SMTP externo. OCR corre en su contenedor; cámara, permisos y equipo físico tienen requisitos propios. Los comprobantes conservan DEMO / Sin validez fiscal / No validado por SUNAT. No se certifica facturación SUNAT, pagos reales ni uso productivo.

Prime conserva el resumen inferior SALDO PENDIENTE con importe backend y mensaje de recarga, sin bloque duplicado superior ni botones Yape/Plin internos. Se mantiene el acceso de recarga.

El [informe de publicación](docs/PUBLICATION-VALIDATION.md) separa el primer arranque desde archivos publicables, pruebas nuevas, persistencia y limitaciones físicas de la evidencia histórica. Los informes V11_4 y anteriores se conservan como historia: no son una prueba nueva ni una promesa de servicios remotos activos.

`README-V11_4-SOURCE.md` conserva literalmente el README de origen como evidencia histórica. Sus comandos, puertos y rutas pertenecen a V11_4 y **no deben ejecutarse como instrucciones de esta carpeta**; para V11_1 utilizar este README. Lo mismo aplica a los verificadores históricos de árboles anteriores: no forman parte del arranque ni de la validación portable publicada.
