# Validacion V11 ? 2026-10-23 (America/Lima)

**V11 LISTA INTERNAMENTE PARA DEPLOY**

Este estado certifica el alcance local y los contratos internos probados. No certifica despliegue publico, dinero bancario, correo externo, camara fisica ni APK en telefono. No se hizo commit, push, merge ni deployment.

## IMPLEMENTADO Y PROBADO LOCALMENTE

1. **Continuidad:** se continuo V11 existente; no se recreo ni se revirtio trabajo valido. V10_2: 1356 archivos cotejados SHA-256 con `v10_2-baseline.json`, cero diferencias al inicio y al cierre. No se modificaron V8, V9, V10 ni V10_2. Los cambios/untracked anteriores siguen presentes.
2. **Bono S/10 PREPAGO y POSTPAGO:** solo cuentas nuevas con elegibilidad persistida; condicion estricta sobre compra original >S/50. S/50 y compras menores no consumen. Prepago reserva elegibilidad antes del pago y la consume solo al cierre valido; cancelacion sin despacho libera reserva. Transaccion fallida revierte el consumo del beneficio. Serializacion PostgreSQL y actualizacion condicional impiden doble aplicacion, incluso cruzando modalidades. Puntos sobre neto. Ticket muestra original, descuento y neto recibidos del backend. Ajustes parciales efectivo/tarjeta son expresamente simulados y auditados.
3. **Recovery:** cuenta inexistente responde exactamente `No existe una cuenta registrada con este correo.` Codigo con hash, expiracion, limite de intentos, verificacion unica, token de un uso, bcrypt y revocacion de sesiones. Concurrencia verificada. Fallo SMTP devuelve 503 e invalida codigo emitido. Mailpit SMTP probado; bandeja demo ficticia retirada (incluido lector heredado).
4. **Cancelaciones y reembolsos:** estados financieros persistidos y transiciones controladas; cancelacion repetida rechazada o replay sin efecto, reembolso duplicado sin segunda devolucion. Pago inexistente/pendiente no reembolsable. `PaymentEvent` conserva auditoria idempotente; `RewardMovement.REFUND` referencia Payment y compensa puntos sin modificar su movimiento original. Reembolso no devuelve combustible ya entregado al inventario. Postpago reabre deuda solo por la parte efectivamente revertida; recargas FIFO/sobrepagos no producen saldo negativo ni movimientos de importe cero.
5. **PaymentProvider/webhook:** token DI `PAYMENT_PROVIDER`, contrato de creacion/consulta/reconciliacion/cancelacion/reembolso. `POST /api/v1/payments/webhook`, DTO estricto y secreto servidor; consulta autoritativa al adapter y validacion de referencia, importe, PEN, estado y fecha. EventId duplicado no duplica captura; reutilizacion con otros datos se rechaza. Estados rechazado, expirado y cancelado liberan reserva del bono. CREATING se recupera por referencia sin crear otro cargo. Sin configuracion comercial no se persiste un intento ni se reserva bono. Las pruebas comerciales son mocks explicitos, no sandbox Culqi real.
6. **FuelFlow ? backend ? PostgreSQL ? Prime:** cobro con monto, estacion, vehiculo, combustible, fecha y estado; ambas vistas consultan la misma Transaction/Payment. Polling conserva API como fuente de verdad. Pago confirmado actualiza PAID; no hay conexion frontend-frontend ni duplicacion. E2E comprueba dos actores sobre el mismo ID; navegador prueba registro/compra/historial real entre interfaces.
7. **Inventario:** fuente PostgreSQL por estacion/combustible; FrontEnd_1 consulta panel API. Delta de volumen confirmado, CHECK y bloqueo transaccional; stock insuficiente bloquea y no puede quedar negativo con concurrencia. Rollback/replay no descuentan dos veces. No se hardcodea stock en frontend. El seed local solo inicializa filas faltantes.
8. **OCR:** preprocessing, placa y Membership PRIM, perspectiva, contraste/rotaciones, frames/consenso y fallback conservados. 11 pruebas Tesseract/OpenCV y pruebas UI de baja confianza/cancelacion aprobadas; umbral no reducido. Fixtures sinteticas no equivalen a una prueba fisica.
9. **Vercel preparado sin desplegar:** NestJS, health, Prisma generate/build, DATABASE_URL y CORS configurables; build Vercel conservado. Proxies aceptan BACKEND_UPSTREAM; Prime/APK usan PRIME_API_BASE_URL. Build productivo rechaza API localhost/LAN/HTTP. No se invento dominio Vercel. Ver DEPLOYMENT-V11.md.
10. **PostgreSQL online preparado:** URL PostgreSQL estandar, sin dependencia del hostname Docker en el backend. 18 migraciones aplicadas y status al dia en local, incluidas dos migraciones aditivas nuevas; no reset ni borrado de datos. `PostgreSQL/README.md` documenta migrate deploy, TLS/pool, backup y restauracion ensayada, sin seed demo productivo.
11. **SMTP preparado:** SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM configurables; STARTTLS/TLS, Mailpit local, sin credenciales hardcodeadas. Produccion rechaza modo demo/Mailpit. No se afirma entrega a Gmail/Hotmail.
12. **QR:** solo Yape/Plin y solo QR recibido del proveedor. Efectivo y tarjeta/NFC simulados sin QR. Ningun boton, imagen ni temporizador acredita pagos; solo consulta confirmacion externa.
13. **Seguridad:** `tools/audit-secrets.cjs` revisa archivos versionados y nuevos no ignorados sin imprimir secretos; cero hallazgos. `.env`, `.env.local`, keystores, local.properties, .vercel, certificados privados, APK y dumps ignorados; ejemplos con placeholders. APK inspeccionado sin claves de servidor ni .env. `npm audit --omit=dev` actual: **0 vulnerabilidades reportadas** (no se extrapola a dependencias dev ni a ausencia absoluta de vulnerabilidades).
14. **Builds y herramientas:** backend, FuelFlow, Prime y APK debug compilados; lint backend y git diff --check aprobados. Compose valido, seis servicios saludables. APK: Gradle 93 tareas; marcador no funcional `https://api.example.invalid/api/v1`, no artefacto productivo. No se eliminaron volumenes ni datos para validar.

## Evidencia de regresion final (sin contar reejecuciones)

| Grupo | Heredadas | Nuevas V11 | Aprobadas |
|---|---:|---:|---:|
| Backend unitarias | 126 | 9 | 135 |
| Backend E2E PostgreSQL | 193 | 36 | 229 |
| FuelFlow unitarias | 54 | 2 | 56 |
| Prime unitarias | 26 | 0 | 26 |
| Prime responsive | 45 | 0 | 45 |
| Browser V9/V10 adaptado V11 | 22 | 0 | 22 |
| Registro/compra entre interfaces | 3 | 0 | 3 |
| OCR Tesseract/OpenCV | 7 | 4 | 11 |
| Smoke V11 API/PostgreSQL | 0 | 15 | 15 |
| **Total** | **476** | **66** | **542** |

Baseline previo: 476 +36 =512. Esta continuacion agrega **30** pruebas: 29 en `v11-closure.e2e-spec.ts` y 1 de fallo SMTP en `auth-recovery.e2e-spec.ts`. Final: **542 passed, 0 failed, 0 skipped**. No se borraron/deshabilitaron pruebas. Se adaptaron fixtures a los campos de pago nuevos y expectativas antiguas que prohibian el bono prepago: S/100 ahora neto S/90, 10 puntos. La prueba de bandeja demo se sustituyo por rechazo de almacenamiento ficticio, conservando cobertura.

Logs locales ignorados: `closure-final-backend-v11.log`, `browser-closure-v11.log`, `integration-closure-v11.log`, `smoke-closure-v11.log`, `build-verified-v11.log`, `FrontEnd_1/test-closure-v11.log`, `FrontEnd_2/test-closure-v11.log`, `FrontEnd_2/ui-closure-v11.log`, `Backend/audit-production-v11.log`. Los esquemas E2E se conservaron como evidencia. Los errores HTTP intencionales de pruebas negativas no son fallos de suite.

## IMPLEMENTADO PERO PENDIENTE DE PRUEBA REAL / PENDIENTE MANUAL

- OCR con placa y Membership fisicas, pantalla de telefono, iluminacion/inclinacion real y camara: **PENDIENTE MANUAL**, no aprobado por las fixtures.
- APK en telefono real contra API HTTPS definitiva: **PENDIENTE MANUAL**; solo compilacion y auditoria del APK verificadas.
- Backend Vercel/DB gestionada, SMTP externo y firma/eventos/pagos comerciales: implementacion interna preparada; prueba real requiere las dependencias siguientes. No se cuentan como skipped de las 542 pruebas automaticas.

## PENDIENTE EXTERNO

- Autorizacion GitHub/Vercel para Serenevt/Proyecto, despliegue Vercel y URL HTTPS definitiva.
- Provisionar/conectar PostgreSQL Neon o gestionado y verificar migracion/backup en ese entorno.
- SMTP real, credenciales y remitente verificado; entrega externa real.
- Comercio/proveedor Yape/Plin habilitado, credenciales, contrato y registro de firma/webhook. El adapter Culqi incluido crea/consulta ordenes; las capacidades comerciales de busqueda, cancelacion y reembolso de billetera deben vincularse/certificarse con el contrato habilitado. El contrato interno de esas capacidades ya se prueba con mock y falla cerrado si falta adapter. No se afirma reembolso bancario ni compatibilidad de una API de cargos con ordenes de billetera. Los ajustes parciales de billetera real que requieran devolucion/cobro adicional no se confirman ficticiamente.
- Hosting HTTPS OCR y validacion con camara/tarjetas/telefono fisicos.
- Recompilar APK con URL publica real y probarlo en dispositivo.

## Incidencia historica conservada

La validacion anterior de V11 documento que dos pruebas iniciales de navegador alcanzaron la API V10 por fallback :10000 y crearon cuentas/vehiculos sinteticos. Es evidencia historica, no se borro ni se oculta. En esta continuacion todos los tests de API/browser usaron los puertos V11 21000/21081/21082/21025; no se limpiaron esos datos ni archivos antiguos. No se uso git clean, reset --hard, migrate reset ni compose down -v.
