# PostgreSQL V11

`../Backend/prisma/schema.prisma` y sus migraciones son la fuente del esquema. Ningun hostname Docker esta fijado en el cliente Prisma: lee DATABASE_URL.

## Desarrollo Docker
`docker compose -f V11/compose.yaml up -d` desde el directorio del proyecto. Volumen exclusivo `primax-v11_postgres_data`; sin puerto publico de base por defecto. Mailpit es solo local. No usar `docker compose down -v`.
El seed local inserta inventario de 5000 L solo cuando falta una fila; no repone existencias al reiniciar. No ejecutar el seed en produccion.

## PostgreSQL gestionado / Neon (no conectado)
Configurar DATABASE_URL del proveedor, por ejemplo el placeholder:
`postgresql://REPLACE_USER:REPLACE_PASSWORD@REPLACE_HOST:5432/REPLACE_DB?sslmode=require`
Escapar caracteres de usuario/clave en la URL. Configurar pool y limite de conexiones apropiados para serverless; usar la conexion autorizada para migraciones. El backend no exige el hostname `postgres` ni nombres exclusivos de Docker.

Desde `V11/Backend`:
```
npx prisma generate
npx prisma migrate status
npx prisma migrate deploy
npm run build
```
Las migraciones nuevas agregan campos/tablas/estados y trazabilidad de reembolsos; no borran filas ni reinicializan esquemas. Las 18 migraciones se aplicaron en PostgreSQL local V11.

## Precauciones
Prohibido `prisma migrate reset` en produccion. Verificar destino y permisos antes de migrar; backup con pg_dump y restauracion ensayada en otra base, retencion y cifrado. No subir dumps, URLs ni claves a Git. No apuntar la suite E2E a produccion: crea esquemas aislados y conserva evidencia con KEEP_E2E_SCHEMA=1. Nunca modificar una migracion ya aplicada; agregar otra.

## Inventario
PostgreSQL mantiene stock por estacion/combustible. El trigger descuenta el delta confirmado de galones US x 3.785411784 dentro de la transaccion. CHECK y UPDATE bloquean stock negativo y concurrencia; replay no descuenta dos veces. Un rollback del avance no pierde stock. Un reembolso financiero de combustible ya entregado no devuelve litros ficticios al tanque. En produccion cargar existencias fisicas verificadas, nunca asumir las cifras del seed local.
