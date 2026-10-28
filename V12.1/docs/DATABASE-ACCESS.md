# Acceso PostgreSQL local de V12.1

Estas instrucciones corresponden únicamente a `V12.1/compose.yaml`. No describen V10/V11 ni una base remota. La contraseña se lee desde el `.env` local ignorado; no la copies a comandos, historial, capturas ni reportes.

## Sesión psql de solo lectura

Desde `V12.1/`:

```sh
docker compose exec postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Consultas de inspección:

```sql
BEGIN READ ONLY;
\dt
SELECT name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY finished_at NULLS LAST;
SELECT code, status, "createdAt" FROM "OperationalIncident" ORDER BY "createdAt" DESC LIMIT 50;
SELECT "stationId", "fuelId", liters, "reservedLiters" FROM "FuelInventory" ORDER BY "stationId", "fuelId";
SELECT "stationId", "fuelId", status, "reconciledAt" FROM "InventoryActivation" ORDER BY "stationId", "fuelId";
COMMIT;
```

El esquema Prisma evoluciona por migraciones. Si una consulta de ejemplo ya no coincide con el schema, consulta `Backend/prisma/schema.prisma`; no cambies datos manualmente. No selecciones hashes, tokens, códigos de verificación o credenciales para compartir.

PostgreSQL no publica un puerto al host por defecto. Si necesitas una herramienta gráfica, prepara un override de loopback revisado y temporal; no abras la DB a la LAN. No ejecutes `docker compose down -v`, `migrate reset` o `db push` como herramienta de consulta.

Para staging futuro, usa solo el checklist [STAGING-READINESS.md](STAGING-READINESS.md); esta fase no se conectó a Neon ni migró una base remota.
