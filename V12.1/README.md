# Primax V12.1

V12.1 es el MVP académico local de FuelFlow, Primax Prime y Primax Control. Este directorio es independiente de `V11_1` y `V12`; el código histórico de `V12/` permanece congelado.

Los pagos y recargas son simulados. No se emiten documentos tributarios, no se integra un proveedor financiero y los comprobantes son académicos.

## Arquitectura

| Servicio | Función | URL local |
|---|---|---|
| Backend NestJS | API, auth, operaciones, pagos demo, inventario, incidentes y administración | `http://127.0.0.1:26000/api/v1/health` |
| FrontEnd_1 | FuelFlow | `http://127.0.0.1:26081/` |
| FrontEnd_2 | Primax Prime | `http://127.0.0.1:26082/` |
| FrontEnd_3 | Primax Control | `http://127.0.0.1:26083/` |
| PostgreSQL 17 | Datos locales persistentes | Solo red Compose |
| Redis 7 | KioskStore local | Solo red Compose |
| Mailpit | SMTP y bandeja de pruebas | `http://127.0.0.1:26025/` |
| PlateRecognition | OCR local | Solo red Compose |
| PrintAgent | Agente de impresión del equipo | Loopback `127.0.0.1:25443`, opcional |

Compose publica solo servicios web de loopback. PostgreSQL, Redis y OCR no publican puertos al host. Los frontends tienen proxies de mismo origen hacia Backend. Los puertos se pueden cambiar en `.env`.

## Inicio local

Requisitos: Docker Engine/Compose y Node.js 22.x para ejecutar herramientas locales.

```sh
cd V12.1
cp .env.example .env
# Sustituye cada placeholder de .env por secretos DEMO aleatorios locales.
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

El primer arranque migra el esquema y crea datos académicos de demostración. Los volúmenes nombrados `postgres_data` y `redis_data` conservan los datos. Para detener servicios sin borrar datos:

```sh
docker compose stop
```

No uses `docker compose down -v` sobre datos que quieras conservar. La base solo es local; no conectes `.env` a Neon ni a otra base compartida.

El seed incluye cuentas DEMO descritas por `DEMO_PASSWORD`, `DEMO_CONTROL_ADMIN_PASSWORD` y `DEMO_SUPERVISOR_PASSWORD` del archivo local ignorado. Control permite solicitar acceso y verifica el correo mediante Mailpit; `PRIMAX_CONTROL_PUBLIC_URL` fija el origin incluido en el enlace recibido. Consulta el buzón en la URL local.

## Actores y flujo

- **FuelFlow** presenta la compra de autoservicio. Backend persiste la autorización, el pago DEMO, las reservas, los avances, los movimientos y el comprobante.
- **Primax Prime** muestra membresía y saldo del backend; la simulación no acredita fondos por una acción local del navegador.
- **Primax Control** consume endpoints administrativos reales con grants y alcance de estación; las cuentas DEMO son solo para esta instalación aislada.
- **Supervisor** abre y cierra turnos, habilita o bloquea terminales. Su rol operacional no concede permisos de Control.
- **Incidencias** registra, entre otros casos, pago confirmado sin despacho. Resolver una incidencia no representa reembolso.

FuelFlow local usa Nginx same-origin → servicio `fuelflow-gateway` → Backend. El gateway firma las llamadas con HMAC, usa la sesión Kiosk de Redis del Backend y aplica la política de rutas y métodos. Nginx ya no añade `KIOSK_API_KEY`. La cookie Kiosk local es HttpOnly y SameSite=Strict sin `Secure` sobre HTTP loopback; el perfil HTTPS conserva `__Host-primax-kiosk` y `Secure`. La operación local DEMO no equivale a una estación de producción ni habilita operación desde la LAN.

**Terminal Binding resuelto en el MVP local (Fase 4D-3):** el Supervisor abre turno, habilita y parea la terminal; el BFF establece una cookie técnica HttpOnly y FuelFlow inicia o recupera una `TerminalOperation` con el mismo `operationId` de la venta. Backend valida por hash la credencial técnica y la operación activa al crear autorización, orden prepago o transacción mediante Kiosk. La API rechaza esas tres creaciones con `KIOSK_API_KEY` directo; las filas históricas con referencias técnicas NULL siguen siendo legibles y conciliables. Las referencias de terminal, surtidor y asignación se derivan de `TerminalOperation` en Backend. Redis mantiene la sesión Kiosk y los límites técnicos. Sobre HTTP loopback la cookie técnica es `primax-terminal-local` sin `Secure`; en HTTPS se conserva `__Host-primax-terminal` con `Secure`.

Evidencia local: `FrontEnd_1/tools/financial-e2e-local.mjs` recorrió `127.0.0.1:26081` por Nginx → BFF HMAC → Backend. Completó postpago y Yape DEMO con reintentos, progress, transacción y cierre; PostgreSQL confirmó para ambas ventas el mismo vínculo `TerminalOperation` → `FuelAuthorization` → `InventoryReservation` → `Transaction`, una reducción física `DISPENSE` por venta y ninguna fila financiera para los intentos sin sesión u operación técnica. La llamada directa con `KIOSK_API_KEY` devolvió 403. El Supervisor cerró el turno durante la venta prepago: esa operación terminó y una nueva fue rechazada. Las suites Phase 1A, inventario, incidentes, Control, gateway y FuelFlow pasaron en bases locales aisladas o sobre Compose según correspondía.

## Componentes opcionales

- **PlateRecognition** se inicia en Compose. Recibe imágenes por Backend y es solo candidato OCR; nunca autoriza el pago.
- **PrintAgent** no es un contenedor ni servicio remoto. El adaptador actual de impresión física usa PowerShell y el driver PeriPage confirmado; en Linux solo se validan contrato, idempotencia y fallback navegador. FuelFlow y Control tienen comprobante navegable; la falta del agente no altera la transacción. El historial de trabajos de esta versión queda aislado en `data-v12_1` y no reutiliza datos de versiones anteriores.
- **Gateway/BFF**: Compose inicia `fuelflow-gateway` en la red privada `web`, sin puerto publicado. Backend y BFF comparten solo `KIOSK_GATEWAY_SECRET`; el Backend usa el Redis local existente. El modo HTTP del gateway se limita al origin público loopback y al host privado `backend`.

## Validación local

Backend: `npm test`, suites PostgreSQL seleccionadas de `Backend/test`, `npm run test:gateway`, `npm run test:safety`, `npm run prisma:generate`, `npm run prisma:validate`, `npm run build`.

Frontends: en cada `FrontEnd_1`, `FrontEnd_2` y `FrontEnd_3`, usar los scripts `test` y `build` de su `package.json`. PrintAgent: `node --test PrintAgent/tests/*.test.mjs`; las pruebas de impresora física y Windows no aplican a Linux sin hardware.

Los archivos `docs/v11_1_1`, `docs/V9-*` y documentación histórica identificada por versión conservan antecedentes de V12.1; no son instrucciones para levantar el Compose actual.

## Staging futuro

El staging no está desplegado ni configurado. Sigue la lista de [preparación de staging](docs/STAGING-READINESS.md). La guía histórica `DEPLOYMENT-VERCEL.md` no describe este MVP y no autoriza ni prepara por sí sola un despliegue de V12.1.
