# Primax V6 con Docker

Requisitos: **Git**, **Docker Engine** y **Docker Compose plugin**. En Debian 13,
instalar Docker siguiendo la [guía oficial para Debian](https://docs.docker.com/engine/install/debian/),
incluido el plugin Buildx utilizado para construir imágenes.
Comprobar `docker version`, `docker compose version` y `docker buildx version`.
El usuario debe tener acceso al daemon; utilizar `sudo docker ...` si la instalación lo requiere.

**Docker Desktop NO es obligatorio en Linux. Docker Engine + Docker Compose plugin
son suficientes.** En Windows se puede usar Docker Desktop con contenedores Linux.
No se necesita instalar Node, npm, Nginx, Java ni Android SDK en el host.

## Solo FrontEnd_2

Desde Debian 13 (sustituir `<repositorio>` por la URL del repositorio):

```sh
git clone <repositorio> Proyecto
cd Proyecto/V6
docker compose up -d --build frontend2
```

Abrir **http://localhost:8082**. No requiere `.env`, backend ni PostgreSQL.
Login local de demostración: `demo@primaxprime.pe` / `Prime123`.

```sh
docker compose ps
docker compose logs -f frontend2
docker compose stop frontend2
docker compose down
```

`stop frontend2` detiene solo Prime; `down` detiene los servicios del Compose completo
y conserva el volumen PostgreSQL. No usar `down -v` si se quieren conservar los datos.
El puerto `8082` debe estar libre. Se publica `8082:80`; desde otro equipo de la red
se utiliza la IP del host, siempre que su firewall permita el acceso.

## Stack completo

La primera vez, generar los secretos locales usando únicamente Docker. Desde `V6`,
en Debian/Linux:

```sh
docker run --rm --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$(pwd),target=/workspace" \
  -w /workspace node:22.21.1-bookworm-slim node Backend/scripts/init-env.cjs
docker compose up -d --build
docker compose ps -a
```

Alternativa para PowerShell en Windows:

```powershell
docker run --rm --mount "type=bind,source=${PWD},target=/workspace" -w /workspace node:22.21.1-bookworm-slim node Backend/scripts/init-env.cjs
docker compose up -d --build
```

El inicializador conserva `.env` existentes. No publicar esos archivos ni sus secretos.
Los valores vacíos predeterminados en Compose permiten arrancar solo el frontend;
no sustituyen la configuración obligatoria del backend. Para el stack completo hay
que ejecutar el inicializador antes del primer arranque.

Servicios del stack: `frontend2`, `postgres`, `migrate`, `seed` y `backend`.
`migrate` y `seed` deben terminar con código 0; los otros servicios permanecen activos.
FrontEnd_1 conserva su Compose independiente en `FrontEnd_1/compose.yaml`.

| Servicio | Dirección local |
| --- | --- |
| Primax Prime | http://localhost:8082 |
| Health del backend | http://localhost:3000/api/v1/health |
| Swagger | http://localhost:3000/api/docs |
| PostgreSQL | localhost:5433 |

## Construcción y separación de aplicaciones

`FrontEnd_2/Dockerfile` usa dos etapas: Node 22 instala las versiones del
`package-lock.json` con `npm ci` y ejecuta el build existente; Nginx sirve únicamente
el resultado `www/`. La imagen final no incluye Node, `node_modules`, código nativo
Android ni herramientas de desarrollo. `.dockerignore` excluye los artefactos locales.

Nginx incorpora `/healthz`, fallback SPA y respuestas 404 para recursos estáticos
inexistentes. La aplicación mantiene su navegación por hash, interfaz, servicios
locales y configuración Capacitor originales. El contenedor no compila un APK.

FrontEnd_2 sigue usando datos demo y localStorage. No se añadió integración con el
backend ni dependencia de PostgreSQL. El puerto 8082 es un origen distinto de 5180,
por lo que el navegador mantiene almacenamiento local independiente para cada uno.
La integración futura será `FrontEnd_2 → HTTP → Backend NestJS → Prisma → PostgreSQL`.

Ver también [documentación de FrontEnd_2](FrontEnd_2/README.md) y
[documentación del backend](Backend/README.md).

## Verificación manual

```sh
docker compose config --quiet
docker compose build frontend2
docker compose up -d frontend2
docker compose ps
docker compose exec frontend2 wget -S -O /dev/null http://127.0.0.1/
```

La página debe responder HTTP 200. `config --quiet` valida la configuración sin
imprimir los secretos interpolados. Las imágenes y la configuración usan contenedores
Linux estándar, sin sockets ni rutas propias de Docker Desktop.

Verificación realizada: Compose válido con y sin `.env` para el arranque aislado;
build de frontend2 y arranque del stack completo correctos; frontend2, backend y
PostgreSQL saludables. `http://localhost:8082` respondió HTTP 200 y el health del
backend informó `database: up`. Nginx pasó `nginx -t`; se comprobó que la imagen
final no contiene Node, npm ni `node_modules`. Los archivos principales servidos
coincidieron byte por byte con los originales. Ejecución verificada con
contenedores Linux desde Windows; no se realizó una prueba en un host Debian 13.
