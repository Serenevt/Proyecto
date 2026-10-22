# Validación V10: prepago, identidad y recuperación — 21/10/2026

Estado: **V10 LISTA PARA MERGE**. Actualizado tras la corrección autorizada de datos sintéticos y la regresión final. Continuación del árbol existente; no se copió V9, no se creó V11, no se hizo commit/push/merge. Se conservaron todas las pruebas.

## Implementación

Prepago con placa válida no registrada, sin alta automática ni puntos; snapshots de placa y relaciones opcionales. DNI/RUC/pasaporte únicos por índices PostgreSQL, respuestas 409 y registro transaccional. Login unificado correo/DNI compatible con el payload anterior. Registro de extranjero por pasaporte sin DNI. Recuperación temporal, un solo uso, intentos limitados, bcrypt y revocación de sesiones; buzón privado DEMO identificado expresamente, sin proveedor real de email/SMS. Ver [operación y limitaciones](IDENTITY-RECOVERY.md).

Esta continuación corrigió textos dañados y selectores ambiguos en pruebas nuevas, adaptó la prueba de combustible inexistente al rechazo en autorización (comprobando ausencia de pagos), mantuvo abierto el servidor E2E para evitar ECONNRESET en concurrencia y añadió el import de Buffer del lector DEMO. La implementación principal ya estaba parcialmente presente al iniciar.

## Recuento sin duplicar reejecuciones

La base anterior documentada era de 373 pruebas. Esta tanda agrega 75 casos. Se ejecutaron también las 23 pruebas de integración antes bloqueadas y se repitieron todas las suites de la tabla después de corregir los datos.

| Suite | Anteriores | Nuevas | Aprobadas finales | Fallidas finales | Sin ejecutar por bloqueo |
|---|---:|---:|---:|---:|---:|
| Backend unitarias | 116 | 2 | 118 | 0 | 0 |
| Backend E2E PostgreSQL aislado | 122 | 59 | 181 | 0 | 0 |
| FrontEnd_1 | 49 | 0 | 49 | 0 | 0 |
| FrontEnd_2 | 25 | 0 | 25 | 0 | 0 |
| Navegador móvil, tres tamaños | 36 | 9 | 45 | 0 | 0 |
| OCR en contenedor | 7 | 0 | 7 | 0 | 0 |
| Integración navegador/Docker | 18 | 5 | 23 | 0 | 0 |
| **Total** | **373** | **75** | **448** | **0** | **0** |

Total: **448/448 aprobadas**, **0 fallidas**, **0 omitidas**, **0 bloqueadas**. No se suman reejecuciones, verificaciones de datos, builds ni comprobaciones operativas como pruebas adicionales.

Cobertura nueva ejecutada: placa registrada/desconocida, ausencia de altas implícitas y puntos, normalización, placa inválida, PENDING/REJECTED, idempotencia y registro durante despacho; DNI/RUC duplicados, múltiples NULL, edición propia/ajena y registros/ediciones concurrentes; login correo y DNI; recuperación correcta, códigos/tokens incorrectos, vencidos, reutilizados, carreras, cinco intentos, cooldown, limitación IP, nueva contraseña bcrypt, invalidación JWT; pasaporte válido/duplicado/concurrente/normalizado, extranjero sin DNI y exclusión de ambos documentos. Login por pasaporte opcional no implementado; extranjero inicia con correo.

Esquemas de la última ejecución E2E preservados: `e2e_ce087eff55554ae49b5197a2a84eabe2`, `e2e_v9_9795f4972037487e973f18693d45225b`, `e2e_register_ca760f33185744d4aa376dcb863a6eb8`, `e2e_recovery_b2b7d535ca964437809cbf82b6afac96`, `e2e_guest_20e0d643be4b4684b97627524bb12534`.

## Docker y validaciones adicionales

- `docker compose up -d --build`: aprobado; migraciones y seed completados. `prisma migrate status`: 12 migraciones, esquema al día.
- `docker compose up -d`: aprobado. No se borraron volúmenes ni datos históricos.
- `docker compose ps`: Backend, FrontEnd_1, FrontEnd_2, PostgreSQL y OCR healthy.
- Backend: comando completo del servicio tests aprobado: 118 unitarias, 181 E2E con PostgreSQL aislado, lint y build.
- Ambos frontends: tests y build aprobados. Mobile: 45/45. OCR: 7/7.
- FrontEnd_2 standalone sin API: aprobado; muestra error de conexión manteniendo la interfaz utilizable.
- Android: `android:debug`, JDK 21, BUILD SUCCESSFUL, 93 tareas. APK con API `http://192.168.1.9:10000/api/v1`; revisión de secretos/configuración aprobada. SHA-256 `89edcf608e2cc72bb37f096582292810b9a0f0d1c4235c138b86214e2cc6e01f`.
- LAN: comprobación HTTP por `192.168.1.9` para Backend y ambos frontends; PostgreSQL/OCR internos y bindings locales restaurados al terminar. Sin prueba en teléfono físico.
- `git status`, `git diff --stat`, `git diff --check` ejecutados. Sin errores de espacios; advertencias LF/CRLF no son errores de diff.
- V8 intacta: 226 archivos coinciden con manifiesto SHA-256. Ya estaba no versionada al iniciar. V9 sin cambios en Git. Solo se editaron archivos bajo V10.

## Corrección autorizada y conservación de datos

El usuario autorizó corregir únicamente los DNI duplicados de PRIM004 y PRIM005 tras verificar su origen sintético. Se contrastaron correos, generadores de las pruebas y evidencias de las ejecuciones anteriores: `registration.json` y `v10-flow-5c1d5152-681e-4ac0-b73c-8e5d1f93ff5b.json`. No se infirió el carácter sintético solamente por el nombre de la cuenta.

Se guardó un respaldo de las tablas públicas antes de cambiar datos en `tools/evidence/dni-repair-1792641778892/before.json` (local e ignorado por Git, contiene datos privados). El UPDATE transaccional condicionó ID, número, correo y DNI anterior; exigió exactamente dos filas. Solo `Membership.dni` pasó de `12345678` a NULL para PRIM004/PRIM005. La comparación inmediatamente posterior verificó que todos los demás datos permanecieron idénticos, incluida PRIME-0001. No se inventaron documentos ni se borraron usuarios, membresías, vehículos, transacciones u otros registros.

Se comprobó el rollback SQL de la migración fallida antes de ejecutar `prisma migrate resolve --rolled-back 20261022000000_guest_prepay_unique_documents`. Después se aplicaron las migraciones normalmente, sin reset ni eliminación de volúmenes.

La prueba de compra de `integration.spec.cjs` ahora crea su propia cuenta/vehículo sintéticos para preservar el saldo, los puntos y el historial de PRIME-0001. Conserva las comprobaciones de pago, puntos, recuperación de respuestas perdidas e idempotencia. `verify-preserved-data.cjs` compara los 81 registros históricos con el respaldo, excluyendo los campos nuevos de las migraciones y los cambios esperados del contador/registro de migraciones. Evidencia: `post-regression-verification.json`. Las únicas modificaciones de valores históricos autorizadas siguen siendo los dos DNI.

Comandos de integración ejecutados desde V10:

```powershell
docker compose up -d --build
docker compose ps
node FrontEnd_2/node_modules/@playwright/test/cli.js test --config tools/playwright.v9.cjs
node tools/run-integration.cjs --docker
node tools/check-lan.cjs
```

La entrega de recuperación sigue siendo DEMO académico; correo/SMS real y prueba en dispositivo físico son limitaciones explícitas, no integraciones afirmadas.

V10 LISTA PARA MERGE

## Archivos modificados o nuevos en el estado acumulado de V10

- V10/Backend/prisma/migrations/20261021000000_membership_number_counter/migration.sql
- V10/Backend/prisma/migrations/20261022000000_guest_prepay_unique_documents/migration.sql
- V10/Backend/prisma/migrations/20261022010000_identity_and_recovery/migration.sql
- V10/Backend/prisma/schema.prisma
- V10/Backend/scripts/read-reset-demo.cjs
- V10/Backend/src/auth/access.guard.ts
- V10/Backend/src/auth/auth.controller.ts
- V10/Backend/src/auth/auth.module.ts
- V10/Backend/src/auth/auth.service.spec.ts
- V10/Backend/src/auth/auth.service.ts
- V10/Backend/src/auth/login.dto.ts
- V10/Backend/src/auth/password-reset.dto.ts
- V10/Backend/src/auth/password-reset.service.ts
- V10/Backend/src/auth/recovery-delivery.spec.ts
- V10/Backend/src/auth/recovery-delivery.ts
- V10/Backend/src/auth/register.dto.ts
- V10/Backend/src/common/document-conflict.ts
- V10/Backend/src/common/http-error.filter.ts
- V10/Backend/src/common/response.dto.ts
- V10/Backend/src/config/environment.ts
- V10/Backend/src/memberships/memberships.repository.ts
- V10/Backend/src/memberships/profile.dto.ts
- V10/Backend/src/prisma/prisma.service.ts
- V10/Backend/src/transactions/authorizations.service.ts
- V10/Backend/src/transactions/transactions.service.spec.ts
- V10/Backend/src/transactions/transactions.service.ts
- V10/Backend/src/users/membership-number.spec.ts
- V10/Backend/src/users/membership-number.ts
- V10/Backend/src/users/users.repository.ts
- V10/Backend/src/users/users.service.ts
- V10/Backend/test/api.e2e-spec.ts
- V10/Backend/test/auth-recovery.e2e-spec.ts
- V10/Backend/test/prepaid-guest.e2e-spec.ts
- V10/Backend/test/registration.e2e-spec.ts
- V10/Backend/test/v9.e2e-spec.ts
- V10/compose.yaml
- V10/docs/IDENTITY-RECOVERY.md
- V10/docs/VALIDATION-V10-ADJUSTMENTS.md
- V10/docs/VALIDATION-V10-IDENTITY.md
- V10/FrontEnd_1/src/js/plateCamera.js
- V10/FrontEnd_1/src/js/script.js
- V10/FrontEnd_2/js/app.js
- V10/FrontEnd_2/js/login.js
- V10/FrontEnd_2/js/recovery.js
- V10/FrontEnd_2/js/register.js
- V10/FrontEnd_2/js/services/apiClient.js
- V10/FrontEnd_2/js/services/authService.js
- V10/FrontEnd_2/js/services/index.js
- V10/FrontEnd_2/js/views.js
- V10/FrontEnd_2/tests/api-fixture.cjs
- V10/FrontEnd_2/tests/auth.test.js
- V10/FrontEnd_2/tests/identity-recovery.spec.cjs
- V10/FrontEnd_2/tests/login.spec.cjs
- V10/FrontEnd_2/tests/mobile.spec.cjs
- V10/FrontEnd_2/tests/register.spec.cjs
- V10/FrontEnd_2/tests/v10-navigation.spec.cjs
- V10/FrontEnd_2/tests/v9.spec.cjs
- V10/tools/integration.spec.cjs
- V10/tools/playwright.v9.cjs
- V10/tools/registration.spec.cjs
- V10/tools/v10-auth.spec.cjs
- V10/tools/v10-prepaid.spec.cjs
- V10/tools/v9-balance.spec.cjs
- V10/tools/repair-demo-dni.cjs
- V10/tools/verify-preserved-data.cjs
- V10/tools/v9-flow.spec.cjs
- V10/tools/v9-ui.spec.cjs
- V10/VALIDATION.md
