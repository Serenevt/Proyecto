# V12.1 — arquitectura de staging (fase 5A)

Auditoría inicial del estado local en `a74f8de`, actualizada en fase 5A.1 con límites de runtime preparados localmente. No se aprovisionó, desplegó ni migró recurso remoto. `V12/` permanece congelada. Las URL siguientes son marcadores conceptuales, no dominios reservados. Las decisiones y estados de 5A.1 al final de este documento sustituyen los pendientes originales de 5A cuando se refieren al mismo código.

## 1. Arquitectura objetivo y componentes

```text
Browser FuelFlow ─HTTPS─> origin FuelFlow ─/api/*─> BFF Node Function ─HMAC/HTTPS─> Backend NestJS
                       └─/supervisor-api/*─> proxy acotado ─HTTPS─> Backend
Browser Prime ─HTTPS/CORS exacto/Bearer─> Backend
Browser Control ─HTTPS─> origin Control ─/api/v1/control/*─> proxy ─HTTPS─> Backend
Backend ─TLS─> PostgreSQL; ─HTTPS REST─> Redis; ─red privada─> OCR opcional
Backend ─HTTPS privado/autenticado, si se habilita─> OCR Python/Tesseract
PC de estación ─loopback solamente─> PrintAgent (separado de los hosts públicos)
```

| Componente | Ruta repo | Runtime actual | Dependencias | Estado local | Persistencia | Público | Recomendación staging |
|---|---|---|---|---|---|---|---|
| Backend | `V12.1/Backend` | Nest/Express Node 22, listener | Prisma, PostgreSQL, Redis REST; SMTP futuro y OCR opcional en runtime | funcional local | DB/Redis externos | API HTTPS, rutas protegidas | servicio Node/container persistente |
| FuelFlow | `V12.1/FrontEnd_1` | Nginx, HTML/JS/CSS | BFF, supervisor API, PrintAgent opcional | funcional local | no, browser local | sí | estático Vercel con Function BFF en el mismo proyecto |
| FuelFlow BFF | `V12.1/FrontEnd_1/server/gateway.js`, `api/[...path].js` | Node detrás de Nginx; adaptador Function ya existe | Backend HMAC, cookies | funcional local | Redis a través del Backend | solo `/api/*` bajo origin FuelFlow | Vercel Node Function; probar contrato de red antes de 5B |
| Prime | `V12.1/FrontEnd_2` | HTML/JS estático/Capacitor | Backend | funcional local | browser y DB vía API | sí | Vercel estático; API HTTPS explícita |
| Primax Control | `V12.1/FrontEnd_3` | HTML/JS estático, proxy local Node | Backend; SMTP futuro para verificación | funcional local | cookie/browser y DB vía API | sí | Vercel estático con proxy `/api/v1/control/*` |
| PostgreSQL | `V12.1/PostgreSQL`, `Backend/prisma` | contenedor local | Prisma | funcional local | sí | no | Neon rama/base dedicada |
| Redis | `V12.1/compose.yaml`, `Backend/src/kiosk/redis-store.ts` | TCP local; REST en perfil académico | sesiones y límites Kiosk | funcional local | TTL de sesiones | no | Upstash Redis REST dedicado |
| PlateRecognition | `V12.1/PlateRecognition` | Flask/Gunicorn/Tesseract en contenedor | OpenCV, modelos Tesseract, tempfiles | funcional local | temporal, sin retención | no | contenedor privado protegido; fallback manual si no está disponible |
| PrintAgent | `V12.1/PrintAgent` | Node/PowerShell/driver Windows | USB PeriPage, disco local | contrato local, hardware pendiente | cola local | no | solo PC de estación |
| Mail/SMTP | `Backend/src/auth/recovery-delivery.ts` | entrega deshabilitada | SMTP genérico | pendiente | proveedor externo | no | configurar posteriormente |

No se copia Docker Compose 1:1: DB, Redis, estáticos, Function, proceso Nest y periféricos tienen necesidades distintas.

## 2. Backend: decisión de runtime

**Principal: servicio Node persistente/container.** `src/main.ts` siempre ejecuta `app.listen()` y hooks de apagado; `vercel.json` solo define build, no un handler HTTP. `PrismaService.onModuleInit()` abre conexión en arranque y `onModuleDestroy()` la cierra; cada instancia Function implicaría arranques/conexiones adicionales. Hay transacciones serializables de hasta 10 s con reintentos, OCR de hasta 12 s, SMTP hasta 15 s, Redis REST con 4 s y peticiones de hasta 3 MB. Un servicio persistente simplifica el presupuesto de tiempo, el pool Prisma y el health check. No se detectó worker/cron indispensable, escritura de archivos de producción ni listener adicional; los `setTimeout` de Prisma son esperas breves de reintento. Esto **no** prueba que Functions sean imposibles.

**Opción Vercel Function, viable con trabajo:** exportar handler Nest/Express con inicialización singleton por instancia, quitar `listen()`/shutdown hooks del camino Function, controlar pool y límites de conexiones Neon, fijar duración/memoria/región/body máximos, y probar OCR/SMTP/transacciones y cold starts. `vercel.json` actual no hace esa adaptación. Es una ruta de mayor cambio y riesgo para 5B. El rate limit Nest global es por instancia; las rutas Kiosk firmadas usan Redis compartido. Revisar límites de otras rutas bajo escala horizontal. `setup-app.ts` permite CORS exacto con credenciales, JSON 3 MB, Helmet; Swagger deshabilitado fuera de local salvo activación explícita. La firma HMAC y sesión Kiosk se validan en Backend. Endpoint OCR cae con 503 si se deshabilita. Se requiere API pública HTTPS para Prime y rutas protegidas; limitar la exposición operativamente.

## 3. BFF y frontera FuelFlow

`gateway.js` exporta un handler `(req,res)` sin estado en memoria; `api/[...path].js` ya lo adapta a Vercel Node Function. Cookies `__Host-*` HttpOnly para sesiones Kiosk/técnica, token CSRF técnico legible, `SameSite=Strict`, `Secure` fuera de `FUELFLOW_LOCAL_HTTP`, `Path=/`, sin `Domain`. Valida origin exacto, `Sec-Fetch-Site`, marcador `X-FuelFlow-Request`, métodos GET/POST, sin query, JSON máximo 3 MB, allowlist de `policy.js`, HMAC por petición y timeout Backend de 18 s. TTL: pre-sesión 300 s, sesión Kiosk 1800 s, sesión técnica 28800 s; Redis guarda las sesiones Kiosk y límites, DB guarda `TerminalCredential`/`TerminalOperation`. El BFF crea/borra cookies en pairing y revoke. Health: la ruta permitida `/api/v1/health` consulta Backend; no hay health autónomo del gateway.

**Destino principal: Function Node del mismo proyecto Vercel que los estáticos FuelFlow.** Así el navegador usa `https://<fuelflow-staging>/api/...` y nunca llama al Backend para ventas sensibles. Function a Backend usa HTTPS y secreto HMAC solo servidor. `FUELFLOW_PUBLIC_ORIGIN` debe coincidir exactamente con el host efectivo; Preview URLs variables requieren configuración por deployment o alias estable. No habilitar `FUELFLOW_LOCAL_HTTP` en staging. Probar que Vercel entregue `req.body` y `Set-Cookie` múltiple como espera el handler, con límite del proveedor y 18 s de upstream; el código acepta body ya parseado o stream. El `maxDuration` actual de 60 s debe contrastarse con plan/límites vigentes. No requiere Node persistente, streaming ni Redis directo.

**Resuelto localmente en 5A.1:** Nginx mantiene `/supervisor-api/login` y `/supervisor-api/supervisor/*` en Compose. Para staging, `vercel.json` reescribe `/supervisor-api/:path*` a `api/supervisor-proxy.js`: allowlist GET/POST de rutas humanas, JWT Supervisor para acciones protegidas y sin forward de cookies Kiosk. Pairing/rotación y ventas continúan exclusivamente bajo `/api/*` BFF. La ruta se verificará además en el host real durante 5B.

## 4. Frontends y rutas

| Proyecto Vercel / Root Directory | Build / salida | API y routing | Ajuste antes de 5B |
|---|---|---|---|
| FuelFlow / `V12.1/FrontEnd_1` | `npm run build` / `dist` | `/` redirige a `/src/index.html`; assets relativos; `/api/*` BFF y `/supervisor-api/*` proxy Function | validar rutas en Preview HTTPS estable en 5B |
| Prime / `V12.1/FrontEnd_2` | `npm run build` / `www` | `PRIME_API_BASE_URL` requiere URL absoluta HTTPS en Vercel; hash routing | fijar URL API y CORS exacto; no inyectar credenciales |
| Control / `V12.1/FrontEnd_3` | `npm run build` / `dist` | hash routing; `credentials: include`; Function `/api/v1/control/*` | validar cookie y rutas en Preview HTTPS estable en 5B |
| Backend | servicio Node, root `V12.1/Backend` | `npm run prisma:generate && npm run build`; `node dist/src/main.js` | health `/api/v1/health`; configurar proceso, TLS y pool |

Prime usa Bearer JWT en `localStorage` (también caché/idempotencia local), no cookie de auth; refresh rehidrata desde API. API absoluta pública queda en bundle y debe contener solo URL. `PAYMENT_ENV=demo` y `DEMO_WALLET_ENABLED` pertenecen al Backend. Control usa cookie HttpOnly; en 5A.1 `tools/build.cjs` admite `/api/v1` incluso con `NODE_ENV=production`, y el proyecto Vercel tiene Function same-origin limitada a `/api/v1/control/*`. El enlace de verificación usa `PRIMAX_CONTROL_PUBLIC_URL/#/verify?token=...`; token hash en DB y expiración 30 min.

FuelFlow en HTTPS no puede invocar PrintAgent actual: `printReceipt.js` solo admite page origin HTTP loopback. Control tiene la misma restricción y botón separado de impresión de navegador. FuelFlow ahora ofrece impresión del ticket confirmado mediante `window.print()` y cierre sin imprimir; pago y operación permanecen guardados si PrintAgent falta. En staging inicial, probar esas dos rutas y mantener la impresión física local fuera de Internet. Habilitar PrintAgent desde HTTPS requiere diseño posterior de origen autorizado, LNA/CORS/preflight y compatibilidad de navegador; no abrir su puerto ni relajar sus controles para 5B.

## 5. Datos: Neon y migraciones

`schema.prisma`: `DATABASE_URL` es conexión runtime; `DATABASE_URL_UNPOOLED` es `directUrl` de migración. Runtime pooled con TLS (`sslmode=require`) y `connection_limit` acotado; migración con conexión directa TLS a la **misma** rama/base/esquema. Revisar límites de conexiones y presupuesto de transacciones. `DATABASE_PURPOSE` debe ser `academic-demo`. No hay prueba del estado remoto en esta fase. `prisma migrate deploy` aplicaría en orden lexicográfico estas **26** migraciones locales:

1. `20261008235020_init`
2. `20261008235100_constraints`
3. `20261009120000_postpago_wallet`
4. `20261009130000_authorization_dispensing`
5. `20261009131000_dispense_progress`
6. `202610120001_v9_debt_profile`
7. `202610120002_v9_credit_constraints`
8. `20261017000000_critical_transaction_integrity`
9. `20261020000000_points_divisor`
10. `20261021000000_membership_number_counter`
11. `20261022000000_business_alerts`
12. `20261022000000_guest_prepay_unique_documents`
13. `20261022010000_align_prisma_constraints`
14. `20261022010000_identity_and_recovery`
15. `20261023000000_payment_lifecycle`
16. `20261023000000_v11_inventory_welcome`
17. `20261023010000_online_orders`
18. `20261023010000_refund_reward_trace`
19. `20261026000000_v12_1_operational_foundations`
20. `20261026010000_v12_1_inventory_reservations`
21. `20261026020000_v12_1_inventory_lifecycle`
22. `20261027010000_v12_1_inventory_reconciliation`
23. `20261028000000_operational_incidents`
24. `20261029000000_primax_control_foundation`
25. `20261029010000_primax_control_operations`
26. `20261029020000_primax_control_customers_receipts`

Revisión SQL: hay backfill de placa seguido de `SET NOT NULL`, constraints e índices únicos; triggers/funciones de inventario, backfill y movimientos iniciales; `ALTER TYPE` y cambios de FK. En una DB vacía dedicada es el camino previsto; con datos existentes, comprobar nulos, duplicados, locks, duración y compatibilidad en copia antes de migrar. Las migraciones incluyen datos técnicos de esquema/inventario, distintos de seeds de aplicación. No ejecutar `prisma migrate reset` ni `prisma db push` sobre staging compartido.

**Checklist previo a migrar:**

1. Crear base/rama dedicada y aislada; verificar propietario y región.
2. Confirmar backup/restore point y ensayo de restauración aislada.
3. Revisar los 26 SQL y `prisma migrate status` de la rama autorizada.
4. Verificar `DATABASE_PURPOSE` y guardas del comando; no usar wrapper local para remoto sin revisar su política.
5. Confirmar URL directa `DATABASE_URL_UNPOOLED`, TLS, destino y permisos de migrador.
6. En fase posterior, ejecutar una sola vez `prisma migrate deploy` desde release aprobado.
7. Verificar `_prisma_migrations`, esquema, constraints, funciones y health.
8. Autorizar solo seeds mínimos académicos necesarios (estación, combustible, inventario/terminal, usuarios de prueba) tras revisar contenido y credenciales; `prisma/seed.ts` crea cuenta DEMO y datos de ejemplo, por lo que **no** ejecutarlo automáticamente.
9. Smoke test de API, inventario, login, terminal y transacción DEMO sin datos reales.
10. Si falla, detener deploy, preservar evidencia y restaurar rama/restore point; alinear código con snapshot.

## 6. Redis REST

`KioskStore` usa TCP solo en `APP_MODE=local`; en académico envía POST HTTPS REST `{command...}`, Bearer, timeout 4 s, y falla cerrado. `KIOSK_SESSION_NAMESPACE` aísla claves; `KIOSK_SESSION_VERSION` invalida sesiones. El BFF no habla con Redis: el Backend administra TTL y límites.

| Comando requerido | Soporte runtime actual | Compatible con Upstash REST |
|---|---|---|
| `GET` | lectura de sesión/binding | sí |
| `SET ... EX ... NX` | creación atómica con TTL | sí; validar respuesta `OK`/null |
| `DEL` | consumo/revocación de sesión | sí |
| `EVAL` con `INCR` + `EXPIRE` | limitador atómico entre instancias | sí, scripting REST; probar en instancia elegida |
| `TTL` | no invocado | no requerido |

Variables: `KIOSK_REDIS_REST_URL`, `KIOSK_REDIS_REST_TOKEN`, `KIOSK_SESSION_NAMESPACE`, `KIOSK_SESSION_VERSION`. Confirmar comportamiento de lectura consistente, cuotas y EVAL de la instancia antes del corte. Upstash documenta scripting en REST.

## 7. OCR, impresión y correo

OCR usa Flask/Gunicorn con 2 workers, OpenCV, NumPy, Pillow, binario y datos `tesseract-ocr-eng`; escribe imágenes solo en `TemporaryDirectory`, sin almacenamiento permanente. Cada candidato puede consumir hasta 4 s de subprocess y el Backend espera 12 s: hay riesgo de timeout con imágenes difíciles. `/recognize` no autentica y el Backend no envía token. Por ello **no** exponer OCR públicamente. Opción inicial: `PLATE_RECOGNITION_ENABLED` deshabilitado y entrada manual. Si OCR es requisito de demo, contenedor Python en red privada con HTTPS/identidad de servicio, límite de tamaño y prueba de latencia; si la red privada no es posible, añadir auth de servicio antes de habilitar. Vercel Function no es destino recomendado para este binario/modelos y tiempos.

PrintAgent queda en `127.0.0.1:25443`, transporte HTTP loopback, origin HTTP localhost explícito, CORS/preflight y marcador `X-FuelFlow-Print`; disco `data-v12_1` y driver Windows. No Internet ni Vercel. En HTTPS staging se prueba cierre sin impresión FuelFlow y botón de impresión navegador en Control. La impresión física posterior exige revisión de restricciones LNA/mixed content en navegadores objetivo y un origin HTTPS autorizado de forma segura; ningún cambio de runtime ahora.

Mailpit eliminado del MVP. Proveedor de correo real pendiente de configuración posterior. `PASSWORD_RESET_DELIVERY=disabled` deja el login y la operación disponibles; recuperación y solicitud pública de acceso muestran indisponibilidad explícita, sin crear una solicitud que no puede verificarse. El alta supervisada de usuarios de Control sigue disponible. Al configurar SMTP posteriormente, verificar `PRIMAX_CONTROL_PUBLIC_URL`, token de un solo uso por hash y 30 min de caducidad. No registrar tokens.

PlateRecognition forma parte del MVP y se desplegará como componente opcional en runtime. FuelFlow conserva fallback manual cuando OCR no está disponible. Backend llama por HTTP JSON `POST /recognize` con imagen base64; el servicio Python no autentica, por lo que debe permanecer en red privada o detrás de una identidad de servicio antes de habilitarlo en staging. Nunca publicar el puerto Python.

## 8. URLs, cookies y CORS

Propuesta de placeholders HTTPS: `https://<fuelflow-staging>` (estáticos, `/api/*` BFF y `/supervisor-api/*` proxy); `https://<prime-staging>`; `https://<control-staging>` (estáticos y `/api/v1/*` proxy); `https://<api-staging>` (Backend público protegido). OCR, DB, Redis y SMTP sin URL de navegador. `BACKEND_ORIGIN` y el proxy pueden usar origin privado HTTPS si la plataforma lo permite; Prime requiere API pública HTTPS con la implementación actual. Alias estables evitan perder cookies al cambiar Preview URL. No usar dominio definitivo hasta definirlo.

| Cookie | Emisor | Consumidor | HttpOnly | Secure staging | SameSite | Path | Dominio/origin |
|---|---|---|---|---|---|---|---|
| `__Host-primax-kiosk` | BFF FuelFlow | BFF | sí | sí | Strict | `/` | host FuelFlow, sin Domain |
| `__Host-primax-terminal` | BFF en pairing | BFF | sí | sí | Strict | `/` | host FuelFlow, sin Domain |
| `__Host-primax-terminal-csrf` | BFF en pairing | JS FuelFlow y BFF | no | sí | Strict | `/` | host FuelFlow, sin Domain |
| CSRF Kiosk | Backend vía BFF, en JSON | JS FuelFlow y Backend firmado | no es cookie | transporte HTTPS | origin FuelFlow | n/a | memoria JS; ligado a sesión Redis |
| `primax_control` | Backend, vía proxy Control | Backend en `/control/*` | sí | **no hoy en academic: bloqueante** | Strict | `/api/v1/control` | host Control si proxy same-origin; sin Domain |

Las cookies `*-local` HTTP solo existen con `FUELFLOW_LOCAL_HTTP`; no usarlas en staging. `__Host-*` exige `Secure`, `Path=/`, sin Domain; el BFF lo cumple. Cambiar Backend para que `primax_control` sea `Secure` también en `APP_MODE=academic` servido por HTTPS, y probar `Set-Cookie`/logout tras proxy. Control debe proteger POST sensibles frente a CSRF: `SameSite=Strict` y same-origin son la barrera actual; confirmar validación Origin/Fetch Metadata o añadir protección explícita antes de publicar. El Backend no debe aceptar `*` junto con credentials.

| Origen | Destino | Rutas | CORS requerido | Credentials |
|---|---|---|---|---|
| FuelFlow | FuelFlow BFF | `/api/*` | no | same-origin cookies |
| FuelFlow | proxy Supervisor del mismo origin | `/supervisor-api/*` | no | Bearer en cabecera, sin cookies Kiosk |
| BFF/proxies servidor | Backend | rutas permitidas | no (servidor a servidor) | HMAC o Bearer/cookie según ruta |
| Prime browser | Backend | `/api/v1/*` de socio | sí, origin exacto | Bearer; fetch no envía cookie |
| Control browser | proxy Control | `/api/v1/*` | no | cookie HttpOnly same-origin |
| Backend | Redis/Neon/OCR/SMTP | internas | no | tokens/credenciales servidor |
| FuelFlow/Control local | PrintAgent loopback | `/jobs/*` | actualmente solo origin HTTP loopback | `omit` |

`CORS_ORIGINS` futuro: los **origins exactos** de `<fuelflow-staging>`, `<prime-staging>` y `<control-staging>` tras asignar HTTPS; sin rutas, barra final ni comodines. FuelFlow/Control same-origin no necesitan CORS en el navegador, pero incluir sus origins permite llamadas API aprobadas y preflight donde proceda. No incorporar Preview URLs arbitrarias. `setup-app.ts` permite `Authorization`, `Content-Type`, `X-Kiosk-Key`; cabeceras HMAC son servidor a servidor. Revisar proxy para no reenviar cookies/control headers a rutas inesperadas.

## 9. Variables por componente (solo nombres)

| Componente | Secret, servidor | Servidor sin secreto | Público/build-time | Solo local | Solo staging |
|---|---|---|---|---|---|
| Backend | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `JWT_SECRET`, `KIOSK_API_KEY`, `KIOSK_GATEWAY_SECRET`, `KIOSK_REDIS_REST_TOKEN`, `KIOSK_OPERATOR_PASSWORD_HASH`, `SMTP_PASSWORD`, `SMTP_USER` | `PORT`, `NODE_ENV`, `APP_MODE`, `DATABASE_PURPOSE`, `CORS_ORIGINS`, `KIOSK_REDIS_REST_URL`, `KIOSK_SESSION_NAMESPACE`, `KIOSK_SESSION_VERSION`, `KIOSK_STATION_ID`, `KIOSK_OPERATOR_USER`, `PAYMENT_ENV`, `DEMO_WALLET_ENABLED`, `PASSWORD_RESET_DELIVERY`, `PASSWORD_RESET_TTL_MINUTES`, `PASSWORD_RESET_MAX_ATTEMPTS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `PRIMAX_CONTROL_PUBLIC_URL`, `PLATE_RECOGNITION_ENABLED`, `PLATE_RECOGNITION_URL`, `PLATE_CONFIDENCE_THRESHOLD`, `PRIME_DEBT_LIMIT`, `SOLES_PER_POINT`, `SWAGGER_ENABLED`, `SHOW_DEMO_ADMIN_CREDENTIALS` | ninguno | `KIOSK_REDIS_URL`, `DEMO_ADMIN_USER`, `DEMO_ADMIN_PASSWORD`, `DEMO_PASSWORD`, `RESYNC_DEMO_PASSWORD` | `DATABASE_PURPOSE`, `KIOSK_SESSION_NAMESPACE`, `CORS_ORIGINS`, `PRIMAX_CONTROL_PUBLIC_URL` |
| FuelFlow BFF | `KIOSK_GATEWAY_SECRET` | `FUELFLOW_PUBLIC_ORIGIN`, `BACKEND_ORIGIN` | `FUELFLOW_KIOSK_AUTH` (booleano generado) | `FUELFLOW_LOCAL_HTTP` | `FUELFLOW_PUBLIC_ORIGIN`, `BACKEND_ORIGIN` |
| FuelFlow estático | ninguno | ninguno | `FUELFLOW_KIOSK_AUTH` | PrintAgent loopback | origin HTTPS |
| Prime | ninguno | ninguno | `PRIME_API_BASE_URL` | ninguno | `PRIME_API_BASE_URL` |
| Control | ninguno | proxy upstream servidor | `PRIMAX_CONTROL_API_URL` | `PRIMAX_CONTROL_BACKEND_URL` | `PRIMAX_CONTROL_API_URL` |
| OCR | credencial de servicio por implementar si se expone | `PLATE_RECOGNITION_ENABLED`, `PLATE_RECOGNITION_URL` en Backend | ninguno | ninguno | solo si se habilita |
| PrintAgent | configuración/cola local | puerto/origins de config local | ninguno | `config.http.local.json` y `data-v12_1` | ninguno |
| SMTP | `SMTP_USER`, `SMTP_PASSWORD` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` | ninguno | deshabilitado | proveedor pendiente |

`PAYMENT_WEBHOOK_SECRET` y `CULQI_SECRET_KEY` pertenecen a integración comercial y no se configuran para demo académica; ningún secreto, URL con token, hash de contraseña, `DATABASE_URL`, `KIOSK_API_KEY`, `KIOSK_GATEWAY_SECRET`, Redis token ni credencial SMTP puede entrar en `dist/`/`www/` o variables públicas. La URL de Prime y Control sí aparece en JS. No usar `.env` local para staging.

Perfil académico esperado: `APP_MODE=academic`, `NODE_ENV=production` (runtime de optimización), `DATABASE_PURPOSE=academic-demo`, `PAYMENT_ENV=demo`, `DEMO_WALLET_ENABLED=true`, `SHOW_DEMO_ADMIN_CREDENTIALS=false`, `SWAGGER_ENABLED=false`, `PASSWORD_RESET_DELIVERY=smtp` si se prueba correo; secrets distintos de local. `APP_MODE=production` requiere pagos comerciales reales, por lo que no corresponde a esta demo. No deshabilitar HMAC, Redis, CSRF o terminal binding.

## 10. Flujo Git, despliegue futuro y rollback

Rama actual `feature/primax-v12-1-dkos`: no merge, PR ni push en 5A. Para 5B, crear rama `staging/v12.1` revisada desde commit aprobado y usar Preview Deployments protegidos para pruebas. Fijar alias de staging estable y promover deployments específicos manualmente; evitar auto deploy de la rama feature hacia un entorno compartido. Production Deployments comerciales quedan fuera de esta versión académica. Verificar que proyectos Vercel apunten a `V12.1/FrontEnd_1`, `FrontEnd_2`, `FrontEnd_3`; Backend se configura en host Node aparte. No crear proyectos ahora.

Orden futuro, sujeto a aprobación de despliegue: elegir hosts y HTTPS; preparar PostgreSQL y Redis dedicados; migrar y cargar datos académicos autorizados; publicar Backend persistente, BFF, FuelFlow, Control y Prime; probar E2E y seguridad. PlateRecognition forma parte del MVP: alojarlo separado en red privada, sin puerto público, y medir latencia antes de habilitarlo; FuelFlow conserva ingreso manual temporal. Configurar SMTP genérico y verificar correo en una fase posterior.

Rollback: frontends a deployment anterior (incluyendo config de proxy); Backend y BFF a imagen/deployment anterior compatible con esquema; DB a restore point/branch probado, coordinado con pausa de escrituras y reconciliación de pagos/inventario; Redis con namespace/version nuevo para invalidar sesiones o restauración si el proveedor la soporta. No asumir que rollback de código revierte migraciones ni datos. Registrar corte y snapshot conjunto. Evitar reutilizar sesión técnica tras rollback incompatible.

## 11. E2E futuro de staging

- [ ] Supervisor: login humano, estación asignada, apertura turno, habilitación terminal, pairing, revocación y cierre.
- [ ] FuelFlow: sesión, `TerminalOperation`, postpago, prepago DEMO, progreso, transacción, cierre, idempotencia y recibo sin PrintAgent.
- [ ] Negativos: sin terminal, credencial revocada, turno cerrado, pago rechazado, pago ambiguo, reintento y refresh sin doble movimiento.
- [ ] Prime: login/refresh, vehículo, saldo, historial, cambio a prepago y confirmación DEMO.
- [ ] Control: login/cookie/logout, dashboard, inventario, terminales, operaciones, incidentes, clientes, recibos, personal y verificación de correo.
- [ ] Seguridad: HTTPS; cookies `Secure` y host-only; Origin/CORS/credentials; HMAC inválido; CSRF; Redis sin fallback; ausencia de secretos en bundles/logs; Backend no acepta venta nueva por `KIOSK_API_KEY` directo; PrintAgent inaccesible desde Internet.
- [ ] Latencia: body 3 MB, OCR deshabilitado o timeout medido, SMTP y transacciones dentro del presupuesto del host; health Backend/BFF y disponibilidad Redis.

## 12. Cambios necesarios y costo/complejidad

**Registro original de bloqueantes de 5A:** ruta Supervisor same-origin; cookie Control `Secure` y proxy same-origin; impresión sin PrintAgent; decisión OCR; contrato BFF Function. Su estado actualizado está en la sección 5A.1 de abajo. La validación sobre hosting real y proveedores corresponde a 5B, luego del aprovisionamiento.

**RECOMENDADO:** protección CSRF/Origin adicional para POST Control; límites distribuidos de auth no Kiosk; smoke de migraciones en clon vacío; métricas sin PII; límites de conexiones/pool Prisma; proxy restringido por rutas y headers; test de impresión local en navegador/Windows objetivo.

**OPCIONAL:** mover Prime a proxy same-origin para reducir CORS; OCR privado para demo avanzada; impresión física desde HTTPS con diseño local seguro.

| Opción | Simplicidad | Compatibilidad actual | Costo académico | Mantenimiento/riesgo |
|---|---|---|---|---|
| Vercel estáticos + BFF Function + Node Backend | media | alta tras ajustes señalados | bajo/variable según tráfico y host | dos runtimes; frontera FuelFlow clara |
| Todo en Vercel Functions | aparente simplicidad | Backend requiere adaptador/pool y pruebas; OCR no encaja bien | variable por duración/invocaciones | mayor riesgo de cold start/timeout/conexiones |
| Todo en contenedores persistentes | media-baja | alta para Compose | mayor base fija y operación | más servicios, TLS/proxy/rollbacks propios |

Fuentes de compatibilidad de proveedor consultadas sin usar cuentas: [Vercel Node Functions](https://vercel.com/docs/functions/runtimes/node-js), [duración de Functions](https://vercel.com/docs/functions/configuring-functions/duration), [Upstash REST](https://upstash.com/docs/redis/features/restapi), [Upstash comandos](https://upstash.com/docs/redis/overall/compatibility), [Chrome Local Network Access](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access). Validar límites y precios del plan escogido en 5B.

## 13. Fase 5A.1 — límites preparados localmente

| Bloqueante de 5A | Estado local 5A.1 | Implementación / criterio |
|---|---|---|
| `/supervisor-api/*` FuelFlow | **RESUELTO** | `FrontEnd_1/vercel.json` reescribe al Function `api/supervisor-proxy.js`. `server/supervisorProxy.js` acepta solo login, estaciones, turno y habilitación usados por la UI, con método, Origin y JWT Supervisor; no reenvía cookies ni rutas de venta. Pair/rotate permanecen en BFF. |
| Proxy Control same-origin | **RESUELTO** | `FrontEnd_3/vercel.json` y `api/v1/[...path].js` llaman a `server/controlProxy.js`, limitado a `/api/v1/control/*`, GET/POST, Origin exacto, body JSON y cookie `primax_control`; mantiene `Set-Cookie` validada. Build de producción acepta `PRIMAX_CONTROL_API_URL` relativo `/api/v1`. |
| Cookie Control `Secure` académico | **RESUELTO** | Backend emite y borra `primax_control` con `Secure` cuando `APP_MODE` no es `local`, conservando HttpOnly, Strict, Path y ocho horas. Test de modos local/academic/production; proxy HTTPS rechaza cookie upstream insegura. |
| BFF Node Function | **RESUELTO para preparación local** | `api/[...path].js` reutiliza `createGateway()`; `server/local.js` es el único listener. Tests de request con body preparseado, Origin, query, HMAC, timeout mediante `AbortSignal`, status, dos `Set-Cookie`, prefijo `__Host-` y política de ruta. No hay socket/archivo/estado mutable de proceso en el BFF. La integración en un deployment HTTPS es validación de 5B. |
| OCR primer staging | **RESUELTO por política OFF** | Configurar `PLATE_RECOGNITION_ENABLED=false` en Backend académico inicial. `RecognitionService` devuelve 503 antes de `fetch` OCR; FuelFlow comunica ingreso manual. No configurar `PLATE_RECOGNITION_URL` pública ni desplegar Flask/Tesseract. OCR solo se habilitaría luego de red privada/autenticación y prueba de tiempos. |

Variables de Function **solo servidor**: FuelFlow `BACKEND_ORIGIN`, `FUELFLOW_PUBLIC_ORIGIN`, `KIOSK_GATEWAY_SECRET`; Control `BACKEND_ORIGIN`, `PRIMAX_CONTROL_PUBLIC_URL`. No se añadieron nombres de variables. En FrontEnd_3, `PRIMAX_CONTROL_API_URL` es pública y debe ser `/api/v1`; Prime conserva `PRIME_API_BASE_URL` HTTPS explícita y Bearer. Backend académico usa `CORS_ORIGINS` con los origins HTTPS exactos definidos en 5B. Nunca `*` con credentials. Preview URL variable sin alias estable exigiría ajustar origins y cookies por deployment; fijar alias antes de pruebas compartidas.

En 5B verificar routing Vercel real, límites del plan (body/duración), `Set-Cookie`/logout bajo HTTPS, Redis/DB dedicados y E2E. Esta verificación depende de los recursos que 5A.1 prohíbe crear; no es un cambio de código pendiente. Ninguna Function de Control/Supervisor reemplaza la ruta de ventas BFF HMAC.
