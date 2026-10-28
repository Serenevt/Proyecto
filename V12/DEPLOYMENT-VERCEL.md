# Primax V12: demostración académica en Vercel y Neon

Esta preparación es local. No se ha publicado la rama, creado servicios, desplegado
en Vercel ni conectado a Neon o Redis. La rama de trabajo es
`codex/primax-v12-vercel-neon`; el punto de partida es `1529de7`.

## Alcance y datos

El perfil público es `APP_MODE=academic`, `PAYMENT_ENV=demo` y
`DEMO_WALLET_ENABLED=true`. Culqi queda sin credenciales y no participa. Los pagos,
recargas y comprobantes son simulados; no tienen validez bancaria ni tributaria.
Se mantienen JWT, DTO, permisos, idempotencia y controles financieros existentes.

**Usa una base o rama de Neon dedicada a demostración.** No apuntes una aplicación
que permite recargas simuladas a datos reales o compartidos con otro entorno.
`DATABASE_PURPOSE=academic-demo` es una declaración explícita del responsable,
no una comprobación automática del contenido remoto. No se crea una base ni una
rama desde este código. La base compartida existente no se ha inspeccionado.

Se conservan las 18 migraciones existentes, sin cambios. Antes de desplegar, el
responsable debe confirmar que la base de demostración tiene ese historial exacto,
los índices parciales, restricciones y trigger `v11_debit_fuel`, así como estaciones,
combustibles e inventario utilizables. Tener tablas con nombres iguales no basta.
No ejecutar `db push`, `migrate reset`, migraciones ni seeds para averiguarlo.
Una comparación remota de solo lectura requiere autorización aparte.

## Sesión del operador y revocación

Hay un operador configurado en el backend y una estación UUID existente. La
contraseña se introduce transitoriamente en el formulario; no se incrusta en el
sitio, no se persiste en JavaScript/localStorage y su hash bcrypt queda en servidor.
Las cuentas de socios y administración siguen separadas.

1. FuelFlow solicita una presesión por su función del mismo origen. Dura 5 minutos.
2. El backend verifica la firma del intermediario y guarda el identificador opaco
   mediante su hash en Redis REST. El navegador recibe el identificador solo en
   `__Host-primax-kiosk`, con `HttpOnly; Secure; SameSite=Strict; Path=/`, sin Domain.
3. Se entrega a JavaScript un token CSRF, que no es la credencial de sesión.
4. El login exige origen exacto, marcador de petición, cookie y CSRF. Valida usuario
   y bcrypt (costo 12-15), y comprueba que la estación configurada esté activa.
5. Un contador Redis atómico (`INCR`/`EXPIRE` dentro de `EVAL`) limita a cinco intentos
   en quince minutos para la única cuenta, incluidos intentos con otro usuario y
   logins correctos. No se reinicia al acertar. El límite de presesiones es 120/minuto.
6. El login consume la presesión y genera una sesión nueva de 30 minutos absolutos,
   sin renovación deslizante. La cookie anterior no sirve como sesión autenticada.
7. En cada operación, la función aplica su lista de rutas y pide autorización al
   backend; valida la estación devuelta por el servidor. NestJS vuelve a comprobar
   la sesión, CSRF, ruta, método, referencias y estación antes de ejecutar el negocio.
8. Las peticiones internas llevan HMAC sobre método, ruta, cuerpo, sesión, CSRF y
   timestamp (ventana de 30 segundos). La clave del quiosco no llega al navegador;
   en el perfil académico tampoco permite acceso por sí sola. No se reenvían cookies
   del navegador ni cabeceras de destino/credenciales arbitrarias al backend.
9. El logout elimina el registro Redis antes de borrar la cookie y confirmar el
   cierre. Todas las instancias consultan ese registro; una cookie copiada deja de
   servir después de la revocación. Una operación ya autorizada y en ejecución
   puede terminar: el logout no revierte transacciones que ya comenzaron.

No existe almacenamiento de sesiones de producción en memoria ni fallback. Si
Redis falla, la autenticación y las operaciones se rechazan. Usa un endpoint Redis
REST con lectura consistente contra el mismo primario; no réplicas con lecturas
eventualmente consistentes. Restringe sus credenciales a este entorno y usa un
namespace distinto para cada despliegue independiente. No se ha contratado ni
configurado un proveedor remoto.

Para revocar todas las sesiones, cambia `KIOSK_SESSION_VERSION` y vuelve a desplegar
el backend tras la autorización correspondiente. Cambiar el usuario, hash,
estación o secreto del intermediario también invalida las sesiones. Si cambias
`KIOSK_GATEWAY_SECRET`, actualízalo en ambos proyectos; mientras no coincidan el
acceso falla. Los registros anteriores desaparecen por TTL.

La revocación por cambio de configuración requiere que las instancias activas usen
esa configuración y que se retiren o protejan despliegues anteriores. No mantengas
una URL antigua accesible con credenciales anteriores. El logout por eliminación
en Redis no depende de actualizar variables ni de reiniciar instancias.

Las órdenes online pendientes tienen una asociación operación-estación en Redis
de siete días. No se permite reclamar una orden existente cuya asociación falte.
Si Redis pierde esas asociaciones o vencen, se requiere revisión del responsable;
no se reasignan ni se cobran de nuevo automáticamente. Los registros financieros
siguen en PostgreSQL. Hay un límite compartido de 240 comprobaciones por sesión y
minuto (la autorización previa y la ejecución consumen dos).

## Variables privadas del backend

Plantilla: `Backend/academic.env.example`. Los placeholders se deben reemplazar en
la configuración privada del proyecto, nunca en un archivo versionado.

| Variable | Configuración |
|---|---|
| `APP_MODE` | `academic` |
| `DATABASE_PURPOSE` | `academic-demo`, solo después de confirmar aislamiento |
| `PAYMENT_ENV`, `DEMO_WALLET_ENABLED` | `demo`, `true` |
| `DATABASE_URL` | URL agrupada Neon (`-pooler`), TLS `sslmode=require` |
| `DATABASE_URL_UNPOOLED` | Conexión directa de la misma rama/base/esquema, TLS |
| `JWT_SECRET` | Secreto privado aleatorio de al menos 32 caracteres |
| `KIOSK_API_KEY` | Clave privada distinta, aleatoria; no se comparte con frontend |
| `KIOSK_GATEWAY_SECRET` | Secreto aleatorio compartido solo con la función FuelFlow |
| `KIOSK_OPERATOR_USER` | Usuario del operador; sin cuenta de socio/administrador implícita |
| `KIOSK_OPERATOR_PASSWORD_HASH` | Hash bcrypt de contraseña privada, recomendado costo 12 |
| `KIOSK_STATION_ID` | UUID de la estación existente asignada por el responsable |
| `KIOSK_REDIS_REST_URL`, `KIOSK_REDIS_REST_TOKEN` | Endpoint HTTPS y token privado con permisos GET/SET/DEL/EVAL |
| `KIOSK_SESSION_NAMESPACE` | Identificador único del entorno, letras/números/guion/guion bajo |
| `KIOSK_SESSION_VERSION` | `1` inicialmente; incrementar para revocación global |
| `CORS_ORIGINS` | Orígenes HTTPS exactos separados por coma, sin rutas ni barra final |
| `SHOW_DEMO_ADMIN_CREDENTIALS`, `SWAGGER_ENABLED` | `false` |
| `PASSWORD_RESET_DELIVERY` | `disabled`, o `smtp` con proveedor real configurado aparte |
| `PLATE_RECOGNITION_ENABLED` | `false` para ingreso manual; `true` solo con OCR externo listo |
| `SOLES_PER_POINT`, `PRIME_DEBT_LIMIT` | `9`, `200`, salvo decisión de negocio explícita |

Dejar `CULQI_SECRET_KEY` y las credenciales de administrador demo **sin configurar**.
Los webhooks comerciales no son necesarios. No se necesita fijar `PORT` en Vercel.
Para SMTP opcional: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASSWORD`, `SMTP_FROM`; el código requiere TLS. Con entrega deshabilitada no
se envían correos de recuperación. No se publica un buzón ficticio ni códigos.

Para OCR opcional: `PLATE_RECOGNITION_URL` HTTPS y
`PLATE_CONFIDENCE_THRESHOLD` (por defecto `0.75`). El servicio actual necesita
Tesseract/OpenCV y no tiene autenticación propia de servicio: antes de exponerlo
debe protegerse en su alojamiento. No se ha desplegado ni se habilita por defecto.

En Prisma 6 `directUrl` referencia `DATABASE_URL_UNPOOLED`. No se necesita Prisma 7
ni un adaptador Neon nuevo. Para consultas se propone comenzar con
`connection_limit=2`, `connect_timeout=15`, `pool_timeout=15` y ajustar con mediciones.
No copies ni publiques URLs completas. No añadas parámetros heredados de PgBouncer
sin comprobar que los necesita la versión utilizada.

## Tres proyectos Vercel: pasos para el responsable

**No se ejecutó ninguno de estos pasos remotos.** La rama local aún no está en
GitHub; el proyecto conectado a `main` no recibe estos cambios automáticamente.
Tras revisar y autorizar su publicación, sube la rama y selecciona explícitamente
la revisión aprobada, o intégrala en `main` mediante el flujo acordado. No despliegues
el `main` anterior esperando el comportamiento descrito aquí.

1. Confirma la base Neon de demostración y sus datos existentes; no migrarla ni
   sembrarla desde Vercel. Obtén las dos URLs de conexión sin enviarlas al chat.
2. Prepara Redis REST de este entorno con consistencia apropiada. No uses la base
   de sesiones de otra aplicación. Guarda sus credenciales como privadas.
3. Elige los dominios HTTPS estables de backend, FuelFlow y Prime. En previews,
   configura orígenes y almacenes propios; no uses credenciales ni datos de otro
   entorno. El proxy rechaza automáticamente un origen no configurado.
4. Configura el backend según la tabla siguiente y sus variables privadas.
5. Configura FuelFlow con su origen público exacto y el origen del backend. Su
   secreto compartido debe coincidir con el del backend.
6. Configura Prime con la URL pública de API, incluyendo `/api/v1`.
7. Solo cuando se autorice, despliega el backend y después los frontend. Mantén los
   endpoints backend públicos a nivel de red para las funciones y el frontend
   Prime; su protección efectiva está en los controles de aplicación. Si activas
   protección de despliegue de Vercel, debes resolver su acceso entre proyectos;
   este código no incluye ni publica tokens para eludirla.
8. Después de autorizar también las pruebas sobre la base de demostración, verifica
   login/logout del operador, rechazo sin sesión, aislamiento de estación, socios,
   compra simulada e idempotencia. La comprobación de salud está en
   `/api/v1/health`; consultar ese endpoint ya conecta a la base remota.

| Proyecto | Root Directory | Preset | Install Command | Build Command | Output Directory |
|---|---|---|---|---|---|
| `primax-v12-backend` | `V12/Backend` | NestJS | `npm ci --include=dev --no-audit --no-fund` | `npm run prisma:generate && npm run build` | Dejar predeterminado del preset; no forzar salida estática |
| FuelFlow | `V12/FrontEnd_1` | Other | No requiere dependencias; se puede omitir instalación | `npm run build` | `dist` |
| Primax Prime | `V12/FrontEnd_2` | Other | `npm ci --include=dev --no-audit --no-fund` | `npm run build` | `www` |

Selecciona Node.js **22.x**. El backend también lo fija en `engines`. El punto de
entrada es `src/main.ts`; el soporte nativo de NestJS admite `app.listen()`, sin
adaptador Express adicional. `npm start` local sigue usando `dist/src/main.js`.

Variables de **FuelFlow**, todas privadas para su función salvo el booleano de
activación: `BACKEND_ORIGIN=https://<backend>`,
`FUELFLOW_PUBLIC_ORIGIN=https://<fuelflow>`, `KIOSK_GATEWAY_SECRET`. No incluyen
`/api/v1` ni barra final. No necesita la clave del quiosco, Redis ni la URL Neon.
Vercel proporciona `VERCEL=1`; el build activa el acceso del operador. La raíz
redirige a `/src/index.html` y `/api/*` se atiende mediante `api/[...path].js`.

Variable pública de compilación de **Prime**:
`PRIME_API_BASE_URL=https://<backend>/api/v1`. Solo contiene la URL pública, sin
credenciales. Cambiarla requiere recompilar. Sin ella, un build Vercel falla.
Los endpoints de socios siguen autenticándose con JWT.

## Compatibilidad local y barreras de herramientas

Los archivos fuente y los builds locales normales conservan `/api/v1` y el proxy
local. El acceso mediante la clave privada Nginx se conserva en `APP_MODE=local`.
El perfil local rechaza una base remota también al arrancar el backend, para que
una configuración heredada no dirija simulaciones a Neon.
La cookie segura del perfil público no se degrada a HTTP para probarla.

Compose usa ahora proyecto/volumen **`primax-v12`**, también en el iniciador local.
No se borra ni reutiliza el volumen de una versión anterior. Si se usaba el nombre
heredado, sus datos permanecen allí: no se copian automáticamente. El arranque de
un nuevo stack local puede crear su base; no se ejecutó durante esta preparación.

Los comandos npm de migraciones, seed, Studio y E2E rechazan hosts remotos, incluso
si `DATABASE_URL_UNPOOLED` es remoto. El CLI local carga `Backend/.env`, valida el
destino y reutiliza `DATABASE_URL` como directa si no se especificó otra. Jest E2E
incluye una barrera antes de importar cada suite; las suites sincronizan ambas
URLs al seleccionar su esquema local temporal. No hay un flag para permitir Neon.
Las herramientas HTTP de validación bloquean destinos remotos y el puente Prisma
Docker vuelve a comprobar la URL dentro del contenedor. El override administrado
no ejecuta migraciones ni seeds automáticamente.
El servidor local de Prime comprueba además la URL de API del archivo público que
va a servir, incluidos builds previos. Recompila con `/api/v1` antes de pruebas
locales de navegador; no reutilices un build que apunte a una API pública.

## Validación segura reproducible

Usa Node 22 y un checkout de V12 sin `.env` local para no leer secretos. Instala
solo las dependencias del backend; los dos builds estáticos y sus pruebas Node
no requieren instalar Android ni Playwright:

```powershell
Set-Location V12/Backend
npm.cmd ci --include=dev --no-audit --no-fund --cache .npm-cache
Set-Location ..
node tools/validate-local.cjs
```

El script fija URLs ficticias de loopback, valida/genera Prisma sin conectarse,
compila TypeScript, ejecuta unitarias y HTTP con dobles de Prisma/Redis, comprueba
barreras, compila ambos perfiles frontend y valida contratos de impresión sin
imprimir. Detiene la ejecución ante cualquier fallo. No ejecuta E2E con base real,
seeds habilitados, migraciones, correo, pagos, Redis remoto ni pruebas físicas.
Los builds finales de esa validación contienen dominios ficticios; Vercel debe
recompilarlos con sus variables reales.

## Funciones y verificaciones pendientes

- Las pruebas de despliegue real, empaquetado final de Vercel, conexión Neon y
  consistencia del proveedor Redis requieren servicios y autorización posteriores.
- El catálogo y el inventario existentes no se sembraron ni comprobaron remotamente.
- El panel administrativo no se concede al operador público. Sus rutas quedan fuera
  de la lista del proxy; el funcionamiento administrativo local se conserva.
  La excepción exacta `POST /admin/check-plate` es un control existente de quiosco,
  no un permiso administrativo: mantiene la verificación de placas y registra su
  asociación de estación en un namespace separado de las operaciones de pago.
- OCR queda opcional y deshabilitado por defecto. El ingreso manual está disponible.
- PrintAgent debe seguir en Windows junto a la impresora. Su contrato actual solo
  admite sitios HTTP de loopback y bloquea páginas públicas; la impresión desde
  Vercel requiere un diseño separado. No se cambiaron controles del agente.
- Las cuentas de socios siguen usando el mecanismo JWT/localStorage existente;
  no se convierten en sesiones del operador. El límite distribuido incorporado
  protege al operador; los límites generales de socios siguen siendo los existentes.
- Cinco intentos pueden bloquear temporalmente al único operador; es el compromiso
  de disponibilidad de una cuenta compartida. No se anuncia protección DDoS completa.
- La pérdida de Redis invalida sesiones; después de restablecerlo se debe iniciar
  sesión otra vez. No hay aceptación sin verificar por una caída del proveedor.

Referencias: [NestJS en Vercel](https://vercel.com/docs/frameworks/backend/nestjs),
[Neon y Prisma 6](https://neon.com/docs/guides/prisma),
[Redis REST](https://upstash.com/docs/redis/features/restapi).
