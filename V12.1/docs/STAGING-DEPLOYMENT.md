# V12.1 — despliegue de staging (fase 5B-1)

## Fase 5C en curso — 29-10-2026

Despliegue directo desde `feature/primax-v12-1-dkos` con Vercel CLI en `dkosx13`, sin GitHub App ni auto-deploy. Sitios estables: FuelFlow https://primax-v12-1-fuelflow-staging.vercel.app (`primax-v12-1-fuelflow-staging`), Prime https://primax-v12-1-prime-staging.vercel.app (`primax-v12-1-prime-staging`) y Control https://primax-v12-1-control-staging.vercel.app (`primax-v12-1-control-staging`). Los proyectos V12 antiguos no se modificaron.

Backend Render: https://primax-v12-1-api-staging.onrender.com (health 200). OCR Render: https://primax-v12-1-ocr-staging.onrender.com. Neon `primax-v12-1-staging` y Upstash `primax-v12-1-redis-staging` siguen detrás del Backend. PrintAgent sigue local. Pendientes: secreto `KIOSK_GATEWAY_SECRET` en FuelFlow Vercel Production, CORS exacto en Render, redeploy Backend y validaciones HTTPS funcionales, financieras, cookies, OCR y cámara física. 5C aún no está completa.

Estado al 29-10-2026: **staging backend activo**. Neon V12.1 dedicado en `aws-us-east-1`, base `primax_v12_1_staging`, 26 migraciones aplicadas y seed académico. Upstash Redis V12.1 TLS en `us-east-1`, comandos REST verificados. Backend y OCR son Web Services Render Free en Virginia. Health Backend, sesión Kiosk/Redis, OCR autenticado y rechazo 401 remoto validados. Frontends y PrintAgent cloud no desplegados. Neon V12 antigua intacta.

## Destino de esta fase

| Componente | Nombre previsto | Región | Acceso | Estado |
|---|---|---|---|---|
| PostgreSQL Neon | `primax-v12-1-staging` | AWS us-east-1 | TLS, pooled runtime y direct migración | Activo y validado |
| Upstash Redis | `primax-v12-1-redis-staging` | AWS us-east-1 | REST HTTPS Bearer según `KioskStore` actual | Activo y validado |
| Backend Render | `primax-v12-1-api-staging` | Virginia | Web Service público HTTPS; root `V12.1/Backend`, Dockerfile, `/api/v1/health` | Activo y validado |
| OCR Render | `primax-v12-1-ocr-staging` | Virginia, mismo workspace | Web Service Free HTTPS, `POST /recognize` autenticado, `/health` mínimo | Activo y validado |

FuelFlow+BFF, Prime y Control quedan para la fase Vercel posterior. PrintAgent queda en la estación local. Mailpit fue eliminado. Correo real sigue pendiente y `PASSWORD_RESET_DELIVERY=disabled` deja los flujos centrales disponibles.

## Orden de ejecución una vez disponibles las sesiones

1. Inventariar proyectos/DB de Neon, DB de Upstash y servicios Render, distinguiendo explícitamente V12 de V12.1. Registrar IDs, nombres y región sin copiar conexiones ni tokens al repositorio.
2. Crear Neon dedicado en us-east-1. Obtener `DATABASE_URL` pooled y `DATABASE_URL_UNPOOLED` direct de la **misma** rama, base y usuario, ambas con `sslmode=require`. Registrar host/base sin contraseña. Comprobar que la base está vacía y consultar `_prisma_migrations` antes de migrar. No usar la antigua V12.
3. Crear Upstash dedicado en us-east-1. El perfil académico usa REST HTTPS, no Redis TCP: `KIOSK_REDIS_REST_URL` debe ser el origin sin ruta, y `KIOSK_REDIS_REST_TOKEN` se guarda como secreto. Probar `PING`, `SET` con TTL, `GET`, `EVAL` y `DEL` sobre **una sola key** `primax:v12:staging-probe:<nonce>`; no usar `FLUSH`.
4. Desde `V12.1/Backend`, con las dos URL Neon en variables privadas del proceso y destino verificado, ejecutar `npx prisma migrate status`, luego `npx prisma migrate deploy`, luego `npx prisma migrate status`. No usar el script `npm run prisma:migrate`: está protegido para DB local. Son 26 migraciones versionadas; no generar otras ni usar `db push`/reset.
5. En una DB de aplicación recién migrada y vacía, ejecutar **una vez** `node scripts/seed-academic-staging.cjs` con `STAGING_SEED_CONFIRM=primax-v12-1-staging`, `APP_MODE=academic`, `PAYMENT_ENV=demo`, `DATABASE_PURPOSE=academic-demo`, `KIOSK_STATION_ID` UUID y tres identidades/contraseñas nuevas en `STAGING_ADMIN_*`, `STAGING_SUPERVISOR_*`, `STAGING_PRIME_*`. El script valida Neon pooled/direct y 26 migraciones; crea estación, 3 combustibles e inventarios, surtidor 03, terminal y asignación, SUPER_ADMIN, Supervisor asignado y cliente Prime con vehículo. Falla si ya hay usuarios, estación o combustible; no reabastece ni reescribe credenciales. Los seeds existentes `prisma/seed.ts` y `seed-local-*` son solo locales.
6. Crear OCR como **Web Service Free** en Render, branch `feature/primax-v12-1-dkos`, root `V12.1/PlateRecognition`, Dockerfile existente, puerto 8000 y health `/health`. Configurar `OCR_SERVICE_SECRET` generado sólo en OCR y Backend. Mantener ambos servicios en Virginia y el mismo workspace. La URL HTTPS es pública, pero `POST /recognize` debe rechazar llamadas sin credencial; ningún browser recibe el secreto. Private Service sigue siendo preferido para producción.
7. Crear Backend como **Web Service** en Render, misma branch, root `V12.1/Backend`, Dockerfile existente, health `/api/v1/health`. El proceso ya lee `PORT` y escucha `0.0.0.0`. Configurar variables antes de habilitar tráfico. `PLATE_RECOGNITION_URL` debe ser el origin HTTPS del Web Service OCR, sin ruta. Nunca colocar la URL OCR en el navegador.
8. Validar Backend `/api/v1/health` (consulta Prisma), login/operación académica, Redis y OCR desde Backend por HTTPS autenticado con imagen controlada. Probar también `PLATE_RECOGNITION_ENABLED=false`/fallo OCR y entrada manual en FuelFlow cuando se despliegue el frontend. El health público no prueba Redis ni OCR por sí solo.

La imagen runtime del Backend sirve NestJS y health. La migración y el seed se ejecutan como pasos operativos separados desde checkout local con dependencias de desarrollo; no se ejecutan al iniciar Render.
Confirmar plan Free sin cargos antes de crear cada Web Service; OCR puede dormir en Free. El Backend espera hasta 12 s y FuelFlow conserva entrada manual ante timeout/error.

## Variables de Backend

| Tipo | Variables | Nota |
|---|---|---|
| SECRET | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `KIOSK_REDIS_REST_TOKEN`, `JWT_SECRET`, `KIOSK_API_KEY`, `KIOSK_GATEWAY_SECRET`, `KIOSK_OPERATOR_PASSWORD_HASH`, `OCR_SERVICE_SECRET` | Generar nuevas para staging; las URL incluyen credenciales. Hash bcrypt 12–15 para operador. Solo en gestor de secretos/Render. |
| CONFIG | `NODE_ENV=production`, `APP_MODE=academic`, `DATABASE_PURPOSE=academic-demo`, `PAYMENT_ENV=demo`, `DEMO_WALLET_ENABLED=true`, `PORT`, `KIOSK_REDIS_REST_URL`, `KIOSK_SESSION_NAMESPACE`, `KIOSK_SESSION_VERSION`, `KIOSK_STATION_ID`, `KIOSK_OPERATOR_USER` | Namespace exclusivo de V12.1. `PORT` asignado por Render o 3000. |
| CONFIG | `CORS_ORIGINS`, `PLATE_RECOGNITION_ENABLED=true`, `PLATE_RECOGNITION_URL`, `PLATE_CONFIDENCE_THRESHOLD`, `PASSWORD_RESET_DELIVERY=disabled`, `SHOW_DEMO_ADMIN_CREDENTIALS=false`, `SWAGGER_ENABLED=false` | CORS requiere origins HTTPS exactos; hasta Vercel, usar solo un origin HTTPS controlado, nunca `*`. OCR HTTPS autenticado de Render. |
| SEED, solo proceso temporal | `STAGING_SEED_CONFIRM`, `STAGING_ADMIN_EMAIL/PASSWORD`, `STAGING_SUPERVISOR_EMAIL/PASSWORD`, `STAGING_PRIME_EMAIL/PASSWORD` | No persistir contraseñas de seed en variables de runtime Render ni en Git. |

No configurar SMTP, Culqi real ni claves locales DEMO. `KIOSK_GATEWAY_SECRET` se compartirá solo con el BFF cuando se despliegue. Revisar la matriz ampliada en `STAGING-ARCHITECTURE.md` antes del frontend. URLs/secretos finales todavía no existen; no se han generado ni publicado.

## DBeaver para la demostración

Crear conexión **PostgreSQL**. En la consola Neon, seleccionar el proyecto/base V12.1 y obtener de la cadena **directa** Host, Port (normalmente 5432), Database y User; introducir la contraseña en DBeaver, no en este repositorio. En propiedades SSL usar SSL activado y `sslmode=require` (o el modo más estricto que Neon y el cliente permitan). Verificar identidad del proyecto y consultar en modo lectura `_prisma_migrations`, `Station`, `Pump`, `Terminal`, `Fuel`, `FuelInventory` y usuarios/grants; limitar acceso a quien participa en la demostración. No exportar dumps con datos personales al repositorio.

## Controles de aceptación

- [x] Inventario remoto V12/V12.1 y recursos dedicados creados.
- [x] Neon: TLS, 26 migraciones aplicadas y seed académico verificado por Prisma; DBeaver pendiente de prueba humana.
- [x] Upstash: REST HTTPS, PING/SET/GET/EVAL/DEL verificados y key temporal eliminada.
- [x] Render: Backend HTTPS y health 200 con Prisma; URL pública registrada.
- [x] OCR: Web Service Free HTTPS: health mínimo, rechazo 401 sin credencial y reconocimiento desde Backend autenticado.
- [x] Backend ↔ Neon/Redis/OCR comprobados sin registrar secretos.
- [x] Correo deshabilitado; CORS exacto al origin Backend mientras no hay frontend; Frontends aún sin desplegar.

El commit de código se publicó únicamente en `feature/primax-v12-1-dkos` para los builds de Render. No hubo push ni merge a `main`.
