# Primax / FuelFlow V9

V9 conserva la base estable V8 y agrega saldo pendiente auditable, perfil fiscal, snapshots de comprobantes y reconocimiento de placa. Todo el código nuevo está en esta carpeta. V8 permanece intacta; `node tools/verify-v8.cjs` contrasta los 226 archivos originales con SHA-256.

## Arquitectura

```text
FuelFlow (FrontEnd_1, navegador + cámara) ── Nginx ──┐
Primax Prime (FrontEnd_2, web) ── Nginx ────────────┤
Primax Prime (APK Capacitor) ── HTTP(S) ────────────┤
                                                NestJS / JWT / Swagger
                                                  ├─ Prisma → PostgreSQL
                                                  └─ HTTP interno → PlateRecognition
                                                                    Python / OpenCV / Tesseract
```

Se conservan membresías, vehículos, puntos, rewards, beneficios, canjes, wallet, recargas, pagos DEMO, autorizaciones de combustible, ledger y operación idempotente. Android nunca se conecta a PostgreSQL. El proyecto Compose es `primax-v9`; su volumen es independiente de otras versiones. Copiar el código no copia una base de datos existente.

## Inicio local: Windows o Linux

Requisitos: Docker Desktop con contenedores Linux en Windows, o Docker Engine + Compose plugin en Linux. Compose 2.24.4 o posterior para el override LAN.

1. Desde `V9`, copia `.env.example` a `.env` y reemplaza las contraseñas y claves de ejemplo. No publiques `.env`.
2. Usa claves JWT y KIOSK aleatorias de al menos 32 caracteres. Para KIOSK usa letras, números, guion y guion bajo. El secreto KIOSK solo se inyecta en Nginx y Backend.
3. Ejecuta:

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

`migrate` aplica migraciones pendientes y `seed` crea los datos faltantes. Son tareas de una ejecución: `Exited (0)` es correcto. Los cinco servicios permanentes deben estar `healthy`.

| Servicio | Puerto predeterminado | Esta validación, sin colisionar con V6 |
|---|---|---|
| FuelFlow | http://localhost:8081 | http://localhost:9081 |
| Primax Prime | http://localhost:8082 | http://localhost:9082 |
| API | http://localhost:3000/api/v1 | http://localhost:3100/api/v1 |
| Swagger | http://localhost:3000/api/docs | http://localhost:3100/api/docs |
| PostgreSQL / DBeaver | 127.0.0.1:5433 | 127.0.0.1:5434 |
| OCR | interno, 8000 | sin puerto host |

`.env` local conserva los puertos alternativos de esta sesión. `.env.example` conserva los preferidos. Para DBeaver: PostgreSQL, host `127.0.0.1`, puerto `POSTGRES_PORT`, base/usuario/contraseña de tu `.env`. No uses el hostname Docker `postgres` desde DBeaver.

## Saldo disponible, deuda y recargas

Toda aplicación de dinero ocurre en Backend/PostgreSQL, con `Decimal`, bloqueo de membresía, transacciones serializables, reintentos por concurrencia y restricciones SQL. El navegador muestra resultados; no calcula ni persiste un saldo autorizado.

- `Membership.balance` es saldo disponible y nunca se vuelve negativo.
- Una autorización reserva primero saldo real. Con consentimiento explícito `allowDebt`, puede reservar capacidad de crédito por la diferencia.
- La capacidad cuenta deuda existente **y crédito comprometido en autorizaciones abiertas**. La suma más el crédito nuevo no puede superar `PRIME_DEBT_LIMIT` (200 soles por defecto; 0 desactiva el crédito).
- Al confirmar el consumo se crea `MembershipDebt` por el importe sin cubrir. Cada deuda referencia membresía y transacción, con `amountOriginal`, `amountPaid`, `amountPending`, estado y fechas. Se cumple `original = paid + pending`.
- La deuda cambia de `PENDING` a `PARTIAL` y finalmente `SETTLED`. La compra permanece `PAYMENT_PENDING` hasta liquidarse. `Payment` es `PENDING` si no hubo aporte de saldo, `PARTIAL` si hubo pago parcial y `CAPTURED` al completar.
- Una recarga registra primero un movimiento `RECHARGE`. Después aplica el dinero a las deudas por `createdAt ASC, id ASC` (FIFO), registrando un movimiento negativo `DEBT_SETTLEMENT` por cada aplicación, ligado a deuda, compra y operación de recarga. Solo el remanente queda disponible.
- Los puntos se otorgan una sola vez al confirmar el consumo, incluso si queda deuda. La recarga/liquidación no vuelve a otorgarlos.
- Las reservas con combustible ya despachado no se liberan como si no hubiera consumo: deben liquidarse. Se conservan los mecanismos anteriores de recuperación y seguimiento.

Ejemplo ejecutado con PostgreSQL y las interfaces:

| Paso | Disponible | Pendiente | Compra / pago |
|---|---:|---:|---|
| Inicio | S/ 5.00 | S/ 0.00 | — |
| Consumo S/ 12.60 | S/ 0.00 | S/ 7.60 | PAYMENT_PENDING / PARTIAL |
| Recarga S/ 20.00 | S/ 12.40 | S/ 0.00 | PAID / CAPTURED |

FuelFlow explica “Tu saldo Primax Prime no es suficiente para cubrir el consumo”, muestra disponible/importe/pendiente y ofrece recargar, otro medio y registrar pendiente si Backend lo permite. Al exceder el límite muestra “Has alcanzado el límite de saldo pendiente”. La recarga abre Prime con el puerto configurado. Prime muestra la tarjeta de deuda, el botón de recarga y el estado de cada consumo; al regularizarlo conserva la misma transacción.

`operationId` protege compras, reservas y recargas. Reutilizarlo con otro importe produce conflicto. El cliente conserva el identificador ante una respuesta perdida y bloquea envíos simultáneos. Los canjes y demás flujos previos se mantienen.

## Perfil, boleta y factura

`PATCH /api/v1/memberships/me/profile` requiere JWT y solo modifica la membresía del usuario autenticado. `GET /api/v1/memberships/me` devuelve nombre/correo y los datos persistidos. Nombre y correo se consultan; los campos fiscales se editan. El alias local previo de la interfaz no cambia la identidad del usuario en Backend.

- DNI: opcional, exactamente 8 dígitos.
- RUC: opcional, exactamente 11 dígitos. La demo valida formato, no consulta SUNAT ni acredita existencia fiscal.
- Razón social: opcional, 1–160 caracteres, saneamiento de etiquetas y controles; `null` permite borrar el valor.

Con la membresía identificada, FuelFlow autocompleta DNI para boleta y RUC/razón social para factura. Si faltan, admite ingreso manual y ofrece guardarlos con consentimiento mediante la compra autenticada como terminal. Los campos `Transaction.receiptDni`, `receiptRuc`, `receiptBusinessName` y `receiptType` son snapshots: editar el perfil después no cambia comprobantes anteriores. No se usa localStorage como base de datos fiscal.

Las migraciones nuevas son:

- `202610120001_v9_debt_profile`: estados, perfil, snapshots, deuda, relación de ledger y restricciones.
- `202610120002_v9_credit_constraints`: adapta restricciones de autorización y ledger para crédito y liquidación.

Se preservan modelos y migraciones anteriores. Las restricciones incompatibles se reemplazan transaccionalmente; no se eliminan tablas ni datos. No ejecutar `prisma migrate reset` ni `docker compose down -v`.

## Reconocimiento de placa

La cámara se abre **en el navegador** con `navigator.mediaDevices.getUserMedia()`. Se captura una imagen, se envía a NestJS por el proxy de FuelFlow y Nest consulta `http://plate-recognition:8000/recognize`. Docker no necesita acceso al dispositivo webcam.

El servicio usa Python 3.12.11, OpenCV 4.12.0.88 y Tesseract 5 con modelo LSTM preentrenado `eng`. Tesseract es una alternativa ligera a PaddleOCR/EasyOCR, suficiente para esta demo de una placa impresa frontal; no se entrenó un modelo ni se afirma reconocimiento industrial. Se procesan escala de grises y binarización, con timeout y límites de imagen. Las imágenes temporales se eliminan al terminar; no hay archivo de fotografías.

Entradas `ABC123`, `abc123`, `ABC 123` y `ABC-123` se normalizan a `ABC-123`. La demo acepta tres caracteres alfanuméricos y tres dígitos. La respuesta contiene `plate` y `confidence`; Nest añade umbral, reconocimiento y vehículo/membresía cuando procede. Una placa legible sin vehículo registrado no identifica una membresía.

`PLATE_CONFIDENCE_THRESHOLD=0.75` controla la aceptación. Bajo el umbral, imagen vacía o servicio indisponible: mensaje claro, reintento o ingreso/verificación manual. La confianza OCR no es una garantía ni una probabilidad calibrada. La interfaz permite cancelar y detiene los tracks de cámara.

Fixtures no sensibles en `PlateRecognition/fixtures/`: placa ABC-123, imagen vacía y placa desenfocada. La opción de archivo usa el mismo endpoint real que la captura. Para demostrarlo: imprimir `ABC-123`, buena iluminación, placa frontal, evitar reflejos y hacer que ocupe una parte razonable del encuadre. Las pruebas usan fixtures y un stream sintético de canvas; queda por probar la webcam física.

**Cámara en LAN:** los navegadores normalmente exigen HTTPS o localhost para `getUserMedia`. Abrir `http://IP_DEL_HOST:8081` sirve la aplicación, pero puede bloquear la cámara. En ese caso usa archivo/manual o configura HTTPS con un certificado confiable para el dispositivo. No desactives protecciones del navegador.

## Cuenta demo y reproducción

El seed crea Diego, `PRIME-0001`, `ABC-123`, correo `demo@primaxprime.pe` y contraseña `DEMO_PASSWORD` de tu `.env`. DNI `12345678`, RUC `20123456789`, razón social `Transportes Demo Ficticios SAC`: todos son **datos ficticios de demostración**. El seed es idempotente y no sobrescribe perfiles o saldos reales al iniciar.

En una cuenta demo nueva y sin movimientos:

```sh
docker compose exec -T backend node scripts/v9-demo.cjs
```

Este comando registra una carga inicial de S/ 5.00 y completa campos demo faltantes. No resetea una cuenta ya utilizada. Luego ejecuta `tools/v9-flow.spec.cjs` o sigue el flujo de S/12.60 y recarga S/20.00. El perfil demo utilizado por la prueba cambia a RUC `20987654321` / `Empresa Demo Actualizada` para probar la inmutabilidad del snapshot.

La base de esta sesión conserva las operaciones ejecutadas y el saldo S/12.40. Para repetir desde cero usa otro proyecto/base/volumen de demo **nuevo**, nunca borres el existente. Las pruebas Backend crean esquemas independientes `e2e_*` y los preservan. La evidencia de la prueba visual se guarda en `tools/evidence/`, fuera de los resultados que Playwright limpia automáticamente; si existe, una repetición verifica la compra ya liquidada sin volver a gastar.

## LAN y datos compartidos

```sh
docker compose -f compose.yaml -f compose.lan.yaml config --quiet
docker compose -f compose.yaml -f compose.lan.yaml up -d --build
```

Una sola máquina ejecuta el stack. Los demás dispositivos abren `http://IP_DEL_HOST:8081` y `:8082` (o los puertos configurados). El override publica únicamente frontends y API en `0.0.0.0`. PostgreSQL sigue en `127.0.0.1`; OCR no tiene puerto host. Limita el firewall a tu red privada. No se modificó el firewall automáticamente.

Las aplicaciones web usan API relativa `/api/v1` a través de Nginx, así todos ven la **misma base del servidor**. Dos compañeros que ejecutan stacks locales separados tienen dos bases distintas, aunque usen el mismo código.

Para volver a modo local: `docker compose up -d`. `node tools/check-lan.cjs` valida bindings/health/HTTP del host y restaura el modo local conservando volúmenes. No sustituye una prueba desde un segundo dispositivo ni verifica reglas del router/firewall externo.

## Android / Capacitor

Se conserva el proyecto Android y su identidad. La APK incluye la misma interfaz y usa Backend para saldo, deuda, perfil, historial, puntos, beneficios, rewards y recargas.

Web Docker: API relativa `/api/v1`. Android: `PRIME_API_BASE_URL` absoluta y accesible desde el teléfono/emulador. `localhost` en un teléfono no apunta al PC.

PowerShell, desde `FrontEnd_2`, con Android SDK y JDK 21:

```powershell
$env:PRIME_API_BASE_URL='http://10.0.2.2:3100/api/v1'
npm.cmd ci --no-audit --no-fund
npm.cmd run android:sync
.\android\gradlew.bat -p android assembleDebug --console=plain
```

En un teléfono LAN usa `http://IP_DEL_HOST:3000/api/v1` (o 3100 aquí) con el override LAN y firewall adecuado. Incluye los orígenes Capacitor `https://localhost,http://localhost` en `CORS_ORIGINS`. Para Internet usa HTTPS. El sync configura mixed content únicamente si la URL es HTTP y el manifest de debug permite tráfico claro para demo. No hay conexión APK→PostgreSQL.

Linux: exporta la variable, ejecuta `npm run android:sync` y `bash android/gradlew -p android assembleDebug --console=plain`. Evita el script heredado `android:debug` basado en `.bat` en Linux. Se compiló APK debug con JDK 21 / Gradle 8.14.3 / AGP 8.13.0, sin release signing. No se probó instalación en dispositivo físico.

## Windows, Debian 13 y npm

Los Dockerfiles usan Node **22.21.1**, fijado también por digest, y comprueban npm **10.9.4** antes de `npm ci --no-audit --no-fund`. Los lockfiles se conservan. Los contenedores usan bases Linux Bookworm y rutas relativas; no requieren rutas `C:\\`, ni `host.docker.internal` para comunicarse entre servicios. El host Windows de validación tenía Node 24.19 / npm 11.17; los builds Docker usan las versiones fijadas.

El antecedente `Exit handler never called!` está documentado en incidencias de npm y no identifica por sí solo un fallo exclusivo de Debian 13. No se reprodujo con la combinación Docker fijada. No se reemplazó `npm ci` por `npm install` ni se borraron lockfiles. Referencias: [npm/cli #7666](https://github.com/npm/cli/issues/7666), [npm/cli #8974](https://github.com/npm/cli/issues/8974).

En Debian 13, con Engine y plugin instalados según la documentación oficial:

```sh
cd V9
cp .env.example .env
# Editar .env con secretos locales y puertos disponibles.
docker version
docker compose version
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
curl -f http://localhost:8081/
curl -f http://localhost:8082/
curl -f http://localhost:3000/api/v1/health
```

La ejecución física en Debian 13 queda pendiente. Se validaron las imágenes Linux desde Docker Desktop en Windows, Compose local/LAN, rutas relativas y scripts shell LF.

## Variables

| Variable | Uso |
|---|---|
| POSTGRES_DB / USER / PASSWORD | Base y credenciales locales |
| POSTGRES_PORT | Puerto admin loopback, 5433 |
| PORT | Puerto host del Backend, 3000; interno siempre 3000 |
| FRONTEND1_PORT / FRONTEND2_PORT | Puertos web 8081 / 8082 |
| JWT_SECRET | Firma de sesiones, solo Backend |
| KIOSK_SECRET | Autenticación de terminal, solo Nginx/Backend; alias KIOSK_API_KEY compatible |
| PRIME_DEBT_LIMIT | Máxima deuda más crédito comprometido, 200 |
| PLATE_CONFIDENCE_THRESHOLD | Umbral OCR entre 0 y 1, 0.75 |
| PLATE_RECOGNITION_URL | URL OCR para Backend; Compose usa hostname interno |
| POINTS_PER_SOL | Política de puntos existente |
| CORS_ORIGINS | Lista de orígenes autorizados, incluyendo Capacitor al usar APK |
| DEMO_PASSWORD | Credencial exclusiva de demo |
| FUELFLOW_DEMO | 1 muestra acceso demo en web; 0 omite credenciales demo del bundle |
| PRIME_API_BASE_URL | URL absoluta para build Android; web usa relativa |

Los pagos y recargas son DEMO/sandbox. No se usan QR personales, bancos ni dinero real. `PaymentsService` conserva la separación de autorización de pagos; una integración futura debe validar proveedor/webhooks en Backend y mantener idempotencia y ledger.

## Pruebas y verificación

```sh
# Backend: 80 unit + 80 E2E, lint y build
docker compose --profile test build tests
docker compose --profile test run --rm --no-deps tests
# Frontends (npm.cmd en PowerShell si npm.ps1 está bloqueado)
cd FrontEnd_1
npm run build
npm test
cd ../FrontEnd_2
npm run build
npm test
npm run test:mobile
cd ..
# OCR real y sintaxis
docker compose exec -T plate-recognition python -m unittest -v test_ocr
# UI V9 contra stack activo
node FrontEnd_2/node_modules/@playwright/test/cli.js test -c tools/playwright.v9.cjs
# Integración heredada; PowerShell: $env:V6_DOCKER_TEST='1'
V6_DOCKER_TEST=1 node FrontEnd_2/node_modules/@playwright/test/cli.js test -c tools/playwright.integration.cjs
node tools/audit-docker.cjs
node tools/check-standalone.cjs
node tools/check-lan.cjs
node tools/verify-v8.cjs
```

Los comandos de navegador requieren dependencias `npm ci` en FrontEnd_2, Chrome instalado y permisos de ejecución. La integración heredada también usa Prisma de Backend (`npm ci` y `npm run prisma:generate`). El nombre de la variable `V6_DOCKER_TEST` se mantiene por compatibilidad del runner, pero prueba V9 y sus puertos configurados. Las pruebas móviles usan API simulada para estados y tamaños; la integración y el flujo financiero consultan Nest/PostgreSQL reales. Consulta [VALIDATION.md](VALIDATION.md) para resultados y límites.

## Seguridad, Internet futuro y troubleshooting

- JWT y KIOSK no se publican en HTML/JS. Se auditan bundles, imágenes, logs y archivos versionables. Nginx FuelFlow limita rutas e inyecta la clave de terminal; Prime usa JWT. La demo kiosk debe ejecutarse en una red controlada: el acceso a la interfaz del terminal permite sus operaciones autorizadas.
- PostgreSQL solo se publica en loopback para administración. OCR solo es accesible en la red Docker. No se muestran secretos en los reportes ni se versiona `.env`.
- Internet futuro: clientes→HTTPS→servidor/VPS→Docker→Backend→PostgreSQL. Hace falta host público, dominio/IP, HTTPS, firewall, secretos seguros y autenticación/control de terminales apropiado. No se desplegó cloud ni se contrataron servicios.
- Puerto ocupado: cambia FRONTEND1_PORT, FRONTEND2_PORT, PORT y POSTGRES_PORT; actualiza CORS. No detengas otras versiones para liberar puertos.
- `npm ci` falla: comprueba salida completa/red/proxy/espacio y versiones fijadas; reconstruye el stage afectado. No borres package-lock ni cambies a install como solución.
- Backend no inicia: revisa `docker compose logs backend migrate seed`, secretos y migraciones. No resetees la base.
- OCR no disponible/baja confianza: revisa `docker compose logs plate-recognition`, iluminación, tamaño y umbral; usa ingreso manual. La primera construcción descarga paquetes/modelo preentrenado.
- Cámara denegada: concede permiso y usa localhost/HTTPS. En HTTP LAN usa fixture/manual.
- Android no conecta: verifica URL desde el dispositivo, override LAN, CORS y firewall. Para emulador Android estándar el host se alcanza por 10.0.2.2.
- Gradle falla con Java muy reciente: usa JDK 21 y SDK Android instalado; no se necesita firma release para assembleDebug.
- Varios intentos de login pueden activar rate limiting: espera su ventana; no desactives el control para uso normal.
- Ver deuda histórica: no borres la compra; consulta sus estados y los movimientos DEBT_SETTLEMENT relacionados.
