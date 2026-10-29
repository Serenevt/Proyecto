# V12.1 — preparación para staging

**5C en curso (29-10-2026):** FuelFlow, Prime y Control tienen alias HTTPS estables `primax-v12-1-{fuelflow,prime,control}-staging.vercel.app` desplegados por CLI. Faltan secreto HMAC de FuelFlow en Vercel Production, CORS exacto en Render y pruebas funcionales completas. No hay auto-deploy por push.

Estado: fase 5B-1 activa y validada para Backend/OCR/Neon/Upstash. Evidencia y procedimiento en [STAGING-DEPLOYMENT.md](STAGING-DEPLOYMENT.md). Frontends, DBeaver humano y hardware local siguen para fases posteriores. La matriz técnica está en `STAGING-ARCHITECTURE.md`, sección 13.

## Componentes y alojamiento previsto

| Componente | Uso en staging | Consideraciones |
|---|---|---|
| Backend | Servicio Node/NestJS persistente | Debe alcanzar PostgreSQL y Redis; SMTP es posterior y OCR puede quedar deshabilitado temporalmente. Health check `/api/v1/health`. |
| FrontEnd_1 | FuelFlow estático más BFF Node Function y proxy Supervisor | Handlers compartidos probados localmente; validar rutas y límites en HTTPS real durante 5B. |
| FrontEnd_2 | Primax Prime estático | API HTTPS absoluta hacia Backend con Bearer y CORS exacto. |
| FrontEnd_3 | Primax Control estático más Function `/api/v1/control/*` | API relativa y cookie HttpOnly del mismo origin; validar login, dashboard y refresh en HTTPS real. |
| PostgreSQL | Base Neon dedicada exclusivamente a staging | No usar DB de producción, local ni compartida. |
| Redis | Redis accesible por TLS con persistencia/HA apropiada | KioskStore necesita operaciones atómicas y lectura consistente desde el primario. |
| PlateRecognition | Parte del MVP, opcional en runtime | Entrada manual disponible; solo habilitar luego de proveer red privada/autenticación. |
| PrintAgent | Agente local del kiosco/PC | Nunca desplegar como función serverless ni exponer a Internet; solo loopback. |
| Correo | Proveedor real pendiente | `PASSWORD_RESET_DELIVERY=disabled` hasta configurar SMTP genérico. |

## Variables por componente

Usar un gestor de secretos y variables independientes por entorno. Estos nombres son categorías, no valores que deban copiarse a Git.

### Backend privado

- `NODE_ENV=production`, `APP_MODE=academic`, `PORT`, `DATABASE_PURPOSE=academic-demo` luego de aprobar el aislamiento.
- `DATABASE_URL`: Neon pooled URL; TLS obligatorio y `connection_limit` acotado.
- `DATABASE_URL_UNPOOLED`: conexión directa a la misma rama/base/esquema, TLS. Prisma usa esta URL para migraciones.
- `JWT_SECRET`, `KIOSK_API_KEY`, `KIOSK_GATEWAY_SECRET`: tres secretos aleatorios independientes; gateway y backend comparten solo el secreto HMAC que les corresponde. `KIOSK_API_KEY` no puede crear autorizaciones, órdenes ni transacciones nuevas y nunca debe quedar en Nginx ni en el navegador.
- `KIOSK_OPERATOR_USER`, `KIOSK_OPERATOR_PASSWORD_HASH`, `KIOSK_STATION_ID`, `KIOSK_SESSION_NAMESPACE`, `KIOSK_SESSION_VERSION`.
- `KIOSK_REDIS_REST_URL` HTTPS y `KIOSK_REDIS_REST_TOKEN`, compatibles con los comandos Redis requeridos (`GET/SET/DEL/EVAL`); el perfil académico actual no admite Redis TCP directo ni fallback in-memory.
- `CORS_ORIGINS`: lista exacta de origins HTTPS finales, sin rutas, barra final ni comodín.
- `PRIMAX_CONTROL_PUBLIC_URL`: origin público HTTPS de Control, usado para construir el enlace de verificación de correo; no dejar el fallback localhost en staging.
- `PAYMENT_ENV=demo`, `DEMO_WALLET_ENABLED=true`; no configurar credenciales de proveedor real.
- SMTP futuro `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, con TLS requerido.
- OCR: `PLATE_RECOGNITION_ENABLED=true` cuando exista el Web Service Render Free protegido con `OCR_SERVICE_SECRET`; `PLATE_RECOGNITION_URL` es su origin HTTPS. Private Service sigue preferido para producción. `PLATE_CONFIDENCE_THRESHOLD` controla la sugerencia. Si aún no está listo, `false` habilita el fallback manual sin bloquear el MVP.
- `SHOW_DEMO_ADMIN_CREDENTIALS=false`, Swagger deshabilitado, sin credenciales de demo sembradas en staging compartido.

### FuelFlow / gateway

- `FUELFLOW_PUBLIC_ORIGIN`: origin HTTPS exacto.
- `BACKEND_ORIGIN`: origin privado HTTPS o red privada al Backend.
- `KIOSK_GATEWAY_SECRET`: mismo secreto aleatorio del Backend, nunca `NEXT_PUBLIC_*` ni asset estático.
- Las rutas `/api/v1/authorizations`, `/api/v1/online-orders` y `/api/v1/transactions` de FuelFlow deben pasar obligatoriamente por el BFF HMAC; su creación exige sesión técnica y `TerminalOperation` activa. Ningún proxy de staging puede reintroducir Nginx → Backend directo para nuevas ventas.
- Mantener cookies `HttpOnly; Secure; SameSite=Strict; Path=/`, protección Origin/CSRF y firma HMAC. No añadir `Domain`.
- El servidor BFF debe aceptar solo rutas de `FrontEnd_1/server/policy.js`; no reenviar destinos o cabeceras arbitrarias.

### FrontEnd_2 / FrontEnd_3

- `PRIME_API_BASE_URL` en el build Vercel actual debe ser la URL pública HTTPS explícita de Backend terminada en `/api/v1`; contiene solo una URL, nunca credenciales.
- `PRIMAX_CONTROL_API_URL` es `/api/v1`; `BACKEND_ORIGIN` y `PRIMAX_CONTROL_PUBLIC_URL` se configuran solo en Function/servidor de Control, no en JavaScript público.
- Origins permitidos y dominios de cookies deben corresponder al diseño final del mismo sitio. Revisar CORS, CSRF, `SameSite`, subdominios y HTTPS con los dominios reales antes de aprobarlo.
- PrintAgent se descubre solo en loopback desde la máquina local; nunca configurar un host público para él.

## Vercel: preparación, no despliegue

Raíces, comandos y rutas que habría que configurar después de elegir dominios y proveedor:

| Proyecto/root | Build y salida | Rutas que deben resolverse |
|---|---|---|
| `FrontEnd_1` | `npm run build`; salida `dist/`; `vercel.json`, BFF `api/[...path].js` y proxy `api/supervisor-proxy.js` | `/api/*` llega al BFF HMAC; `/supervisor-api/*` se reescribe al proxy de rutas humanas permitidas. |
| `FrontEnd_2` | `npm run build`; salida `www/`; ya tiene `vercel.json`; requiere `PRIME_API_BASE_URL=https://<backend>/api/v1` en build | El API usa URL absoluta según `FrontEnd_2/academic.env.example`; permitir ese origin exacto en CORS. No poner secretos en esta variable. |
| `FrontEnd_3` | `npm run build`; salida `dist/`; `vercel.json` y Function API local preparados | `/api/v1/control/*` pasa por proxy same-origin acotado con `BACKEND_ORIGIN` servidor; probar en HTTPS real en 5B. |
| Backend | `npm run prisma:generate && npm run build`; salida `dist/` | API `/api/v1/*`, health `/api/v1/health`. `Backend/vercel.json` existe como antecedente, pero el despliegue de NestJS requiere comprobar límites de ejecución/DB antes de decidir si se usa función o servicio persistente. |

No hay dominios aprobados ni deployment remoto. FrontEnd_1/2/3 tienen configuración de build; FrontEnd_1 incorpora rewrite Supervisor y FrontEnd_3 incorpora Function Control. Backend necesita proceso/conexiones apropiadas y puede alojarse separado. Validar los límites reales de Function, Redis, cookies y rutas en 5B.

Builds locales existentes:

- `FrontEnd_1`: `npm run build` (artefacto `dist/`).
- `FrontEnd_2`: `npm run build` (artefacto `www/`).
- `FrontEnd_3`: `npm run build` (artefacto `dist/`).
- Backend: `npm run build` (artefacto `dist/`; ejecutar como servicio backend, no asumir función serverless).

No definir previews públicamente accesibles con credenciales compartidas sin protección. Establecer roots, output directories, rutas de `/api`, headers de seguridad y dominios antes de crear los proyectos. El BFF y cookies no deben apuntar al Backend con credenciales en el cliente. La configuración local de Functions y rewrites está preparada; falta verificarla en el hosting real durante 5B.

## Neon: checklist de migraciones

Orden para la fase 5B-1 autorizada, tras crear y verificar inequívocamente la DB V12.1:

1. Confirmar una rama Neon nueva, privada y dedicada a staging; registrar responsable, región, política de datos y límites de conexiones.
2. Crear y ensayar un backup/restore point, incluyendo prueba de restauración aislada; decidir ventana y rollback.
3. Comparar el historial de `Backend/prisma/migrations` en orden lexicográfico con `prisma migrate status` en la rama autorizada. No corregir historial publicado ni editar migraciones históricas.
4. Verificar que el usuario de migración usa `DATABASE_URL_UNPOOLED` directo; mantener runtime en `DATABASE_URL` pooled. Confirmar TLS y `DATABASE_PURPOSE` antes de cualquier comando.
5. Revisar SQL, índices, constraints, triggers, locks, duración esperada y compatibilidad hacia atrás. Ejecutar `prisma migrate deploy` en la DB dedicada, nueva y verificada; nunca `db push`, `migrate reset` ni seed de demo en staging con datos existentes.
6. Aplicar en ventana acordada, capturar salida y revisar `prisma migrate status`; probar health/read-only checks y flujos demo en staging.
7. Si falla, detener release y usar restore point/rollback acordado. No borrar migraciones ni modificar datos a ciegas.

La lista actual de migraciones se obtiene localmente con `find Backend/prisma/migrations -mindepth 1 -maxdepth 1 -type d | sort`. Historial local no prueba qué existe en una base remota. No se realizó conexión remota en esta fase.

## Controles antes del primer staging

- [ ] Revisar y aprobar dominios, CORS, cookies y políticas de navegador.
- [ ] Crear secretos nuevos en el gestor del entorno; no reutilizar `.env` local.
- [ ] Confirmar redis privado, TLS, lectura consistente, namespace dedicado y revocación probada.
- [ ] Confirmar station, combustible, terminal, usuario Supervisor y cuenta SUPER_ADMIN de staging; no reutilizar credenciales DEMO por defecto.
- [ ] Confirmar que la ausencia de SMTP no bloquea login ni operaciones; planificar proveedor real posteriormente.
- [ ] Proteger OCR con autenticación de servicio en staging Free y red privada en producción y revisar privacidad de imágenes.
- [ ] Instalar PrintAgent únicamente en el PC de kiosco; validar loopback, origin exacto y fallback. No publicar su puerto.
- [ ] Revisar logs, retención y redacción de PII; no registrar cookies, contraseñas, JWT, códigos de correo ni contenido sensible.
- [ ] Definir monitoreo, alertas, backups, restore test, rollback, responsable y ventana.
- [ ] Ejecutar migraciones aprobadas solo después de los pasos anteriores.

## Pendientes concretos antes de la primera revisión de staging

0. **Bloqueante funcional de Terminal Binding RESUELTO en local (Fase 4D-3):** Compose ejecuta Nginx → BFF HMAC → Backend; pairing Supervisor entrega solo cookie técnica HttpOnly al navegador y FuelFlow inicia/recupera `TerminalOperation`. Las tres creaciones financieras Kiosk exigen credencial técnica vigente y operación activa; `KIOSK_API_KEY` directo recibe 403. El E2E HTTP sobre `127.0.0.1:26081` completó postpago y Yape DEMO, reintentos, progress, transacciones y cierres. PostgreSQL verificó vínculos técnicos y un movimiento `DISPENSE` por venta; intentos sin binding no dejaron autorización, reserva ni transacción. El Supervisor cerró turno durante una operación prepago: esa operación finalizó y una nueva fue rechazada. Phase 1A, inventario, incidentes, Control, gateway y FuelFlow pasaron localmente. En staging HTTPS, conservar `Secure` y `__Host-` para la cookie técnica; el modo HTTP está limitado a loopback local. Repetir la prueba de la frontera pública con dominios y Redis reales antes de desplegar.
1. Elegir y aprobar dominios HTTPS y alojamiento para Backend persistente, Redis y OCR protegido. El proveedor SMTP se definirá después. No se eligieron en esta fase.
2. Crear Neon y Redis dedicados, revisar aislamiento/backups/restore point y guardar secretos nuevos en un gestor. Ninguno se consultó ni se creó aquí.
3. Revisar el flujo del gateway HMAC de FuelFlow en un host HTTPS real, sus cookies Secure y revocación Redis. Compose local usa proxy Nginx loopback, no pretende simular esta frontera pública.
4. **RESUELTO localmente en 5A.1:** Control tiene `vercel.json` y proxy Function same-origin; Prime mantiene API HTTPS explícita/Bearer y CORS exacto. Probar ambos con origins HTTPS definitivos en 5B.
5. Decidir el alojamiento/runtime de Backend y probar conexiones Prisma bajo sus límites. No asumir que la API NestJS puede ejecutarse sin ajustes como función serverless.
6. **OCR del MVP:** desplegar como servicio separado protegido cuando esté listo; `PLATE_RECOGNITION_ENABLED=false` permite comenzar temporalmente con captura manual. Si usa Web Service HTTPS público, proteger `POST /recognize` con secreto exclusivo Backend → OCR; nunca enviar el secreto al navegador.
7. En el PC Windows del kiosco, preparar impresora/driver y una configuración nueva de PrintAgent en `data-v12_1`; revisar cola y fallback allí. En Linux solo quedaron validados contratos y fallback navegador, sin impresión física.
8. Instalar Chromium/Playwright en un entorno CI si se exige la pasada móvil de navegador. En esta VM faltan `@playwright/test` para FE2 y Chromium; las suites de lógica y API reales sí pasaron.
9. Aprobar el checklist de Neon por separado y ejecutar luego la revisión de migraciones con el responsable; no usar el conteo local como evidencia del estado remoto.

## Límites funcionales del MVP

Staging sigue siendo académico: Yape, Plin y NFC son métodos simulados; saldo y pagos no se conectan a proveedores. INC-001 genera revisión, no reembolso. Los comprobantes no son factura electrónica ni SUNAT. OCR es sugerencia, no autorización. PrintAgent apagado o un rechazo de impresión no cambia el pago ni la operación.
