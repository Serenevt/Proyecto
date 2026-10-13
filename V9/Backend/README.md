# Backend Primax V9

NestJS + TypeScript + Prisma + PostgreSQL, JWT y Swagger. La guía vigente de arquitectura, instalación, migraciones, puertos, variables, demo y pruebas está en [README V9](../README.md); los resultados están en [VALIDATION.md](../VALIDATION.md).

## Cambios V9

- `MembershipDebt` auditable y saldo disponible no negativo.
- Autorizaciones con saldo real y capacidad de deuda explícita, limitada por `PRIME_DEBT_LIMIT`.
- Recarga DEMO idempotente con liquidación FIFO, ledger por aplicación y actualización de Payment/Transaction.
- Perfil DNI/RUC/razón social con DTOs, JWT y persistencia real; snapshots de comprobante en Transaction.
- OCR interno vía `RecognitionService`; reconocimiento normalizado y umbral configurable.
- Se conservan puntos, beneficios, rewards, canjes, vehículos y todos los modelos anteriores.

## Endpoints relevantes

Todos bajo `/api/v1`:

| Ruta                              | Autenticación / uso                     |
| --------------------------------- | --------------------------------------- |
| GET /health                       | Salud                                   |
| POST /auth/login                  | Login demo, JWT                         |
| GET /memberships/me               | JWT, perfil y saldo pendiente           |
| PATCH /memberships/me/profile     | JWT, DNI/RUC/razón social               |
| GET /memberships/me/wallet        | JWT, saldo y movimientos                |
| POST /memberships/me/recharges    | JWT, recarga DEMO y FIFO                |
| GET /memberships/me/transactions  | JWT, historial con estados              |
| GET /vehicles/:plate              | JWT propio o terminal autorizado        |
| POST /plate-recognition           | Terminal, imagen a OCR interno          |
| POST /authorizations              | Terminal, reserva de saldo/crédito      |
| POST /authorizations/:id/progress | Terminal, avance                        |
| POST /authorizations/:id/release  | Terminal, abandono sin consumo          |
| GET /authorizations/:id           | Terminal, recuperación de estado        |
| POST /transactions                | Terminal, compra idempotente y snapshot |
| GET /transactions/:id             | JWT propietario o terminal              |

Swagger: `/api/docs`. Conserva los endpoints existentes de catálogo, puntos, beneficios y canjes. Los comprobantes son snapshots de demo, no emisión tributaria ante SUNAT; los pagos no cobran dinero real.

## Desarrollo y validación

Usa Node 22.21.1/npm 10.9.4 para reproducir Docker. `Backend/.env.example` documenta la conexión local; Compose construye su URL interna con `postgres:5432`. No publiques `.env`.

```sh
npm ci --no-audit --no-fund
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
npm run lint
npm run format:check
npm test
npm run test:e2e
```

Para desarrollo: `npm run start:dev`. Usa puertos libres y la base V9. Las pruebas E2E crean y preservan esquemas aislados; no limpian `public`. La prueba de deuda inicial en la base de demo se prepara con `node scripts/v9-demo.cjs`, únicamente si la cuenta aún no tiene operaciones.

Las dos migraciones V9 extienden tablas, enums y restricciones; no resetean ni eliminan datos. No uses `migrate reset`, `db push` ni elimines volúmenes para resolver errores.
