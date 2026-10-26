# V12: staging en Vercel

Estado: **API y Prime desplegados en proyectos Vercel dedicados a staging**, ambos en el entorno Production de esos proyectos. `primax-v12-db-staging` es una Neon Free exclusiva, con esquema migrado y conectada solo a la API. La integración GitHub queda pendiente; los despliegues actuales se hicieron por CLI. Este documento se limita a V12.

## Topología

| Servicio | Primera salida | Comunicación |
| --- | --- | --- |
| FrontEnd_2 (Prime) | Proyecto Vercel estático, raíz `V12/FrontEnd_2`, salida `www` | Navegador → API HTTPS pública, URL compilada con `PRIME_API_BASE_URL` |
| Backend | Proyecto Vercel NestJS, raíz `V12/Backend` | API → PostgreSQL gestionado; API → SMTP; API → OCR solo si se habilitan rutas de terminal |
| FrontEnd_1 (FuelFlow) | Compose local | Nginx local añade `x-kiosk-key` y habla con Backend local |
| PlateRecognition | Compose local | Backend local → OCR por red privada Compose |
| PrintAgent | Equipo Windows local | Navegador local → `127.0.0.1:25443`; PowerShell/driver USB e historial persistente local |

`compose.yaml`, sus overrides, los puertos, el nombre de proyecto `primax-v11-1-1` y el volumen `postgres_data` permanecen iguales. No arrancar Compose contra una base remota ni usar `down -v`. La opción `compose.database-managed.yaml` ya existe, pero no forma parte de esta preparación.

## Configuración de los proyectos

Los proyectos son `primax-v12-api-staging` y `primax-v12-prime-staging`, con las raíces indicadas y Node.js 22.x. Backend usa una sola región de funciones, `gru1` (São Paulo). `Backend/vercel.json` fija el preset NestJS y genera Prisma antes de compilar. `FrontEnd_2/vercel.json` sirve el resultado de `npm run build` desde `www`. Ningún Dockerfile se usa en Vercel; siguen siendo la ruta local y una base para K3s.

En FrontEnd_2, Production tiene la variable de **build** `PRIME_API_BASE_URL=https://primax-v12-api-staging.vercel.app/api/v1`. La URL queda dentro del JavaScript publicado, por lo que debe ser pública y HTTPS. Prime no recibe variables de PostgreSQL ni secretos de Backend. La aplicación Android conserva su proceso independiente de build.

En Backend, configurar las variables de ejecución como secretos por entorno; no subir valores reales a Git:

| Grupo | Variables | Criterio |
| --- | --- | --- |
| Base | `DATABASE_URL`; URL directa separada para la tarea de migración | Runtime con endpoint agrupado y TLS; migración con conexión directa a la **base de preproducción** |
| Identidad | `JWT_SECRET`, `KIOSK_API_KEY`; `ADMIN_USER` y `ADMIN_PASSWORD_HASH` solo si se habilita administración real | Valores aleatorios o hash propios; nunca los DEMO de Compose |
| Web | `CORS_ORIGINS` | Origen HTTPS exacto de Prime, sin ruta ni comodín; añadir Android solo cuando se pruebe |
| Recuperación | `PASSWORD_RESET_DELIVERY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | SMTP de pruebas autorizado o recuperación deshabilitada de forma explícita |
| Negocio | `APP_MODE=staging`, `PAYMENT_ENV=demo`, `DEMO_WALLET_ENABLED=true`, `SHOW_DEMO_ADMIN_CREDENTIALS=false` | `CULQI_SECRET_KEY` y `PAYMENT_WEBHOOK_SECRET` deben estar ausentes o vacíos; la validación rechaza cualquier valor configurado |
| OCR | `PLATE_RECOGNITION_URL`, `PLATE_CONFIDENCE_THRESHOLD` | No usar `plate-recognition:8000` desde Vercel; OCR y rutas de terminal quedan fuera de la primera salida |

La API configura CORS en `Backend/src/setup-app.ts` y acepta encabezados `Authorization`, `Content-Type` y `X-Kiosk-Key`. CORS solo controla navegadores: un cliente directo puede invocar la API. La clave de terminal jamás debe incluirse en el frontend. La API de Vercel debe rechazar operaciones de terminal hasta que exista acceso de operador apropiado.

## Comportamiento de staging

`APP_MODE=staging` exige `PAYMENT_ENV=demo` y `DEMO_WALLET_ENABLED=true`. Acepta recargas virtuales de socios y órdenes DEMO para deudas de prueba existentes. El adaptador Culqi rechaza staging antes de cualquier conexión externa, incluso si se invoca por error. El backend rechaza cualquier clave Culqi o secreto de webhook configurado. Las rutas de webhook comercial responden 401 al no haber secreto. Las credenciales admin DEMO no se exponen.

Mientras `STAGING_FUELFLOW_ENABLED` no sea `true`, todas las rutas `@KioskOnly` responden 403 en staging, con o sin clave válida. Las rutas `@MemberOrKiosk` admiten JWT válido de socio y rechazan identidad de terminal. Tras activar FuelFlow con sus dos credenciales y rutas explícitas, Backend permitirá solo las operaciones DEMO enumeradas más abajo. Prime puede demostrar registro, perfil, saldo y recargas virtuales; los puntos pueden generarse mediante consumos autorizados de FuelFlow. OCR e impresión siguen locales.

Compose conserva `local/demo` sin cambios. El futuro `production` sigue requiriendo Culqi live, SMTP real y OCR HTTPS; rechaza recargas virtuales. Ningún modo staging autoriza cobros reales.

## PostgreSQL y migraciones

Neon Free `primax-v12-db-staging` está en São Paulo y conectada únicamente a Production de `primax-v12-api-staging`. `DATABASE_URL` es la conexión agrupada de runtime; `DATABASE_URL_UNPOOLED` es la directa para tareas controladas. Las migraciones versionadas se aplicaron una vez y `prisma migrate status` confirmó el esquema actualizado. No correr migraciones en cada función, no ejecutar `prisma migrate reset` ni el seed local sobre esta base.

## Catálogos ficticios de staging

`Backend/scripts/seed-staging-catalogs.cjs` carga únicamente una estación ficticia, tres combustibles, tres inventarios iniciales y tres beneficios sin validez comercial. No crea usuarios, credenciales, wallets, puntos, transacciones, deudas ni órdenes. Usa `createMany` con `skipDuplicates` y conserva el inventario existente en ejecuciones posteriores; un catálogo con el mismo código y datos distintos provoca error antes de escribir. Exige `APP_MODE=staging`, `PAYMENT_ENV=demo`, Neon en `sa-east-1`, URL directa no agrupada, entorno Vercel Production y la confirmación explícita `STAGING_CATALOG_SEED_CONFIRM=primax-v12-db-staging`.

La carga inicial se ejecutó una sola vez durante un build remoto controlado con la confirmación como variable **solo de build** y `--skip-domain` para conservar el alias estable de la API. Después se restauró el `buildCommand` habitual de `Backend/vercel.json`. Las credenciales Neon permanecen como Secret de Vercel; no se descargaron a archivos locales. Registro y recarga DEMO se prueban desde Prime con cuentas creadas normalmente. La recarga aumenta saldo, pero no genera puntos: un canje exitoso requiere una fuente de puntos separada y autorizada. Las deudas y órdenes DEMO requieren un dato de prueba adicional y no se crean con este cargador.

## Comprobaciones por fase

1. **En cada cambio de código:** lint, pruebas y build de los componentes afectados; comprobar `git diff --check` y que no haya secretos ni archivos `.env` rastreados.
2. **Tras cargar catálogos:** comprobar por API pública estación, combustibles, inventarios y beneficios; no asumir que la carga de catálogos genera usuarios, puntos o transacciones.
3. **Pruebas de Prime:** registrar una cuenta ficticia, iniciar sesión, comprobar perfil, wallet, recarga DEMO, CORS y ausencia de Culqi. Canje exitoso y pago de deuda requieren sus propios datos de prueba aprobados.

No ejecutar pruebas E2E destructivas contra la base gestionada ni borrar datos o volúmenes.

## Base para Kubernetes/K3s posterior

Conservar los Dockerfiles actuales como punto de partida. El futuro clúster necesitará Deployments separados para Backend, ambos frontends y OCR; Services internos para Backend y OCR; Secrets para claves y credenciales; ConfigMaps para valores públicos; probes de salud; y un Job de migración que termine antes de activar una nueva versión de Backend. PostgreSQL gestionado no necesita volumen del clúster; PrintAgent y su historial permanecen en el equipo Windows. No crear manifiestos ni mover datos hasta definir el clúster, su entrada HTTPS y su gestor de secretos.

## FuelFlow staging: implementación preparada, sin desplegar

`FrontEnd_1` tiene un build estático `dist` y un BFF en `api/` + `server/`. El proyecto futuro `primax-v12-fuelflow-staging` usará Root Directory `V12/FrontEnd_1`, Node 22.x, región `gru1`, `npm run build`, salida `dist` y el entorno Production dedicado a staging. `vercel.json` redirige `/` a `/src/index.html` y dirige `/api/session` y `/api/v1/*` a una función. La URL estable prevista es `https://primax-v12-fuelflow-staging.vercel.app`; se debe confirmar al crear el proyecto.

El navegador recibe únicamente configuración pública de build (`FUELFLOW_DEPLOYMENT=staging`, `FUELFLOW_STATION_CODE=STAGING-DEMO-01`). El BFF usa `FUELFLOW_PUBLIC_ORIGIN=https://primax-v12-fuelflow-staging.vercel.app` y `FUELFLOW_API_UPSTREAM=https://primax-v12-api-staging.vercel.app/api/v1` en runtime. Solo el BFF y el Backend reciben `STAGING_FUELFLOW_PROXY_KEY` como Secret y `STAGING_FUELFLOW_OPERATOR_IDS` como lista server-side de UUID de socios creados normalmente. Configurar también `STAGING_FUELFLOW_ENABLED=true` **solo** en Backend Production al abrir el acceso, tras validar las dos implementaciones. No añadir credenciales de PostgreSQL a FuelFlow. Los operadores se autentican con su cuenta Prime; un socio fuera de la lista no accede a la terminal.

El Backend exige simultáneamente JWT válido del operador, UUID autorizado y clave exclusiva del BFF para cada ruta FuelFlow staging. Atribuye cada solicitud autorizada al operador en logs estructurados por ruta y `operationId` cuando existe. El BFF limita métodos y rutas y rechaza deuda, administración, OCR y reembolsos. Backend también rechaza `allowDebt` y cualquier saldo pendiente al cerrar una transacción de este origen. Los cuatro métodos de demostración son saldo Prime, efectivo, tarjeta y Yape/Plin. Culqi sigue bloqueado por `APP_MODE=staging`. La UI pública usa entrada manual de placa; impresión HTTP con PrintAgent sigue disponible únicamente en el entorno local.

Antes del primer despliegue, confirmar el dominio real, crear una clave aleatoria de al menos 32 bytes, seleccionar UUID de operadores de staging y configurar las variables únicamente en Production. El frontend no debe recibir la clave local `KIOSK_API_KEY`, `JWT_SECRET`, URLs PostgreSQL ni credenciales Neon. El acceso falla cerrado si falta cualquier dato de runtime; el WAF es una protección adicional y no forma parte de la prueba de autorización. Las solicitudes pendientes conservan sus UUID para recuperación. No ejecutar seed ni migraciones por desplegar FuelFlow.
