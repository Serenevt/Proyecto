# Validación V10 — Admin, alertas y correo — 22/10/2026

Trabajo únicamente sobre la V10 actual. Sin V11, commit, push, merge ni despliegue a Internet. No se eliminaron pruebas, volúmenes ni registros financieros. La base de comparación es `VALIDATION-V10-IDENTITY.md`: 448 pruebas.

## Cambios

- FuelFlow muestra placa y nombre de User obtenido mediante Membership; el comprobante de una placa sin Membership muestra `No afiliado`. Se conserva el código para validación/auditoría.
- Se retiraron las ayudas falsas de cuentas Demo y las credenciales Prime de los builds. Admin usa autenticación Backend y credenciales locales separadas, visibles solo con modo local y switch explícito.
- Dashboard con transacciones, totales y alertas PostgreSQL. Se eliminaron sus transacciones, métricas y alertas inventadas.
- `BusinessAlert` persiste mismatch postpago y deuda real; claves únicas por evento, estado OPEN/RESOLVED, fecha y responsable. La revisión no modifica deuda. El listado también incorpora deuda anterior a esta migración.
- Recuperación con Nodemailer, SMTP configurable y Mailpit local automático. Se conserva HMAC del código, hash del token, límite de intentos, expiración, un solo uso y revocación de sesiones.
- Documentación de BD, ERD real y draw.io editable, SMTP y Admin. ERD: 16 entidades y 27 FK, generado desde Prisma DMMF; sintaxis Mermaid y XML draw.io validados.

## Recuento de pruebas

| Suite | Anteriores | Nuevas | Total |
|---|---:|---:|---:|
| Backend unitarias | 118 | 8 | 126 |
| Backend E2E PostgreSQL | 181 | 12 | 193 |
| FuelFlow | 49 | 5 | 54 |
| Prime | 25 | 1 | 26 |
| Navegador móvil, tres tamaños | 45 | 0 | 45 |
| OCR en contenedor | 7 | 0 | 7 |
| Integración navegador/Docker | 23 | 2 | 25 |
| **Total** | **448** | **28** | **476** |

Resultado final: **476/476 aprobadas, 0 fallidas, 0 omitidas y 0 bloqueadas**. Las 448 anteriores siguen pasando y las 28 nuevas pasan. La integración final terminó con 3/3 más 22/22. No se suman reejecuciones, builds, auditorías ni comprobaciones operativas al recuento.

Estado: **V10 LISTA PARA MERGE**, sin ejecutar commit, push ni merge.

Las pruebas nuevas cubren nombre desde Membership/User, No afiliado, ausencia de alertas estáticas, estado vacío, mismatch de identificación/autorización/cierre, deuda creada por consumo real, FIFO y saldo actualizado, no duplicación concurrente, resolución idempotente, historial, denegación a usuarios/terminales no administradores, credenciales demo deshabilitadas fuera del modo local, configuración SMTP/TLS, envío SMTP real a Mailpit, cambio de contraseña desde navegador y exclusión de secretos del build incluso si existen en su entorno. Las suites anteriores conservan expiración, intentos agotados, códigos/tokens inválidos o reutilizados, concurrencia, login anterior rechazado y login nuevo aceptado.

Se actualizaron dos pruebas anteriores sin eliminar casos: la aserción del antiguo panel simulado ahora exige autenticación Backend y ausencia de secretos estáticos; la recuperación de navegador lee Mailpit en lugar del buzón cifrado legado, conservando sus comprobaciones de identidad, revocación de sesión y contraseñas. Una prueba nueva aisló explícitamente las variables de ConfigService para no heredar las de Compose; otra corrigió la expectativa de navegación después de cerrar Admin (la aplicación vuelve al inicio).

## PostgreSQL y migraciones

Migración `20261022000000_business_alerts`: enums, tabla, FK e índices de alertas. La comparación adicional detectó diferencias heredadas respecto a Prisma: ON UPDATE de once FK, default de `FuelAuthorization.updatedAt` y nulabilidad de `WalletMovement.membershipId`. `20261022010000_align_prisma_constraints` las alinea en una transacción, sin eliminar filas ni modificar importes. No se reescribieron migraciones existentes.

Después de aplicar ambas: `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` devolvió **No difference detected**. Backend unit/E2E/lint/build se repitieron después de esa alineación.

Esquemas E2E finales conservados:

- `e2e_7887176602104e9fb3258aa77a5ca06b`
- `e2e_v9_6efcaeeb03d042cfbc8653943a278857`
- `e2e_register_72b6915a658f418faa8e07e37114df45`
- `e2e_admin_mail_83e98fba93e447679630bda35b20ee20`
- `e2e_recovery_1888f74852744b6a93a9d9e4fb23e0b2`
- `e2e_guest_2d48a08952654d648c409cfe73ef8ebb`

Los errores SQL deliberados de las suites de rollback no son fallos de pruebas. Las tablas de pruebas están aisladas del esquema público. Las pruebas de navegador crean cuentas/operaciones sintéticas en la base local, como las suites anteriores; no borran evidencia.

## Docker, BD, LAN y APK

- `docker compose up -d` y su variante `--wait` ejecutadas; migrate y seed terminan con código cero. PostgreSQL, Backend, ambos frontends, OCR y Mailpit saludables.
- HTTP 200 en ambos frontends, salud Backend y Swagger. Auditoría de imágenes actuales, separación de redes, builds, logs y secretos aprobada.
- PostgreSQL sin puerto publicado al terminar. `compose.database-local.yaml` se probó con `127.0.0.1:10543`; las consultas SELECT de DATABASE-ACCESS.md pasaron en transacción READ ONLY. Se restauró el Compose normal. No se afirma haber abierto la GUI de DBeaver.
- LAN verificada desde el PC por `192.168.1.9` para ambas webs y Backend; bindings localhost restaurados. PostgreSQL/OCR internos, Mailpit en loopback. Sin afirmación de prueba desde un segundo dispositivo.
- APK debug recompilado con JDK 21, API `http://192.168.1.9:10000/api/v1`: BUILD SUCCESSFUL, 93 tareas. Auditoría del ZIP sin secretos del servidor ni variables SMTP. SHA-256: `23a544b2c303db8cf70db880afa5b72d1217e8077106627baca310d75e3017fc`. No se afirma instalación física ni firma release.
- Backend lint y build aprobados. Frontends build, tests y comprobación de sintaxis de sus módulos JS aprobados; no tienen script lint propio.

## Correo y límites reales

SMTP local probado contra Mailpit tanto en E2E como desde Prime/navegador. La API no devuelve el código. La nueva contraseña funciona y la anterior deja de funcionar. Los mensajes permanecen en el buzón local de desarrollo; no se afirma entrega a Gmail/Outlook.

**Envío externo pendiente de credenciales SMTP.** No había `.env` V10 ni variables SMTP externas disponibles. La implementación está configurada para exigir TLS en SMTP externo y está documentada en [SMTP-RECOVERY.md](SMTP-RECOVERY.md). El único paso manual de correo pendiente es proporcionar credenciales/remitente autorizado y comprobar recepción externa. No bloquea el gate acordado.

## Reproducción

```sh
docker compose up -d --build
docker compose --profile test build tests
docker compose --profile test run --rm tests
npm test --prefix FrontEnd_1
npm test --prefix FrontEnd_2
npm run build --prefix FrontEnd_2
npm run test:mobile --prefix FrontEnd_2
docker compose exec -T plate-recognition python -m unittest -v
node tools/run-integration.cjs --docker
```

La segunda suite de integración requiere `V6_DOCKER_TEST=1` en el entorno (PowerShell: `$env:V6_DOCKER_TEST='1'`): `node FrontEnd_2/node_modules/@playwright/test/cli.js test --config tools/playwright.v9.cjs`. `node tools/check-database-access.cjs` prueba el override gráfico y restaura el puerto cerrado; `node tools/check-lan.cjs` restaura bindings locales. `python tools/check-android.py` inspecciona el APK. Estas utilidades no despliegan a Internet.

## Archivos modificados o nuevos

`git status`, `git diff --stat` y `git diff --check` ejecutados al cierre. Diff sin errores de espacios; las advertencias LF/CRLF corresponden a la configuración de Git en Windows. V8 conserva los 226 hashes del inventario inicial y sigue como carpeta no versionada preexistente. V9 sin diferencias en Git. Solo V10 fue modificada. Los archivos nuevos siguen sin añadir al índice; `git diff --stat` por sí solo no los incluye.

Inventario de 51 archivos, todos bajo V10 (sin añadir al índice):

- V10/.env.example
- V10/Backend/.env.example
- V10/Backend/package-lock.json
- V10/Backend/package.json
- V10/Backend/prisma/schema.prisma
- V10/Backend/src/app.module.ts
- V10/Backend/src/auth/access.guard.ts
- V10/Backend/src/auth/auth.module.ts
- V10/Backend/src/auth/password-reset.service.ts
- V10/Backend/src/auth/recovery-delivery.ts
- V10/Backend/src/config/environment.ts
- V10/Backend/src/transactions/authorizations.controller.ts
- V10/Backend/src/transactions/transactions.controller.ts
- V10/FrontEnd_1/nginx/default.conf
- V10/FrontEnd_1/src/index.html
- V10/FrontEnd_1/src/js/apiClient.js
- V10/FrontEnd_1/src/js/script.js
- V10/FrontEnd_1/tests/terminology.test.js
- V10/FrontEnd_2/README.md
- V10/FrontEnd_2/js/config.js
- V10/FrontEnd_2/js/login.js
- V10/FrontEnd_2/js/recovery.js
- V10/FrontEnd_2/tools/build.cjs
- V10/README.md
- V10/compose.yaml
- V10/docs/IDENTITY-RECOVERY.md
- V10/tools/audit-docker.cjs
- V10/tools/check-android.py
- V10/tools/v10-auth.spec.cjs
- V10/Backend/prisma/migrations/20261022000000_business_alerts/migration.sql
- V10/Backend/prisma/migrations/20261022010000_align_prisma_constraints/migration.sql
- V10/Backend/src/alerts/alerts.module.ts
- V10/Backend/src/alerts/alerts.service.ts
- V10/Backend/src/auth/admin.controller.ts
- V10/Backend/src/auth/smtp-delivery.spec.ts
- V10/Backend/test/admin-mail.e2e-spec.ts
- V10/FrontEnd_1/src/js/adminService.js
- V10/FrontEnd_1/src/js/customerIdentity.js
- V10/FrontEnd_1/tests/admin-identity.test.js
- V10/FrontEnd_2/tests/secrets.test.js
- V10/compose.database-local.yaml
- V10/docs/ADMIN-ALERTS.md
- V10/docs/DATABASE-ACCESS.md
- V10/docs/DATABASE-ERD.md
- V10/docs/SMTP-RECOVERY.md
- V10/docs/VALIDATION-V10-ADMIN-MAIL.md
- V10/docs/database-erd.drawio
- V10/tools/check-database-access.cjs
- V10/tools/generate-erd.cjs
- V10/tools/v10-admin.spec.cjs
- V10/tools/validate-erd.mjs
