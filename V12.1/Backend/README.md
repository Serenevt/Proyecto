# Backend V12.1

NestJS, TypeScript, Prisma 6 y PostgreSQL. El Backend es la autoridad para autenticación, alcance administrativo, estado de pagos demo, reservas, inventario, movimientos, operaciones y recibos.

## Ejecución

Para la integración local completa, sigue [README V12.1](../README.md) y levanta `../compose.yaml`. No conectes el perfil local a V10, V11, Neon ni a bases compartidas. `.env` contiene únicamente secretos locales ignorados; el Compose los inyecta en contenedores.

Comandos de desarrollo desde este directorio:

```sh
npm ci --no-audit --no-fund
npm run prisma:generate
npm run build
npm test
npm run test:safety
```

`npm run prisma:migrate` usa el wrapper de seguridad y solo admite destino local. Migraciones remotas de staging se describen en [STAGING-READINESS](../docs/STAGING-READINESS.md) y requieren aprobación independiente. No usar `db push`, `migrate reset` ni eliminar volúmenes.

## Esquema y datos

Las migraciones ordenadas están en `prisma/migrations`. `prisma migrate deploy` debe aplicarlas en ese orden. Los seeds locales de demostración están limitados al perfil local y son repetibles. Los pagos Yape/Plin/NFC, recargas y comprobantes son académicos; no hay cobros ni facturación SUNAT.

Las áreas principales incluyen memberships/wallet, autorizaciones de combustible, `TerminalOperation`, reservas/movimientos de inventario, transacciones, `OperationalIncident` y grants de Primax Control. Reutiliza servicios existentes; no persistas inventario o estados financieros paralelos.

## Seguridad

- `APP_MODE=local` valida destinos de DB/Redis locales y requiere secretos de longitud suficiente.
- Los perfiles no locales no permiten fallback de sesión en memoria. El perfil académico requiere Redis REST HTTPS, namespace, estación, origen HTTPS exacto y firma del gateway.
- El API aplica permisos y alcance en Backend; ocultar rutas en el navegador no concede acceso.
- No registrar credenciales, cookies, JWT, tokens de verificación, URLs con contraseñas ni imágenes OCR.
- No configures credenciales financieras comerciales para el perfil demo.

La preparación futura y sus límites están en [STAGING-READINESS](../docs/STAGING-READINESS.md).
