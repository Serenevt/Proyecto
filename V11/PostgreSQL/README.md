# PostgreSQL V11
Prisma en `../Backend/prisma/schema.prisma` es la ?nica fuente del esquema.
Las migraciones son aditivas: `npm run prisma:migrate` (migrate deploy). Nunca usar reset.
Docker conserva los datos en el volumen primax-v11_postgres_data. No ejecutar down -v.
Producci?n: configurar DATABASE_URL del PostgreSQL gestionado con TLS y pool compatible con Prisma.
Antes de migrar producci?n: backup y ensayo de restauraci?n en otra BD. No ejecutar seed demo all?.
El inventario empieza en cero en producci?n; cargar existencias verificadas con movimiento operativo supervisado.
El seed local crea 5000 L por estaci?n/combustible solo si no existe inventario. No repone al reiniciar.
La actualizaci?n del avance descuenta galones US ? 3.785411784 litros dentro de una transacci?n.
El trigger, CHECK y bloqueo de UPDATE evitan stock negativo; reintentos no descuentan dos veces.
