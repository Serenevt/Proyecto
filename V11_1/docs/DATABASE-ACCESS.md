# Acceso PostgreSQL de V10

Ejecuta los comandos desde `V10`. Compose usa PostgreSQL 17, servicio `postgres`, base `primax_v10`, usuario `primax` y contraseña local por defecto `primax_demo_local` **solamente si no existe una variable que los sustituya**. `.env.example` declara la misma base/usuario, pero exige sustituir `POSTGRES_PASSWORD=REPLACE_WITH_LOCAL_PASSWORD` si se copia a `.env`. La contraseña efectiva es la definida al crear el volumen; cambiar `.env` no cambia automáticamente una contraseña ya almacenada.

## A. Docker y psql

```sh
docker compose exec postgres psql -U primax -d primax_v10
```

Si personalizaste usuario/base, usa esos valores. Para leerlos dentro del contenedor sin imprimir la contraseña:

```sh
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

En psql: `\dt` lista tablas, `\d "Membership"` muestra columnas y `\q` sale. Las tablas Prisma conservan mayúsculas y requieren comillas dobles.

```sql
BEGIN READ ONLY;
SELECT id, email, name, active, "createdAt" FROM "User" ORDER BY "createdAt" DESC LIMIT 50;
SELECT id, number, "userId", status, balance FROM "Membership" LIMIT 50;
SELECT id, plate, label, "membershipId" FROM "Vehicle" LIMIT 50;
SELECT id, "operationId", plate, "membershipId", amount, "unitPrice", mode, status, "createdAt" FROM "Transaction" ORDER BY "createdAt" DESC LIMIT 50;
SELECT id, "transactionId", amount, method, status, provider FROM "Payment" LIMIT 50;
SELECT id, "membershipId", kind, points, "transactionId", "createdAt" FROM "RewardMovement" LIMIT 50;
SELECT id, "membershipId", kind, amount, "balanceAfter", "debtId", "createdAt" FROM "WalletMovement" LIMIT 50;
SELECT id, "membershipId", "transactionId", "amountOriginal", "amountPaid", "amountPending", status FROM "MembershipDebt" WHERE "amountPending" > 0;
SELECT id, type, status, plate, "expectedPlates", "userName", "amountPending", "operationId", "occurredAt", "resolvedAt" FROM "BusinessAlert" ORDER BY "occurredAt" DESC LIMIT 100;
SELECT id, "userId", attempts, "expiresAt", "verifiedAt", "usedAt" FROM "PasswordReset" LIMIT 50;
COMMIT;
```

No selecciones hashes de contraseña, códigos o tokens para compartirlos. `WalletMovement.transactionId` es un identificador escalar, no una FK declarada en Prisma.

## B. DBeaver

El Compose normal **no publica PostgreSQL**. Para habilitar acceso gráfico temporal exclusivamente desde el mismo PC:

```sh
docker compose -f compose.yaml -f compose.database-local.yaml up -d postgres
```

En DBeaver crea conexión PostgreSQL: host `127.0.0.1`, puerto `10543` (o `POSTGRES_LOCAL_PORT`), base `primax_v10`, usuario `primax`, contraseña local por defecto indicada arriba o la efectiva de tu instalación. Descarga el driver si lo solicita. No uses la dirección LAN ni abras el puerto en el router/firewall. Activa modo solo lectura en el cliente y utiliza las consultas anteriores.

Al terminar, restaura el servicio sin puerto publicado:

```sh
docker compose up -d postgres
docker compose ps
```

Modificar directamente saldos, deudas, pagos o movimientos puede saltarse transacciones, FIFO, idempotencia, puntos y auditoría. Normalmente deben modificarse mediante el Backend. No ejecutar reset de Prisma ni eliminar volúmenes para consultar datos.
