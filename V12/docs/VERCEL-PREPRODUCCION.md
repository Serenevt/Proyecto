# V12: base de despliegue en Vercel (sin desplegar)

Estado: **modo staging implementado; aún no hay base gestionada ni despliegue**. Falta validar el sistema completo contra una base de pruebas aislada antes de exponer la API. Este documento se limita a V12; el README principal conserva instrucciones históricas de V11_1.1.

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

Crear **dos** proyectos Vercel con las raíces indicadas. `Backend/vercel.json` fija el preset NestJS y genera Prisma antes de compilar. `FrontEnd_2/vercel.json` sirve el resultado de `npm run build` desde `www`. Configurar Node.js 22 o 24, dentro del rango de `Backend/package.json`; confirmar el resultado con un build de preview antes de asignar dominios de preproducción. Ningún Dockerfile se usa en Vercel; siguen siendo la ruta local y una base para K3s.

En FrontEnd_2 configurar la variable de **build** `PRIME_API_BASE_URL=https://<dominio-api>/api/v1`. La plantilla `FrontEnd_2/vercel.env.example` contiene solo un ejemplo. La URL queda dentro del JavaScript publicado, por lo que debe ser pública y HTTPS. No colocar secretos en variables de build del frontend. La aplicación Android conserva su proceso independiente de build.

En Backend, configurar las variables de ejecución como secretos por entorno; no subir valores reales a Git:

| Grupo | Variables | Criterio |
| --- | --- | --- |
| Base | `DATABASE_URL`; URL directa separada para la tarea de migración | Runtime con endpoint agrupado y TLS; migración con conexión directa a la **base de preproducción** |
| Identidad | `JWT_SECRET`, `KIOSK_API_KEY`, `ADMIN_USER`, `ADMIN_PASSWORD_HASH` | Valores aleatorios o hash propios; nunca los DEMO de Compose |
| Web | `CORS_ORIGINS` | Origen HTTPS exacto de Prime, sin ruta ni comodín; añadir Android solo cuando se pruebe |
| Recuperación | `PASSWORD_RESET_DELIVERY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | SMTP de pruebas autorizado o recuperación deshabilitada de forma explícita |
| Negocio | `APP_MODE=staging`, `PAYMENT_ENV=demo`, `DEMO_WALLET_ENABLED=true`, `SHOW_DEMO_ADMIN_CREDENTIALS=false` | `CULQI_SECRET_KEY` y `PAYMENT_WEBHOOK_SECRET` deben estar ausentes o vacíos; la validación rechaza cualquier valor configurado |
| OCR | `PLATE_RECOGNITION_URL`, `PLATE_CONFIDENCE_THRESHOLD` | No usar `plate-recognition:8000` desde Vercel; OCR y rutas de terminal quedan fuera de la primera salida |

La API configura CORS en `Backend/src/setup-app.ts` y acepta encabezados `Authorization`, `Content-Type` y `X-Kiosk-Key`. CORS solo controla navegadores: un cliente directo puede invocar la API. La clave de terminal jamás debe incluirse en el frontend. La API de Vercel debe rechazar operaciones de terminal hasta que exista acceso de operador apropiado.

## Comportamiento de staging

`APP_MODE=staging` exige `PAYMENT_ENV=demo` y `DEMO_WALLET_ENABLED=true`. Acepta recargas virtuales de socios y órdenes DEMO para deudas de prueba existentes. El adaptador Culqi rechaza staging antes de cualquier conexión externa, incluso si se invoca por error. El backend rechaza cualquier clave Culqi o secreto de webhook configurado. Las rutas de webhook comercial responden 401 al no haber secreto. Las credenciales admin DEMO no se exponen.

Todas las rutas `@KioskOnly` responden 403 en staging, con o sin clave válida. Las rutas `@MemberOrKiosk` admiten JWT válido de socio y rechazan cualquier intento de identidad de terminal. Así permanecen locales FuelFlow, OCR e impresión. Prime puede demostrar registro, perfil, saldo, recargas virtuales, beneficios y canjes. La demostración de pago DEMO de una deuda requiere un registro de deuda de prueba ya existente en la base aislada: staging no puede crear compras de terminal.

Compose conserva `local/demo` sin cambios. El futuro `production` sigue requiriendo Culqi live, SMTP real y OCR HTTPS; rechaza recargas virtuales. Ningún modo staging autoriza cobros reales.

## PostgreSQL y migraciones: pasos futuros, no ejecutar ahora

Asignar una base gestionada exclusiva a preproducción; no reutilizar el volumen local ni compartirla con producción o previews no aislados. Revisar TLS, límites de conexiones, pooler, copias de seguridad y restauración antes de conectarla. `schema.prisma` y las 18 migraciones versionadas son la fuente del esquema. La aplicación usa `DATABASE_URL`; la ejecución controlada de `prisma migrate status` y `prisma migrate deploy` deberá recibir una URL **directa** para esa tarea, una sola vez antes de exponer la API. No correr migraciones en cada función, no ejecutar `prisma migrate reset` ni el seed DEMO sobre la base gestionada.

## Comprobaciones por fase

1. **Ahora, configuración y Compose:** `docker compose -f compose.yaml config --quiet`; `npm test --prefix FrontEnd_1`; `npm test --prefix FrontEnd_2`; `npm test --prefix PrintAgent` en Windows para la prueba que requiere PowerShell; `npm run lint --prefix Backend`, `npm test --prefix Backend`, `npm run build --prefix Backend`, builds de ambos frontends. Estos comandos no deben iniciar migraciones ni imprimir físicamente.
2. **Antes de conectar PostgreSQL:** verificar nombre y entorno del destino, backup/restauración y límite de conexiones. Probar las migraciones en una base desechable aislada. Después, comprobar `prisma migrate status`, salud de API y que el seed DEMO no se ejecutó.
3. **Antes de un preview Vercel:** verificar que `APP_MODE=staging` rechace claves Culqi, webhooks comerciales e identidad de terminal mediante solicitudes directas; verificar que recarga y pago DEMO solo afectan datos de prueba, HTTPS, CORS exacto y bundle sin secretos. Después del preview, repetir registro, inicio de sesión, recuperación y lectura de datos contra la base aislada.

No ejecutar pruebas E2E contra producción, no borrar datos o volúmenes y no realizar despliegue antes de preparar una base aislada y probar el flujo completo allí.

## Base para Kubernetes/K3s posterior

Conservar los Dockerfiles actuales como punto de partida. El futuro clúster necesitará Deployments separados para Backend, ambos frontends y OCR; Services internos para Backend y OCR; Secrets para claves y credenciales; ConfigMaps para valores públicos; probes de salud; y un Job de migración que termine antes de activar una nueva versión de Backend. PostgreSQL gestionado no necesita volumen del clúster; PrintAgent y su historial permanecen en el equipo Windows. No crear manifiestos ni mover datos hasta definir el clúster, su entrada HTTPS y su gestor de secretos.
