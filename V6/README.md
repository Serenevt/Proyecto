# V6: FuelFlow + Primax Prime + API compartida

Las dos aplicaciones conservan sus pantallas y despliegues independientes.
Ambas usan Backend NestJS → Prisma → PostgreSQL. Los pagos siguen siendo DEMO:
se registra un pago confirmado por el simulador; no se cobra a una pasarela bancaria.

## Arquitectura y seguridad

```text
FrontEnd_1
    ↓
Backend
    ↓
PostgreSQL
    ↑
Backend
    ↑
FrontEnd_2
```

Los navegadores acceden a Nginx, que sirve cada SPA y reenvía `/api/` al
servicio `backend:3000`. NestJS usa Prisma y `postgres:5432`. Los frontends
pertenecen solo a la red `app`; PostgreSQL solo a `data`; backend une ambas.
La excepción administrativa es `127.0.0.1:5433` para DBeaver y pruebas locales.
Son redes bridge estándar de Docker, sin IP fija ni `host.docker.internal`.

- FrontEnd_1 → su Nginx → API. El servidor añade `x-kiosk-key` desde
  `KIOSK_SECRET`, mapeada a `KIOSK_API_KEY` dentro de los servicios.
  El `.env` existente con `KIOSK_API_KEY` sigue funcionando sin cambios.
- Solo se permiten GET de health, combustibles, estaciones y vehículos, y POST
  de transacciones. Se rechazan solicitudes de navegador de otro origen.
- La credencial se sustituye al arrancar Nginx en un archivo de configuración
  fuera de la raíz pública. No se copia a JS, HTML, build ni respuesta HTTP.
  El valor se valida antes de la sustitución. No ejecutar `nginx -T` ni publicar
  `docker compose config` sin `--quiet`: pueden mostrar secretos.
- El puerto del terminal se publica únicamente en 127.0.0.1:8081. El proxy
  representa una terminal de confianza, no un endpoint público para Internet.
- FrontEnd_2 → su Nginx → API con JWT. Ese proxy elimina `x-kiosk-key`.
- Los upstream se resuelven al recibir solicitudes; Prime puede arrancar solo,
  aunque sin backend el login real mostrará un error de conexión.
- Ningún frontend se conecta directamente a PostgreSQL.

## Flujos

FuelFlow carga estaciones/combustibles y sus IDs/precios reales, valida la placa
por API y confirma la compra después del despacho (y cobro demo en POSTPAGO).
El UUID y el cuerpo final se guardan antes de enviar. Reintentos, doble clic y
recarga conservan la operación. Un error deja la compra pendiente y permite
reintentar. Solo `Finalizar` después de confirmarla permite una compra nueva.
El ticket muestra el importe, membresía y puntos devueltos por el backend.
POSTPAGO valida la membresía por API y usa PEAJE. Cámara, surtidor y cobro
continúan simulados; el DNI se solicita al usuario, nunca se inventa.

Prime inicia sesión mediante HTTP, guarda JWT/expiración/usuario (no contraseña)
y elimina la sesión al salir, expirar o recibir 401. Los datos remotos se mantienen
en memoria y se borran al cerrar sesión. Los servicios HTTP están separados de UI.
Carga usuario, membresía, vehículos, consumos, puntos, beneficios y canjes.
Se actualiza cada 10 segundos mientras está visible y al recuperar el foco.
No se reemplaza un formulario que se está editando. Las listas recorren páginas
de 100 registros, evitando truncar silenciosamente el historial.
Los canjes usan un UUID estable en los reintentos.

Funciones sin equivalente de backend conservadas y etiquetadas: saldo/recargas
locales de demostración, nombre preferido del dispositivo, notificaciones,
asistencia y administración demo. No modifican los puntos reales.

## Endpoints

Todos bajo `/api/v1`:

| Método | Ruta | Consumidor |
| --- | --- | --- |
| GET | /health, /stations, /fuels | Terminal / comprobaciones |
| GET | /vehicles/:plate | Terminal, mediante proxy kiosk |
| POST | /transactions | Terminal, UUID persistente |
| POST | /auth/login | Prime |
| GET | /memberships/me | Prime |
| GET | /memberships/me/transactions | Prime |
| GET | /memberships/me/rewards | Prime |
| GET | /memberships/me/redemptions | Prime |
| GET | /benefits | Prime |
| POST | /rewards/redeem | Prime |

## Windows: primer arranque

Requisitos: Git y Docker Desktop iniciado con contenedores Linux. El arranque
no requiere instalar Node en Windows. Para una copia nueva, en PowerShell:

```powershell
git clone https://github.com/Serenevt/Proyecto.git
cd Proyecto/V6
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl.exe --fail http://localhost:3000/api/v1/health
curl.exe --fail -L -o NUL http://localhost:8081
curl.exe --fail -o NUL http://localhost:8082
docker compose exec frontend1 nginx -t
docker compose exec frontend2 nginx -t
```

## Debian 13: primer arranque

Requisitos: Git, Docker Engine, Buildx y Docker Compose plugin. No requiere
Docker Desktop. Se asume acceso autorizado al motor; si el usuario necesita
`sudo`, anteponerlo a los comandos Docker. Para una copia nueva:

```sh
git clone https://github.com/Serenevt/Proyecto.git
cd Proyecto/V6
test -f .env || cp .env.example .env
chmod 600 .env
nano .env
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl --fail http://localhost:3000/api/v1/health
curl -I http://localhost:8081
curl -I http://localhost:8082
docker compose exec frontend1 nginx -t
docker compose exec frontend2 nginx -t
```

Editar los marcadores `REPLACE_` antes del arranque. En una instalación
existente, conservar `.env` y las credenciales de la base. Como alternativa al
copiado manual, `Backend/scripts/init-env.cjs` genera secretos aleatorios y
conserva los `.env` existentes; también crea `Backend/.env` para pruebas locales.
Se puede ejecutar con Node local (`node Backend/scripts/init-env.cjs`) o con
un contenedor Node montando la carpeta V6 en `/workspace`.

Se aplican migraciones y seed
idempotentes, sin reset. `migrate` y `seed` terminan con código 0; frontend1,
frontend2, backend y postgres permanecen activos. Conservar el volumen
`postgres_data`; no usar `down -v`, `prisma migrate reset` ni borrar esquemas.

Si 8081 está ocupado por el antiguo Compose de FrontEnd_1, detener solamente
aquel frontend desde `FrontEnd_1` con `docker compose stop frontend` y volver a
V6. Para la integración se usa el Compose raíz, no dos proyectos Docker separados.

Cuenta demo: `demo@primaxprime.pe`; contraseña `DEMO_PASSWORD` del `.env` usado
al crearla. El seed conserva su contraseña y saldo en arranques posteriores.
Vehículo: ABC-123; membresía: PRIME-0001; estación: Primax Sur.

| Aplicación | URL Docker |
| --- | --- |
| FuelFlow | http://localhost:8081 |
| Primax Prime | http://localhost:8082 |
| Swagger | http://localhost:3000/api/docs |
| Health | http://localhost:3000/api/v1/health |
| Backend | http://localhost:3000/api/v1 |
| PostgreSQL administrativo | localhost:5433 |

Solo visualizar Prime: `docker compose up -d --build frontend2` (en Debian,
anteponer sudo si corresponde). No inicia backend/postgres ni requiere .env.
El login necesita la API; no existe fallback de autenticación simulada.

## Variables, imágenes y persistencia

| Variable | Uso |
| --- | --- |
| POSTGRES_DB / POSTGRES_USER | Base y usuario; conservar valores del volumen existente |
| POSTGRES_PASSWORD | Contraseña local de PostgreSQL; usar hexadecimal aleatorio para evitar caracteres reservados en la URL |
| POSTGRES_PORT | Puerto administrativo del host; predeterminado 5433 |
| JWT_SECRET | Secreto aleatorio de al menos 32 caracteres, solo backend |
| KIOSK_SECRET | Secreto aleatorio de al menos 32 caracteres `[A-Za-z0-9_-]`, solo Nginx kiosk y backend |
| KIOSK_API_KEY | Alias compatible con instalaciones previas; KIOSK_SECRET tiene prioridad |
| POINTS_PER_SOL | Predeterminado 1; compra S/100 produce 100 puntos |
| PORT | Puerto publicado del backend; predeterminado 3000; internamente siempre 3000 |
| CORS_ORIGINS | Orígenes permitidos para desarrollo y Capacitor |
| DEMO_PASSWORD | Contraseña inicial local, entre 8 y 72 bytes |
| DATABASE_URL | Compose la construye internamente con `postgres:5432`; para Node local usar `Backend/.env` y `localhost:5433` |
| PRIME_API_BASE_URL | Solo build Android/externo; no es un secreto ni hace falta para Docker web |

No copiar `.env`, contraseñas, JWT ni resultados sensibles a Git. El archivo
`.env.example` contiene únicamente marcadores. No cambiar POSTGRES_PASSWORD
para un volumen ya inicializado sin una rotación administrativa explícita.

FuelFlow usa un build Node sin dependencias y runtime `nginx:alpine`. Prime
usa `npm ci`, build de la versión integrada actual y runtime Nginx. Solo se
copian los archivos públicos a las imágenes finales. Backend conserva su
Dockerfile multietapa: `npm ci`, Prisma generate, TypeScript y dependencias de
producción; corre como usuario `node` con `NODE_ENV=production`.

`migrate` ejecuta `prisma migrate deploy`; `seed` realiza upserts con actualizaciones
vacías y conserva operaciones, credenciales y puntos. Ambos terminan con código
0. El servicio opcional `tests` pertenece al perfil `test`.

El volumen lógico `postgres_data` mantiene el nombre existente
`primax-v6_postgres_data` y monta `/var/lib/postgresql/data`. Mantener el nombre
del proyecto `primax-v6` permite reutilizarlo. `docker compose down` retira
contenedores y redes, pero conserva este volumen.

Healthchecks: PostgreSQL usa `pg_isready`; backend consulta `/api/v1/health`
(incluye conexión real a BD); cada Nginx consulta `/healthz`. El arranque espera
PostgreSQL saludable → migraciones → seed → backend saludable → FuelFlow.
Prime no depende del backend para iniciar; su healthcheck verifica la interfaz,
no implica que login/API estén disponibles.

## Operación y DBeaver

Desde V6, los mismos comandos en Windows y Debian:

```sh
docker compose up -d --build
docker compose up -d --build frontend1
docker compose up -d --build frontend2
docker compose ps -a
docker compose logs -f backend
docker compose logs -f frontend1
docker compose logs -f frontend2
docker compose logs -f postgres
docker compose stop
docker compose start
docker compose down
```

FuelFlow inicia backend y sus dependencias; necesita `.env`. Prime puede
iniciar solo incluso sin `.env`: muestra login y explica el fallo al intentar
entrar sin API. En un clon nuevo basta `cd Proyecto/V6` y
`docker compose up -d --build frontend2`.

DBeaver es una herramienta administrativa opcional. Elegir PostgreSQL:
host `localhost`, puerto `5433` (o POSTGRES_PORT), database `POSTGRES_DB`,
username `POSTGRES_USER`, contraseña desde el `.env` local. No forma parte
del runtime. Swagger está en `/api/docs`; la compra normal usa las interfaces
y no necesita Swagger.

## Troubleshooting

- Motor inaccesible: iniciar Docker Desktop en Windows o Docker Engine en Debian
  y verificar `docker version`. No modificar permisos del socket indiscriminadamente.
- Error de credenciales: revisar el `.env` local y conservar las credenciales
  originales del volumen. Cambiar el archivo no cambia la contraseña almacenada.
- Puerto ocupado: identificar su propietario; detener únicamente el proceso o
  contenedor propio correspondiente. No borrar volúmenes para resolver puertos.
- API 502/503: revisar `docker compose ps -a`, salud y logs de backend/migrate/seed;
  ambos proxies usan DNS Docker y recuperan resolución cuando backend vuelve.
- Pantalla anterior: reconstruir con `docker compose up -d --build frontend2`
  (o frontend1) y recargar el navegador para renovar sus assets en caché.
- Kiosk 401: confirmar que ambos servicios reciben la misma clave. 403: revisar
  ruta/método y origen; no habilitar el proxy kiosk para tráfico de otros sitios.
- Nginx no inicia: usar `docker compose exec frontend1 nginx -t` cuando esté
  activo y revisar sus logs. No usar `nginx -T`: imprime la clave sustituida.
- Una red cambiada manualmente puede dejar contenedores con conexiones antiguas:
  `docker compose up -d --force-recreate` recrea contenedores y conserva el volumen.

## Pruebas y builds locales (Windows y Debian)

Para herramientas locales: Node 22 o 24 y Chrome. En Windows usar `npm.cmd`
en lugar de `npm` si PowerShell restringe scripts. Desde V6, con PostgreSQL y
backend ya activos:

```sh
npm --prefix Backend ci --no-audit --no-fund
npm --prefix Backend run prisma:generate
npm --prefix FrontEnd_2 ci --no-audit --no-fund
npm --prefix Backend test
npm --prefix Backend run build
npm --prefix Backend run lint
npm --prefix FrontEnd_1 test
npm --prefix FrontEnd_1 run build
npm --prefix FrontEnd_2 test
npm --prefix FrontEnd_2 run build
npm --prefix FrontEnd_2 run test:mobile
```

FrontEnd_1 no requiere instalar dependencias. E2E del backend conservando incluso
el esquema de pruebas, en PowerShell:

```powershell
$env:KEEP_E2E_SCHEMA='1'
npm.cmd --prefix Backend run test:e2e
```

En Debian:

```sh
KEEP_E2E_SCHEMA=1 npm --prefix Backend run test:e2e
```

También está el perfil Docker:
`docker compose --profile test run --build --rm tests`.
Conserva el esquema de pruebas; `--rm` retira solo el contenedor efímero.

E2E de navegador completo usando los Nginx de Docker:

```sh
node tools/run-integration.cjs --docker
node tools/audit-docker.cjs
node tools/check-standalone.cjs
```

Alternativa cuando solo se puede acceder al backend por HTTP/PostgreSQL:

```sh
node tools/run-integration.cjs
```

Esta alternativa inicia proxies Node de desarrollo en 127.0.0.1:5181 y :5180.
La prueba abre ambas interfaces, hace login real, compra S/100 PREPAGO/TARJETA/
BOLETA/Premium/ABC-123, comprueba +100, recuperación tras recarga, historial y saldo
en Prime sin recargarlo y verifica Transaction/Payment/RewardMovement por Prisma.
Comprueba también ausencia de la clave en recursos/respuestas y aislamiento de
los proxies. **Cada ejecución crea y conserva una compra nueva**, nunca limpia
los datos de la aplicación. Evidencia: `tools/test-results/integration.json`.

Para desarrollar con proxy: desde FrontEnd_2, `npm run dev`. Para FuelFlow,
desde V6, `FRONTEND=1 node tools/serve.cjs`; en PowerShell:
`$env:FRONTEND='1'; node tools/serve.cjs`.

## Android

Se conserva `android/`, Capacitor y `webDir: www`. La URL de API se centraliza
en `FrontEnd_2/js/config.js`. Para un APK fuera del host Docker, antes de
`npm run android:sync` o `android:debug`, establecer:

- PowerShell: `$env:PRIME_API_BASE_URL='https://api.example.com/api/v1'`
- Debian: `export PRIME_API_BASE_URL='https://api.example.com/api/v1'`

Usar una URL accesible desde el dispositivo y permitir el origen de Capacitor
configurado en CORS del backend. Nunca configurar una credencial kiosk en el APK.
El build solo escribe esta URL pública en `www/js/config.js`. Para volver a web:
quitar PRIME_API_BASE_URL y reconstruir. No se recompiló ni probó el APK en esta
integración; las pruebas móviles son de navegador.

## Estado de la verificación

Consultar [DOCKER-RESULTS.md](DOCKER-RESULTS.md) para el cierre Docker y
[INTEGRATION-RESULTS.md](INTEGRATION-RESULTS.md) para la validación anterior.
La validación ejecutada distingue Docker Desktop real de la revisión de
portabilidad a Debian; esta última no sustituye una ejecución en un host Debian.
