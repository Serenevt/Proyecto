# Primax Prime V12.1

Aplicación de cliente web y Android vinculada al Backend V12.1. Membresía, saldo, recargas DEMO, vehículos, puntos e historial se consultan o mutan mediante API autenticada. La UI no altera el saldo financiero de forma local.

## Web local

Usa [README V12.1](../README.md) para levantar el Compose y sus rutas del mismo origen. Desarrollo aislado:

```sh
npm ci --no-audit --no-fund
npm test
npm run build
npm run dev
```

El servidor de desarrollo sirve en loopback `127.0.0.1:5180`; en Compose, Nginx resuelve `/api/v1` hacia Backend por la red privada. El build estático queda en `www/`. Las pruebas de navegador móvil usan Playwright y requieren `@playwright/test` y Chromium; no se consideran cubiertas cuando ese runtime no está instalado.

El login conserva el JWT según la arquitectura existente y no persiste contraseñas. `PENDING`, `REJECTED`, `ERROR`, `UNKNOWN` y `PARTIAL` nunca se presentan como pagos completados.

## Android

El proyecto Capacitor existente puede sincronizarse con `PRIME_API_BASE_URL` apuntando a una API accesible desde el dispositivo. Android no puede usar `localhost` para alcanzar el host; emplea el host del emulador/red en desarrollo y HTTPS cuando corresponda. No incluyas credenciales de Backend en el APK. La integración Android no se usa como despliegue de staging web.

## Alcance académico

Pagos y recargas son DEMO, sin proveedores financieros. Revisa la [preparación de staging](../docs/STAGING-READINESS.md) antes de definir dominios, CORS, variables o un alojamiento futuro.
