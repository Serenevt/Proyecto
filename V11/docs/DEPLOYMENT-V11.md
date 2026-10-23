# Preparacion de produccion V11 (sin despliegue)

## Backend / Vercel
Root del proyecto: `V11/Backend`. Node 22; `vercel.json` prepara `npx prisma generate && npm run build`; entrada NestJS `src/main.ts`. Health: `GET /api/v1/health`. No se conecto GitHub/Vercel ni se creo una URL publica.

Configurar en el hosting, nunca en Git: DATABASE_URL, JWT_SECRET, KIOSK_API_KEY, APP_MODE=production, CORS_ORIGINS, PLATE_RECOGNITION_URL, SOLES_PER_POINT, PAYMENT_ENV, CULQI_SECRET_KEY, PAYMENT_WEBHOOK_SECRET, ADMIN_USER y ADMIN_PASSWORD_HASH. La validacion rechaza secretos demo, SMTP local en produccion y webhook sin secreto suficiente. Las variables SMTP se detallan abajo.

Aplicar `npx prisma migrate deploy` desde Backend contra la base correcta, despues de backup y ensayo. No ejecutar seed demo en produccion. OCR requiere hosting separado compatible con Tesseract/OpenCV; no forma parte de la funcion NestJS.

Referencia de plataforma: https://vercel.com/docs/frameworks/backend/nestjs

## Interfaces y APK
FuelFlow/Prime Docker: `BACKEND_UPSTREAM` recibe el origen HTTPS real del backend. Ambos navegadores usan `/api/v1` a traves de nginx. FuelFlow requiere una red de estacion o gateway autenticado: su proxy contiene la credencial de kiosk. No exponer ese proxy privilegiado sin control de acceso.

Prime web estatica y Android: establecer `PRIME_API_BASE_URL` antes de `npm run build` o `npm run android:debug`; debe ser la URL publica real terminada en `/api/v1`. Se inyecta en `FrontEnd_2/www/js/config.js` y, mediante Capacitor, en `android/app/src/main/assets/public/js/config.js`. No editar esos archivos generados a mano.

Para un build productivo usar tambien NODE_ENV=production: se rechazan HTTP, localhost e IP LAN. Android rechaza localhost incluso en desarrollo. `api.example.invalid` es exclusivamente el marcador NO FUNCIONAL del APK debug de validacion, nunca una URL de despliegue. Recompilar con la URL HTTPS definitiva y validar en telefono real. CORS debe incluir los origenes web definitivos y el origen Capacitor correspondiente (`https://localhost` o `capacitor://localhost` no son direcciones del backend).

## PostgreSQL
Ver `../PostgreSQL/README.md`. DATABASE_URL admite PostgreSQL estandar. El nombre `postgres` pertenece solo al compose local; el backend no lo exige. No se conecto Neon.

## SMTP
PASSWORD_RESET_DELIVERY=smtp con SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM. Usuario y clave se configuran juntos; STARTTLS cuando SMTP_SECURE=false, TLS directo cuando true. Usar remitente verificado. Mailpit solo local/dev; no existe bandeja ficticia de recovery. Una falla de envio devuelve 503 e invalida el codigo emitido, conservando cooldown. No se afirma entrega real a Gmail/Hotmail.

## Contrato de pagos
`PAYMENT_PROVIDER` es el token de inyeccion. Contrato en `Backend/src/payments/payment-provider.ts`; las pruebas usan un adapter mock explicito, nunca un sandbox comercial.
- `create` y `get`: intent persistido antes del efecto externo; QR solo Yape/Plin; boton/polling solo consultan evidencia autoritativa.
- `findByReference`: reconcilia un CREATING ambiguo sin volver a crear un cargo.
- `cancel`: misma clave idempotente; se exige confirmacion del estado remoto.
- `refund`: misma clave idempotente; REFUNDING persiste la incertidumbre y bloquea despacho; REFUNDED exige identidad, moneda, importe y evidencia remota de devolucion.

El adapter Culqi incluido implementa creacion/consulta. La vinculacion comercial de busqueda por referencia, cancelacion y devolucion de ordenes de billetera requiere confirmar las capacidades habilitadas para el comercio; esas capacidades opcionales fallan de forma cerrada si no estan disponibles. No se inventan endpoints ni se equipara una devolucion de cargos de tarjeta con una de ordenes Yape/Plin. Un cierre parcial de billetera que requiere devolver/cobrar diferencia queda bloqueado hasta confirmacion del proveedor; nunca se registra como reembolso bancario simulado. El ciclo completo interno se prueba con adapter mock; efectivo/tarjeta usan contabilidad DEMO.

Referencia de ordenes: https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/ordenes/
Referencia de devoluciones sobre cargos: https://docs.culqi.com/es/documentacion/librerias/backend/sdk_java

## Webhook publico-ready
`POST /api/v1/payments/webhook`
Header de servidor: `x-webhook-secret: <PAYMENT_WEBHOOK_SECRET>`
Body normalizado: `{ "eventId": "identificador-unico", "orderId": "UUID-interno", "type": "PAID" }`.
Tipos: PAID, FAILED, CANCELLED, REFUNDED. DTO estricto; evento reutilizado con otro contenido se rechaza. Se consulta al proveedor, se valida referencia/importe/moneda y se aplica la transicion serializable. PaymentEvent conserva auditoria e idempotencia; un reintento no duplica cobros.

El receptor es un contrato de adapter, no una afirmacion de compatibilidad con una firma nativa Culqi aun no verificada. Al conectar el comercio se debe validar su firma y normalizar su evento antes de invocar este contrato. El secreto no va en frontend/APK. La ruta heredada `POST /api/v1/online-orders/:id/notify` sigue protegida y solo reconcilia por API.

## Operaciones internas
- `POST /api/v1/authorizations/:id/release`: cancela sin despacho; devuelve reserva postpago o pago prepago DEMO y libera reserva del bono. Segunda cancelacion rechazada.
- `POST /api/v1/payments/:id/refund`: kiosk, devolucion interna efectivo/tarjeta DEMO; replay sin segundo efecto. Revierte puntos mediante movimiento REFUND con FK al Payment. No restaura combustible ya despachado.
- `POST /api/v1/online-orders/:id/cancel` y `/:id/refund`: propietario/kiosk segun orden; consultan confirmacion del adapter. Reembolso del pago de deuda reabre el saldo pendiente correspondiente en la misma Transaction/Payment; los sobrepagos y recargas FIFO se concilian sin saldo negativo.

El bono se reserva en prepago, se consume solo al cerrar una compra original >50, y no modifica elegibilidad de cuentas antiguas. En postpago se aplica al cierre. Los puntos se calculan sobre el importe neto. Transaction conserva originalAmount/discountAmount; Payment conserva la cotizacion prepago, importe neto y devoluciones, con auditoria de ajustes parciales simulados.
