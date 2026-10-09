# Resultado de la integración V6

## Resultado funcional ejecutado

E2E real de navegador con proxies Node de desarrollo hacia NestJS y PostgreSQL
existentes. No se usaron mocks en esta prueba. Los tests móviles de regresión
sí usan respuestas API controladas, separadas del E2E real.

- Diego / PRIME-0001 / ABC-123.
- Primax Sur / Premium / S/100.00 / PREPAGO / TARJETA / BOLETA / 4.255 gal.
- Transaction: be948a54-0878-4a5f-a262-e6a6311afdda.
- operationId: 4c09d445-f557-41c0-91e8-93b3e705d9a5.
- HTTP 201, PAID, pointsEarned=100.
- Prisma confirmó una Transaction, un Payment CAPTURED y un RewardMovement +100.
- Prime mostró ese consumo y actualizó puntos de 300 a 400 sin recargar la página.
- Refrescar FuelFlow y pulsar nuevamente recuperó la operación, sin segunda compra.
- Los registros se conservaron. No se borraron datos ni volúmenes.
- Escaneo de 49 archivos públicos/build: ninguna coincidencia de KIOSK_API_KEY
  ni JWT_SECRET.
- Proxy Prime rechazó una credencial kiosk aportada por el cliente; FuelFlow
  rechazó acceso a rutas fuera de su lista y solicitudes de otro origen.

## Verificaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| Backend unitarios | 30 aprobados |
| Backend E2E PostgreSQL | 25 aprobados |
| FrontEnd_1 servicios | 4 aprobados |
| FrontEnd_2 servicios/auth | 11 aprobados |
| FrontEnd_2 Playwright móvil, 3 tamaños | 15 aprobados |
| Integración real navegador + seguridad de proxies locales | 2 aprobados |
| Total de casos distintos | 87 aprobados |
| Build Backend | aprobado |
| Build FrontEnd_1 | aprobado |
| Build FrontEnd_2 | aprobado |
| Backend lint | aprobado |
| docker compose config --quiet | aprobado |
| docker compose up -d --build | bloqueado: acceso denegado al motor |
| docker compose ps / perfil Docker tests | mismo bloqueo |
| Backend health final | HTTP 200, status ok, database up |
| FrontEnd_2 Docker existente :8082 | HTTP 200, imagen anterior |
| FrontEnd_1 Docker :8081 | no accesible |
| Proxy local FrontEnd_1 :5181 | HTTP 200 |
| FrontEnd_2 :5180 durante pruebas | HTTP 200; UI integrada verificada |
| git diff --check | sin errores |

Se ejecutó el E2E backend con KEEP_E2E_SCHEMA=1 y se comprobó que permanece
e2e_f95851ffd4c1431284c001d6e5932849. El error de constraint mostrado por esa
suite corresponde a su prueba intencional de rollback, que pasó.

## Límites reales

No se pudo construir/arrancar las nuevas imágenes ni ejecutar nginx -t dentro
de Docker por permisos de acceso al motor. El éxito del E2E local no certifica
Nginx en ejecución. Repetir `node tools/run-integration.cjs --docker` después de
levantar el stack con permisos normales. No se probó en un host Debian 13 ni se
compiló/probó el APK Android durante este trabajo.

La arquitectura sigue registrando pagos DEMO, sin pasarela bancaria, ANPR ni
surtidor físicos. Monedero/recargas, alias local, notificaciones y soporte que no
tienen endpoints conservan su comportamiento local explícitamente identificado.

El JWT de Prime persiste en almacenamiento del navegador hasta logout/expiración;
la clave kiosk nunca se entrega al navegador. El puerto kiosk se limita al host,
porque su proxy actúa con los permisos de una terminal de confianza.

## Archivos

- `.gitattributes`
- `.gitignore`
- `Backend/README.md`
- `Backend/test/api.e2e-spec.ts`
- `FrontEnd_1/Dockerfile`
- `FrontEnd_1/nginx/15-kiosk-key.sh`
- `FrontEnd_1/nginx/default.conf`
- `FrontEnd_1/package.json`
- `FrontEnd_1/src/index.html`
- `FrontEnd_1/src/js/apiClient.js`
- `FrontEnd_1/src/js/script.js`
- `FrontEnd_1/src/js/transactionsService.js`
- `FrontEnd_1/tests/transactions.test.js`
- `FrontEnd_1/tools/build.cjs`
- `FrontEnd_2/README.md`
- `FrontEnd_2/index.html`
- `FrontEnd_2/js/app.js`
- `FrontEnd_2/js/config.js`
- `FrontEnd_2/js/login.js`
- `FrontEnd_2/js/services/apiClient.js`
- `FrontEnd_2/js/services/authService.js`
- `FrontEnd_2/js/services/benefitsService.js`
- `FrontEnd_2/js/services/index.js`
- `FrontEnd_2/js/services/membershipService.js`
- `FrontEnd_2/js/services/rewardsService.js`
- `FrontEnd_2/js/services/session.js`
- `FrontEnd_2/js/services/store.js`
- `FrontEnd_2/js/services/transactionsService.js`
- `FrontEnd_2/js/views.js`
- `FrontEnd_2/nginx/default.conf`
- `FrontEnd_2/playwright.config.cjs`
- `FrontEnd_2/tests/api-fixture.cjs`
- `FrontEnd_2/tests/auth.test.js`
- `FrontEnd_2/tests/login.spec.cjs`
- `FrontEnd_2/tests/mobile.spec.cjs`
- `FrontEnd_2/tests/services.test.js`
- `FrontEnd_2/tools/build.cjs`
- `FrontEnd_2/tools/serve.cjs`
- `INTEGRATION-RESULTS.md`
- `README.md`
- `compose.yaml`
- `tools/integration.spec.cjs`
- `tools/playwright.integration.cjs`
- `tools/run-integration.cjs`
- `tools/serve.cjs`
