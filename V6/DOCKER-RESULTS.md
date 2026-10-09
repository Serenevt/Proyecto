# Cierre Docker V6 — 2026-10-09

## Resultado

Se ejecutaron realmente `docker compose config --quiet`, `docker compose build`,
`docker compose up -d`, `docker compose up -d --build`, `docker compose ps -a`
y los arranques individuales `frontend1` y `frontend2`.
Docker Desktop 4.94.0, motor Linux 29.8.2, Compose v5.5.1 sobre Windows.
El sandbox denegaba el acceso inicial; la ejecución autorizada fuera del sandbox
permitió usar el motor sin modificar sus permisos.

Los cuatro servicios finales están activos y saludables:

| Servicio | Puerto | Comprobación |
| --- | --- | --- |
| frontend1 | 127.0.0.1:8081 → 80 | HTTP 200 tras redirección a /src/index.html; /healthz |
| frontend2 | 8082 → 80 | HTTP 200; /healthz; imagen integrada actual |
| backend | 127.0.0.1:3000 → 3000 | /api/v1/health: status ok, database up; Swagger HTTP 200 |
| postgres | 127.0.0.1:5433 → 5432 | pg_isready; conexión Prisma desde backend y host |

`migrate` y `seed` finalizaron con código 0. Ambos Nginx aprobaron `nginx -t`.
La auditoría compara el manifiesto Linux efectivo, evitando confundir cambios
de metadatos BuildKit con una imagen de aplicación desactualizada.

## E2E real con Docker

Navegadores → Nginx Docker → NestJS Docker → Prisma → PostgreSQL Docker.
Sin mocks ni Swagger como intermediario.

- Diego, PRIME-0001, ABC-123; Primax Sur, Premium.
- S/100.00, PREPAGO, TARJETA, BOLETA, 4.255 galones.
- Transaction `12add544-4981-440d-a9a2-c4a87a2996ea`.
- operationId `3958f7ff-2e1f-4969-8a22-abb954c09d24`.
- HTTP 201; Transaction PAID; Payment CAPTURED; pointsEarned 100.
- Exactamente un pago y un RewardMovement EARN +100 para esa operación.
- Prime pasó de **600 a 700 puntos** y mostró el consumo sin recargar manualmente.
- La prueba recargó FuelFlow, recuperó la operación y repitió el POST real por
  HTTP con el mismo UUID: una sola Transaction, un pago y un movimiento.
- La prueba de seguridad verificó ausencia de la clave en recursos públicos,
  rechazo de rutas kiosk no autorizadas y eliminación de x-kiosk-key en Prime.

La evidencia local está en `tools/test-results/integration.json` (ignorada por Git).
Las 4 compras previas siguen presentes, incluida
`be948a54-0878-4a5f-a262-e6a6311afdda`, documentada en la integración anterior.
Las ejecuciones de cierre añadieron y conservaron 3 compras demo de S/100:
el saldo pasó de 400 al inicio a 700 al final. Son operaciones de pruebas
distintas, no duplicados de un mismo operationId. Hay 7 compras, 7 pagos y 7
movimientos en el esquema público. No se borraron datos ni volúmenes.

## Pruebas y builds

| Comprobación | Resultado final |
| --- | --- |
| Backend unitarias | 30 aprobadas |
| Backend E2E con PostgreSQL real, esquema separado | 25 aprobadas |
| FrontEnd_1 | 4 aprobadas |
| FrontEnd_2 | 11 aprobadas |
| Móviles Playwright, tres resoluciones | 15 aprobadas |
| Integración Docker y seguridad | 2 aprobadas |
| Total suite existente | **87 aprobadas** |
| Build Backend, FrontEnd_1, FrontEnd_2 | Los tres aprobados localmente y en Docker |
| Lint Backend | Aprobado |
| Auditoría Docker adicional | Aprobada |
| Prime aislado, prueba adicional de navegador | Aprobada |

El E2E backend se ejecutó con `KEEP_E2E_SCHEMA=1`; los esquemas de pruebas
se conservaron. El mensaje de error Prisma de la prueba de rollback es
intencional y esa prueba pasó. No se ejecutó un reset.

`node tools/check-standalone.cjs` levantó la imagen real de Prime en una red
temporal sin backend: cargó la interfaz, mostró el error de servicio al intentar
login y mantuvo el formulario usable. La prueba retiró solo su propio contenedor
y red; no utilizó volúmenes. No es un modo de autenticación simulada.

## Ajustes y problemas corregidos

- FuelFlow ahora usa build Node y runtime Nginx, copiando exclusivamente `dist`.
- Se mantiene el proxy kiosk con lista de rutas/métodos y clave del lado servidor.
  Se añadió fallback de navegación y bloqueo de archivos ocultos.
- Prime conserva Dockerfile, UI, API, JWT, actualización automática y Capacitor;
  se reconstruyó su versión integrada y se bloquearon archivos ocultos en Nginx.
- Se separaron las redes `app` y `data`. La primera configuración de `data` como
  `internal` impedía publicar 5433; se corrigió a un bridge separado y se recrearon
  los contenedores afectados conservando el volumen. Los E2E afectados se repitieron.
- La clave preferida del `.env.example` es `KIOSK_SECRET`; el alias previo
  `KIOSK_API_KEY` se conserva para no cambiar las credenciales existentes.
- Se retiró la contraseña demo fija del login, Swagger y documentación. Los
  tests unitarios/móviles usan una contraseña ficticia distinta. El E2E real
  obtiene la contraseña del entorno. El seed rechaza marcadores REPLACE_.
- Se ampliaron ignores y documentación; no se modificaron archivos Android.

## Seguridad y persistencia

`node tools/audit-docker.cjs` comprobó las imágenes activas, builds públicos
locales, historial de imágenes, logs y archivos V6 versionables. Ninguno contiene
los valores locales configurados de JWT_SECRET, clave kiosk, contraseña PostgreSQL
o contraseña demo. No imprime esos valores. Esta revisión es del árbol de trabajo
actual, no una reescritura del historial Git.

La clave kiosk solo se sustituye al arrancar Nginx en `/etc/nginx/conf.d`, fuera
de `/usr/share/nginx/html`. No se introduce mediante ARG ni se copia al build.
Prime elimina cualquier x-kiosk-key recibido. Los frontends no pertenecen a la
red PostgreSQL. El acceso host a la base queda limitado a loopback para administración.

Se conserva `primax-v6_postgres_data` montado en `/var/lib/postgresql/data`.
No se modificaron los `.env` reales. No hubo git add, commit, push ni merge.

## Alcance y reproducción

Los mismos Dockerfiles y `compose.yaml` usan rutas relativas, imágenes Linux,
DNS de servicios y redes bridge. La guía Windows/Debian 13 está en README.md.
**No se ejecutó sobre un host Debian 13**: queda pendiente esa comprobación de
plataforma. Tampoco se recompiló ni ejecutó un APK; se conservaron sus archivos
y configuración y se aprobaron las pruebas móviles web.

Desde V6, con el `.env` local preparado:

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps -a
docker compose exec frontend1 nginx -t
docker compose exec frontend2 nginx -t
node tools/run-integration.cjs --docker
node tools/audit-docker.cjs
node tools/check-standalone.cjs
```

Los tres comandos Node requieren Node 22/24, dependencias de Backend y
FrontEnd_2, Chrome y `Backend/.env` local. El arranque normal Docker no requiere
Node instalado en el host. Cada repetición del E2E de compra suma 100 puntos
y conserva la nueva operación.

Archivos de este cierre: `.env.example`, `.gitignore`, `compose.yaml`, `README.md`,
`DOCKER-RESULTS.md`, `Backend/.dockerignore`, `Backend/.env.example`,
`Backend/README.md`, `Backend/prisma/seed.ts`, `Backend/scripts/init-env.cjs`,
`Backend/src/auth/auth.service.spec.ts`, `Backend/src/auth/login.dto.ts`,
`FrontEnd_1/.dockerignore`, `FrontEnd_1/Dockerfile`, `FrontEnd_1/nginx/default.conf`,
`FrontEnd_2/README.md`, `FrontEnd_2/js/login.js`, `FrontEnd_2/nginx/default.conf`,
`FrontEnd_2/tests/auth.test.js`, `FrontEnd_2/tests/login.spec.cjs`,
`FrontEnd_2/tests/mobile.spec.cjs`, `FrontEnd_2/tests/api-fixture.cjs`,
`tools/integration.spec.cjs`, `tools/audit-docker.cjs`, `tools/check-standalone.cjs`.
El estado Git incluye además los cambios de integración que ya existían al iniciar.
