# Informe de preparación de Primax V12

Rama local: `codex/primax-v12-vercel-neon`. Punto de recuperación: `1529de7`.

Solo se modificaron archivos de V12. No se eliminó ningún archivo fuente o versionado ni se alteraron las 18 migraciones existentes. Las compilaciones reemplazan solo sus salidas generadas. No se ejecutaron push, despliegues, consultas a Neon/Redis remoto, migraciones ni seeds efectivos.

## Resultado

Se implementó un perfil académico de pagos simulados y un operador/estación configurables. Las sesiones se consultan en Redis REST por operación; el logout revoca el registro compartido, no solo la cookie. Hay expiración absoluta, rotación al autenticar, CSRF, firma interna y permisos verificados en la función y en NestJS. La base no almacena sesiones ni recibe tablas nuevas.

La preparación no equivale a certificar un despliegue remoto. Sigue pendiente provisionar/configurar servicios con autorización y comprobar el historial real de la base.

## Validación

Node.js 22.21.1 y Prisma 6.19.3. Instalación reproducible del backend y Prime completada. Prisma validate/generate, compilación TypeScript, ESLint y builds locales/Vercel de ambos frontend aprobados.

| Suite | Aprobadas | Fallidas |
|---|---:|---:|
| Backend: unitarias e integración HTTP con persistencia simulada | 161 | 0 |
| Barreras de herramientas y wrappers de seed sin ejecución efectiva | 8 | 0 |
| FuelFlow, incluidos proxy y artefactos sin secretos | 97 | 0 |
| Primax Prime | 27 | 0 |
| PrintAgent: solo contratos/configuración, sin impresión | 44 | 0 |

También se comprobó sintaxis de 158 archivos JavaScript de V12. La auditoría por patrones no detectó secretos; no es una auditoría del historial Git completo. Detalles: [VALIDATION-VERCEL.json](VALIDATION-VERCEL.json).

## Variables, despliegue y límites

La [guía exacta de despliegue](DEPLOYMENT-VERCEL.md) incluye las variables privadas por proyecto, Root Directory, comandos, salidas, TLS, agrupación Neon, revocación, versiones anteriores de despliegue y separación de la base de demostración. Las plantillas `academic.env.example` contienen exclusivamente ejemplos ficticios.

Pendientes: verificación real de Neon y Vercel; Redis REST con lectura consistente; datos de catálogo/inventario; OCR externo protegido; correo opcional. La impresión desde un origen Vercel sigue bloqueada por el contrato local de PrintAgent. El operador público no recibe acceso al panel administrativo. Las ?rdenes pendientes sin asociación Redis requieren revisión, no reasignación automática.

## Archivos modificados o nuevos

Todas las rutas siguientes están dentro de V12. Los archivos generados de compilación, dependencias y cachés quedan ignorados por Git.

| Archivo | Justificación |
|---|---|
| `.env.example` | Plantilla sin secretos; separar parámetros locales y académicos. |
| `Backend/.env.example` | Plantilla sin secretos; separar parámetros locales y académicos. |
| `Backend/academic.env.example` | Plantilla sin secretos; separar parámetros locales y académicos. |
| `Backend/package-lock.json` | Fijar Node 22 y mantener consistencia de instalación/scripts/lockfile. |
| `Backend/package.json` | Fijar Node 22 y mantener consistencia de instalación/scripts/lockfile. |
| `Backend/prisma/schema.prisma` | Separar conexión agrupada de consulta y directa de CLI; sin alterar modelos ni migraciones. |
| `Backend/prisma/seed.ts` | Bloquear el seed invocado directamente si la base no es local. |
| `Backend/scripts/copy-build-support.cjs` | Barreras de base local, CLI reproducible y soporte del seed compilado. |
| `Backend/scripts/database-safety.cjs` | Barreras de base local, CLI reproducible y soporte del seed compilado. |
| `Backend/scripts/database-safety.d.cts` | Barreras de base local, CLI reproducible y soporte del seed compilado. |
| `Backend/scripts/database-safety.test.cjs` | Barreras de base local, CLI reproducible y soporte del seed compilado. |
| `Backend/scripts/demo.cjs` | Barreras de base local, CLI reproducible y soporte del seed compilado. |
| `Backend/scripts/local-db-command.cjs` | Barreras de base local, CLI reproducible y soporte del seed compilado. |
| `Backend/scripts/seed-local-demo.cjs` | Barreras de base local, CLI reproducible y soporte del seed compilado. |
| `Backend/scripts/v9-demo.cjs` | Barreras de base local, CLI reproducible y soporte del seed compilado. |
| `Backend/src/app.module.ts` | Integración del límite distribuido para peticiones firmadas del quiosco. |
| `Backend/src/auth/access.guard.ts` | Integrar el operador con los guardias existentes, sin conceder permisos de socio o administrador. |
| `Backend/src/auth/access.ts` | Integrar el operador con los guardias existentes, sin conceder permisos de socio o administrador. |
| `Backend/src/auth/auth.module.ts` | Integrar el operador con los guardias existentes, sin conceder permisos de socio o administrador. |
| `Backend/src/config/environment.ts` | Validar perfil académico, secretos privados, TLS y aislamiento local. |
| `Backend/src/fuels/fuels.controller.ts` | Filtrar el catálogo del operador a su estación confiable. |
| `Backend/src/kiosk/environment.spec.ts` | Pruebas de sesión, autorización, HTTP, Redis y perfil sin servicios reales. |
| `Backend/src/kiosk/kiosk-http.spec.ts` | Pruebas de sesión, autorización, HTTP, Redis y perfil sin servicios reales. |
| `Backend/src/kiosk/kiosk.controller.ts` | Sesiones compartidas, límites atómicos, firma, CSRF y permisos por operación/estación. |
| `Backend/src/kiosk/kiosk.service.ts` | Sesiones compartidas, límites atómicos, firma, CSRF y permisos por operación/estación. |
| `Backend/src/kiosk/kiosk.spec.ts` | Pruebas de sesión, autorización, HTTP, Redis y perfil sin servicios reales. |
| `Backend/src/kiosk/policy.ts` | Sesiones compartidas, límites atómicos, firma, CSRF y permisos por operación/estación. |
| `Backend/src/kiosk/redis-store.spec.ts` | Pruebas de sesión, autorización, HTTP, Redis y perfil sin servicios reales. |
| `Backend/src/kiosk/redis-store.ts` | Sesiones compartidas, límites atómicos, firma, CSRF y permisos por operación/estación. |
| `Backend/src/main.ts` | Mantener entrada NestJS nativa y límite JSON coherente para OCR. |
| `Backend/src/payments/demo-provider.ts` | Permitir el proveedor simulado ?nicamente en perfiles de demostración explícitos. |
| `Backend/src/setup-app.ts` | Deshabilitar Swagger público por defecto y conservar el entorno local. |
| `Backend/src/stations/stations.controller.ts` | Filtrar el catálogo del operador a su estación confiable. |
| `Backend/src/vehicles/recognition.service.ts` | Permitir desactivar OCR externo conservando el ingreso manual. |
| `Backend/test/admin-mail.e2e-spec.ts` | Rechazar destinos remotos y mantener ambas URLs Prisma en el esquema temporal local. |
| `Backend/test/api.e2e-spec.ts` | Rechazar destinos remotos y mantener ambas URLs Prisma en el esquema temporal local. |
| `Backend/test/auth-recovery.e2e-spec.ts` | Rechazar destinos remotos y mantener ambas URLs Prisma en el esquema temporal local. |
| `Backend/test/jest-e2e.config.cjs` | Rechazar destinos remotos y mantener ambas URLs Prisma en el esquema temporal local. |
| `Backend/test/local-database.setup.cjs` | Rechazar destinos remotos y mantener ambas URLs Prisma en el esquema temporal local. |
| `Backend/test/prepaid-guest.e2e-spec.ts` | Rechazar destinos remotos y mantener ambas URLs Prisma en el esquema temporal local. |
| `Backend/test/registration.e2e-spec.ts` | Rechazar destinos remotos y mantener ambas URLs Prisma en el esquema temporal local. |
| `Backend/test/v11-closure.e2e-spec.ts` | Rechazar destinos remotos y mantener ambas URLs Prisma en el esquema temporal local. |
| `Backend/test/v11-provider.e2e-spec.ts` | Rechazar destinos remotos y mantener ambas URLs Prisma en el esquema temporal local. |
| `Backend/test/v11_2-demo.e2e-spec.ts` | Rechazar destinos remotos y mantener ambas URLs Prisma en el esquema temporal local. |
| `Backend/test/v9.e2e-spec.ts` | Rechazar destinos remotos y mantener ambas URLs Prisma en el esquema temporal local. |
| `Backend/vercel.json` | Instalación/build, rutas, función o salida estática para el proyecto Vercel correspondiente. |
| `DEPLOYMENT-VERCEL.md` | Instrucciones, variables, revocación, límites y pendientes de despliegue. |
| `FrontEnd_1/academic.env.example` | Plantilla sin secretos; separar parámetros locales y académicos. |
| `FrontEnd_1/api/[...path].js` | Función del mismo origen con lista de operaciones, autorización previa y prueba firmada a NestJS. |
| `FrontEnd_1/nginx/default.conf` | Mantener la ruta de intervención de autorización también en el proxy local. |
| `FrontEnd_1/package.json` | Fijar Node 22 y mantener consistencia de instalación/scripts/lockfile. |
| `FrontEnd_1/server/gateway.js` | Función del mismo origen con lista de operaciones, autorización previa y prueba firmada a NestJS. |
| `FrontEnd_1/server/policy.js` | Función del mismo origen con lista de operaciones, autorización previa y prueba firmada a NestJS. |
| `FrontEnd_1/src/js/apiClient.js` | Enviar marcador/CSRF y bloquear la UI al vencer la sesión, sin reintento financiero automático. |
| `FrontEnd_1/src/js/kioskSession.js` | Formulario, CSRF en memoria, expiración y cierre; cookie nunca accesible a JavaScript. |
| `FrontEnd_1/src/js/script.js` | Esperar sesión y elegir estación desde estado autenticado; mantener selección local. |
| `FrontEnd_1/tests/build-secrets.test.js` | Verificar aislamiento del proxy, cookies, revocación, permisos y ausencia de secretos en dist. |
| `FrontEnd_1/tests/kiosk-gateway.test.js` | Verificar aislamiento del proxy, cookies, revocación, permisos y ausencia de secretos en dist. |
| `FrontEnd_1/tools/build.cjs` | Build V12: parámetros públicos limitados y URL HTTPS obligatoria en Vercel. |
| `FrontEnd_1/vercel.json` | Instalación/build, rutas, función o salida estática para el proyecto Vercel correspondiente. |
| `FrontEnd_2/academic.env.example` | Plantilla sin secretos; separar parámetros locales y académicos. |
| `FrontEnd_2/package-lock.json` | Fijar Node 22 y mantener consistencia de instalación/scripts/lockfile. |
| `FrontEnd_2/package.json` | Fijar Node 22 y mantener consistencia de instalación/scripts/lockfile. |
| `FrontEnd_2/playwright.config.cjs` | Bloquear destinos remotos en configuraciones de pruebas de navegador. |
| `FrontEnd_2/tools/build.cjs` | Build V12: parámetros públicos limitados y URL HTTPS obligatoria en Vercel. |
| `FrontEnd_2/vercel.json` | Instalación/build, rutas, función o salida estática para el proyecto Vercel correspondiente. |
| `README.md` | Instrucciones, variables, revocación, límites y pendientes de despliegue. |
| `VALIDATION-VERCEL.json` | Resultados reproducibles de las validaciones seguras. |
| `VERCEL-PREPARATION-REPORT.md` | Informe final y listado completo de cambios. |
| `compose.database-managed.yaml` | Proyecto V12 separado y migraciones/seeds automáticos deshabilitados para base administrada. |
| `compose.yaml` | Proyecto V12 separado y migraciones/seeds automáticos deshabilitados para base administrada. |
| `tools/audit-secrets.cjs` | Limitar correctamente la auditoría a V12, reportando solo nombres/líneas. |
| `tools/check-registration-persistence.cjs` | Aislar herramientas heredadas y comprobar el destino también dentro del contenedor. |
| `tools/database.cjs` | Aislar herramientas heredadas y comprobar el destino también dentro del contenedor. |
| `tools/local-targets.cjs` | Rechazar API/base remota en herramientas y en configuración pública del servidor local. |
| `tools/playwright.http-live.cjs` | Bloquear destinos remotos en configuraciones de pruebas de navegador. |
| `tools/playwright.integration.cjs` | Bloquear destinos remotos en configuraciones de pruebas de navegador. |
| `tools/playwright.print.cjs` | Bloquear destinos remotos en configuraciones de pruebas de navegador. |
| `tools/playwright.v11_1_1.cjs` | Bloquear destinos remotos en configuraciones de pruebas de navegador. |
| `tools/playwright.v11_2.cjs` | Bloquear destinos remotos en configuraciones de pruebas de navegador. |
| `tools/playwright.v11_3.cjs` | Bloquear destinos remotos en configuraciones de pruebas de navegador. |
| `tools/playwright.v11_4.cjs` | Bloquear destinos remotos en configuraciones de pruebas de navegador. |
| `tools/playwright.v9.cjs` | Bloquear destinos remotos en configuraciones de pruebas de navegador. |
| `tools/repair-demo-dni.cjs` | Aislar herramientas heredadas y comprobar el destino también dentro del contenedor. |
| `tools/run-integration.cjs` | Aislar herramientas heredadas y comprobar el destino también dentro del contenedor. |
| `tools/serve.cjs` | Rechazar API/base remota en herramientas y en configuración pública del servidor local. |
| `tools/start-v11_1_1.cjs` | Usar exclusivamente el proyecto/volumen Docker V12 y verificar ese aislamiento. |
| `tools/start-v11_1_1.test.cjs` | Usar exclusivamente el proyecto/volumen Docker V12 y verificar ese aislamiento. |
| `tools/startup-snapshot.cjs` | Aislar herramientas heredadas y comprobar el destino también dentro del contenedor. |
| `tools/test-env.cjs` | Aislar herramientas heredadas y comprobar el destino también dentro del contenedor. |
| `tools/validate-local.cjs` | Orquestar compilaciones y pruebas Node 22 sin migraciones, seeds ni servicios reales. |
