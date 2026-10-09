# Primax · FuelFlow y Primax Prime

Repositorio de aplicaciones demostrativas para autoservicio de combustible y
membresía Primax. Conserva distintas versiones de FuelFlow y una aplicación
independiente de Primax Prime. **V6 es la versión integrada más reciente**:
conecta ambas interfaces con una API compartida y PostgreSQL.

## Mapa del repositorio

| Carpeta | Contenido | Uso recomendado |
| --- | --- | --- |
| `V1/` | Prototipo web inicial de FuelFlow, con compra y despacho simulados. | Referencia histórica. |
| `V2/` | FuelFlow con comprobantes, datos del cliente y métodos de pago simulados. | Referencia histórica. |
| `V4/` | Base utilizada para la adaptación móvil; actualmente comparte el contenido de V2. | Referencia para V5-Mobile. |
| `V5-Mobile/` | FuelFlow móvil con módulos de lógica, servicios locales, idiomas, pruebas y proyecto Android. | Explorar la demostración móvil local. |
| `Primax-Prime/` | Aplicación independiente de membresía con autenticación y datos locales simulados. | Explorar Prime sin backend. |
| `V6/` | FuelFlow y Prime conectados al backend común, con despliegue Docker. | Punto de entrada para la versión integrada. |

No hay una carpeta V3 en este repositorio. Cada versión conserva sus propios
archivos y configuración; no existe un comando de instalación o ejecución común
en la raíz.

## Versión integrada: V6

```text
V6/
├── FrontEnd_1/   Terminal FuelFlow
├── FrontEnd_2/   Aplicación de membresía Primax Prime
├── Backend/      API NestJS, Prisma, migraciones y pruebas
├── tools/        Herramientas de integración y auditoría
└── compose.yaml Despliegue de interfaces, API y PostgreSQL
```

Las interfaces consultan la API mediante proxies; el backend accede a PostgreSQL
con Prisma. Los navegadores no se conectan directamente a la base de datos.

- **FuelFlow:** consulta estaciones y combustibles, identifica vehículos y
  registra compras prepago/postpago. Conserva el identificador de la operación
  para reintentar sin duplicar una compra.
- **Primax Prime:** inicia sesión mediante JWT y consulta membresía, vehículos,
  consumos, puntos, beneficios y canjes. Actualiza los datos periódicamente.
- **Backend:** valida solicitudes y permisos, registra compra/pago/puntos de
  forma atómica y gestiona canjes con control de saldo e idempotencia.

Para instalar, configurar y ejecutar V6, seguir la
[guía principal de V6](V6/README.md), que incluye instrucciones para Windows y
Debian, variables de entorno, puertos y pruebas. El arranque completo con Docker
aplica migraciones y ejecuta el seed; revisar esa guía antes de ejecutarlo.

## Tecnologías

| Área | Tecnologías del repositorio |
| --- | --- |
| Interfaces web | HTML, CSS y JavaScript sin framework de interfaz |
| API V6 | NestJS 11, TypeScript 5.9, JWT y validación de DTOs |
| Persistencia V6 | Prisma 6.19 y PostgreSQL 17.6 |
| Despliegue | Docker Compose y Nginx |
| Android | Capacitor 8.5.3, Java y Gradle |
| Pruebas | Node Test Runner, Jest, Supertest y Playwright |

Las dependencias se definen por aplicación en sus `package.json` y, donde
existen, `package-lock.json`. V6 documenta Node.js 22 o 24 para sus herramientas
locales; los requisitos de Android se detallan en las guías correspondientes.

## Guías por aplicación

- [V6: instalación, arquitectura y operación](V6/README.md)
- [V6 Backend: API, modelo de datos y reglas](V6/Backend/README.md)
- [V6 Primax Prime: desarrollo, sesión y Android](V6/FrontEnd_2/README.md)
- [Primax Prime independiente: demostración local y Android](Primax-Prime/README.md)
- [V5-Mobile: flujos y estructura modular](V5-Mobile/docs/MOBILE_PLAN.md)
- [V5-Mobile: matriz de pruebas](V5-Mobile/docs/TEST_MATRIX.md)

V1, V2 y V4 contienen páginas estáticas con HTML, CSS, JavaScript e imágenes.
V5-Mobile también permite abrir su `index.html` directamente para explorar la
demostración local.

## Alcance y validaciones

El proyecto registra **pagos de demostración**: no realiza cobros bancarios,
reconocimiento real de matrículas ni control de un surtidor físico. La asistencia
y algunas funciones de Prime, como recargas locales y notificaciones, también
son simuladas. Los comprobantes no constituyen facturación comercial real.

Los reportes de V6 documentan validaciones anteriores de servicios, navegador,
integración y Docker:

- [Resultado de integración](V6/INTEGRATION-RESULTS.md)
- [Cierre Docker del 9 de octubre de 2026](V6/DOCKER-RESULTS.md)

Estos reportes describen ejecuciones históricas, no garantizan el estado de una
instalación nueva. El cierre Docker deja pendientes la comprobación en Debian 13
y la compilación/ejecución de un APK de la versión integrada.

Parte de la documentación de V5-Mobile describe una fase anterior: indica que
Docker y Capacitor están pendientes, aunque sus archivos de configuración y el
proyecto Android ya existen. Su presencia no acredita una validación en
dispositivo físico.
