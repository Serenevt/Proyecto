# Primax / FuelFlow V10

```sh
git clone https://github.com/Serenevt/Proyecto.git
cd Proyecto/V10
docker compose up -d
docker compose ps
```

Este inicio corresponde a la versión V10 cuando está incorporada al repositorio; esta entrega local no hace commit ni push. Solo necesitas Git y Docker (Windows: Docker Desktop con contenedores Linux; Debian 13: Docker Engine y plugin Compose). No necesitas Node, npm, Python, pip, Prisma CLI ni PostgreSQL en el host. La primera construcción descarga dependencias y puede tardar varios minutos.

- FuelFlow: http://localhost:10081
- Prime: http://localhost:10082
- Backend: http://localhost:10000/api/v1/health
- Swagger: http://localhost:10000/api/docs
- Correo local Mailpit: http://localhost:10025 (sin entrega a buzones externos)

Puertos exclusivos de V10: no interfieren con V9 en 9081/9082 ni con Backend en 3000. El proyecto Compose se llama `primax-v10`, con redes y volumen PostgreSQL propios. PostgreSQL y OCR no publican puertos al host.

## Demo local y producción

No hace falta `.env`: Compose tiene defaults explícitos exclusivamente DEMO/DEV. Cuenta demo: `demo@primaxprime.pe` / `Prime123`, Membership `PRIME-0001`, Vehicle `ABC-123`. El seed no inventa saldo ni puntos. Puedes crear una cuenta desde **Crear cuenta**.

`.env.example` documenta variables opcionales. Si decides copiarlo a `.env`, sustituye sus valores `REPLACE_` antes de iniciar. `.env` permanece ignorado. Para producción son obligatorios secretos propios para JWT, terminal y PostgreSQL, retirar o proteger la cuenta sembrada, HTTPS, CORS restringido, backup y control de acceso. Usa `APP_MODE=production` y `SHOW_DEMO_ADMIN_CREDENTIALS=false`. Admin usa `ADMIN_USER` y `ADMIN_PASSWORD_HASH` separados. No publiques los defaults locales. Los secretos del servidor se inyectan en Backend/Nginx, nunca en JavaScript ni APK.

## Nombre, Admin, alertas y correo

FuelFlow identifica al cliente como **placa · nombre del usuario** obtenido de Backend/PostgreSQL; sin Membership muestra **No afiliado**. El código Membership continúa en las operaciones internas. Prime no etiqueta cuentas registradas como Demo ni incrusta sus credenciales en los builds.

El Panel de Seguridad autentica en Backend y consulta datos reales. En Compose local, `APP_MODE=local` y `SHOW_DEMO_ADMIN_CREDENTIALS=true` muestran la cuenta separada `admin-demo` / `LocalAdminV10!`. Fuera de esa configuración no se devuelve la ayuda. No se muestran secretos reales del servidor.

Las alertas persistentes registran inconsistencias de placa en postpago y saldos pendientes reales. Tienen clave única por evento, estado OPEN/RESOLVED y fecha/responsable de revisión. Revisarlas no paga deudas. El dashboard vacío muestra **No hay alertas pendientes**. [Flujos y API Admin](docs/ADMIN-ALERTS.md).

La recuperación envía códigos por SMTP con Nodemailer. Docker inicia Mailpit automáticamente para pruebas locales sin credenciales externas. SMTP externo se activa con `PASSWORD_RESET_DELIVERY=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM`. Caducidad e intentos: `PASSWORD_RESET_TTL_MINUTES` y `PASSWORD_RESET_MAX_ATTEMPTS`. [Instrucciones de recuperación, Mailpit y SMTP externo](docs/SMTP-RECOVERY.md).

- [Acceso PostgreSQL mediante Docker/psql y DBeaver](docs/DATABASE-ACCESS.md).
- [ERD real Prisma, entidades y cardinalidades](docs/DATABASE-ERD.md).
- [ERD editable draw.io](docs/database-erd.drawio).
- [Validación de esta tanda](docs/VALIDATION-V10-ADMIN-MAIL.md).

## Arquitectura y registro

FuelFlow PC → Nginx → Backend NestJS → Prisma → PostgreSQL → Backend → Prime web/APK.

Ambos canales usan la misma API y base. APK nunca conecta directamente a PostgreSQL. localStorage solo conserva sesión, preferencias y recuperación; no decide saldos ni puntos.

`POST /api/v1/auth/register`: nombre, correo y contraseña; DNI, RUC y razón social opcionales. Validación de formato, correo único y datos fiscales; bcrypt; respuesta sin passwordHash. Prisma crea User y Membership ACTIVE con número único en una escritura atómica. Se conserva login posterior. Vehicle es opcional y puede vincularse desde Membresía después; Backend obtiene la Membership del usuario autenticado, sin aceptar una Membership arbitraria.

## Puntos y dinero

Fuente de verdad: `Backend/src/rewards/points-policy.service.ts`. Configuración única `SOLES_PER_POINT=9`: puntos enteros = floor(importe elegible / 9), usando Decimal. La UI solo informa y muestra respuestas Backend.

| Consumo S/ | Puntos |
|---:|---:|
| 0.00 | 0 |
| 8.99 | 0 |
| 9.00 | 1 |
| 17.99 | 1 |
| 18.00 | 2 |
| 89.99 | 9 |
| 90.00 | 10 |
| 100.00 | 11 |

Cero devuelve cero en la política; una compra con importe cero sigue siendo inválida financieramente. Elegibilidad heredada: Membership ACTIVE y usuario activo al registrar un consumo autorizado. Prepago requiere Payment persistido CAPTURED; PENDING/REJECTED no autorizan. Un consumo postpago autorizado con deuda puede generar puntos al registrarse, aun con PAYMENT_PENDING/PARTIAL. Pagar posteriormente esa deuda no vuelve a generar puntos. Recargar saldo no genera puntos. Transaction y RewardMovement se escriben atómicamente; operationId conserva idempotencia y los reintentos no duplican movimientos.

Los movimientos históricos no se recalculan. Migración aditiva: `Transaction.solesPerPoint` nullable guarda el divisor exacto para nuevas compras; históricos quedan NULL. `pointsRate` conserva compatibilidad como snapshot legado (recíproco aproximado), no se usa para calcular puntos. El precio de combustible se conserva como snapshot de autorización; amount/gallons se validan contra él. Cambios de catálogo no alteran una compra iniciada. Errores 401/403/404/503/timeout y estado INTERVENTION_REQUIRED conservan sus reglas de recuperación.

## Barra Prime

Solo la barra inferior usa naranja Primax de la paleta existente (`--orange-strong`); texto e icono activos blancos con indicador blanco. Variables `--nav-background`, `--nav-active`, `--nav-inactive`. Se conserva el fondo blanco del contenido, navegación, responsive y `env(safe-area-inset-bottom)` de Android. Validación en 360×800, 390×844 y 412×915.

## Docker, migraciones y seed

Cadena automática: PostgreSQL healthy → migrate (`prisma migrate deploy`) terminado → seed idempotente terminado → Backend healthy. OCR también debe estar healthy antes de Backend. Nginx sirve ambos builds. Los cinco servicios principales y Mailpit tienen healthcheck. migrate y seed salen con código 0: no son daemons y no deben quedar running.

Volumen nuevo: esquema y demo se crean automáticamente. Volumen existente: solo migraciones pendientes; seed usa upsert con actualizaciones vacías para conservar datos. Repetir `docker compose up -d` no duplica datos. Nunca uses migrate reset ni down -v para actualizar. `docker compose restart` conserva datos; para aplicar código nuevo usa `docker compose up -d --build`.

Node **22.21.1** fijado por digest; npm **10.9.4** verificado en Dockerfiles con `npm ci --no-audit --no-fund`. Se conservan los package-lock. FrontEnd_1 no requiere dependencias npm. Las imágenes construyen todos los assets. OCR instala OpenCV headless, Tesseract y Python dentro de su imagen.

Debian 13: **PREPARADO/VALIDADO ESTRUCTURALMENTE PARA DEBIAN 13**. Contenedores Linux construidos en Docker Desktop; no equivale a prueba física en Debian. Sin rutas Windows ni dependencia obligatoria de host.docker.internal en el runtime.

## Android y LAN

Se conserva Capacitor y proyecto Android. Compilar APK sí requiere el entorno Android de desarrollo con JDK 21 (Gradle 8.14.3; no JDK 25) (esto no es necesario para ejecutar Docker). Configura `PRIME_API_BASE_URL=http://IP_DEL_PC:10000/api/v1`, nunca localhost. En PowerShell:

```powershell
$env:PRIME_API_BASE_URL='http://IP_DEL_PC:10000/api/v1'
cd FrontEnd_2
npm.cmd ci
npm.cmd run android:debug
```

Linux: configura esa variable, ejecuta `npm ci`, `npm run android:sync` y `sh android/gradlew -p android assembleDebug`. APK: `FrontEnd_2/android/app/build/outputs/apk/debug/app-debug.apk`, ignorado en Git; solo debug, sin firma release. Recompila con la IP real de tu PC antes de instalar. No se afirma instalación física.

```sh
docker compose -f compose.yaml -f compose.lan.yaml up -d
```

Compose LAN requiere plugin 2.24.4+ para `!override`. PC y teléfono en la misma red; permite 10000 en el firewall para la API del APK. FuelFlow usa 10081, Prime web 10082. Agrega el origen web LAN a `CORS_ORIGINS` si accedes directamente a la API desde navegador. PostgreSQL/OCR siguen sin puertos publicados. Android usa el mismo Backend y PostgreSQL. El build permite HTTP únicamente para demo LAN; HTTPS para Internet.

## Internet futuro

No se despliega. Arquitectura preparada para frontend web público + Backend HTTPS público + APK con URL configurable. Backend/PostgreSQL/OCR pueden alojarse en Railway, Render o VPS; Vercel corresponde al frontend cuando aplique, no sustituye automáticamente los servicios persistentes. Configura dominio, TLS, secretos y CORS antes de exponer servicios.

## Variables opcionales

`FRONTEND1_PORT=10081`, `FRONTEND2_PORT=10082`, `PORT=10000` (puerto host; Backend interno 3000), `POSTGRES_DB=primax_v10`, `POSTGRES_USER=primax`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `KIOSK_SECRET`, `DEMO_PASSWORD`, `FUELFLOW_DEMO`, `SOLES_PER_POINT=9`, `PRIME_DEBT_LIMIT=200`, `PLATE_CONFIDENCE_THRESHOLD=0.75`, `CORS_ORIGINS`. LAN: `LAN_BACKEND_PORT=10000`, `LAN_BACKEND_BIND`. Android: `PRIME_API_BASE_URL` al construir. Admin: APP_MODE, SHOW_DEMO_ADMIN_CREDENTIALS, DEMO_ADMIN_USER, DEMO_ADMIN_PASSWORD, ADMIN_USER y ADMIN_PASSWORD_HASH. Correo: variables SMTP, PASSWORD_RESET_DELIVERY, PASSWORD_RESET_TTL_MINUTES, PASSWORD_RESET_MAX_ATTEMPTS y MAILPIT_PORT. Acceso gráfico opcional: POSTGRES_LOCAL_PORT. No cambies la regla de puntos oficial sin acuerdo del equipo.

## Pruebas y diagnóstico

```sh
docker compose --profile test run --rm tests
docker compose exec -T plate-recognition python -c "import cv2; print(cv2.__version__)"
docker compose exec -T plate-recognition python -m unittest -v
```

Pruebas de navegador y unitarias frontend para desarrolladores: `npm test` en cada frontend; `npm run build` y `npm run test:mobile` en FrontEnd_2. Integración real: `node tools/run-integration.cjs --docker`; usa Docker para consultar PostgreSQL sin publicarlo. Las pruebas E2E preservan esquemas aislados. Ver evidencia final en `docs/VALIDATION-V10.md`.

Si un puerto está ocupado, configura los puertos opcionales; no detengas V9. Si Backend espera, revisa `docker compose logs migrate seed backend` y `docker compose ps -a`. Un secreto REPLACE_ indica `.env.example` copiado sin configurar. Si cambia DEMO_PASSWORD sobre una base existente, seed avisa y conserva el hash; el mecanismo de resincronización explícita está en el runbook histórico. Si falla npm ci, verifica Docker con red y recursos suficientes y conserva el lockfile; no lo sustituyas por npm install. Si OCR no responde, revisa sus logs y healthcheck. Para APK que no conecta, revisa IP real, misma LAN, firewall y URL de build.

La documentación heredada está en `docs/V9-LOCAL-RUNBOOK.md` y `docs/audit-v9/`; describe evidencia histórica V9, no resultados nuevos de V10.
