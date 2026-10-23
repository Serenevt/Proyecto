# V11 deployment preparation

No public deployment was performed. `Backend/vercel.json` configures the build; Vercel supports NestJS entrypoint `src/main.ts`.
1. Create a Vercel project with root V11/Backend. Use Node 22. Build: npx prisma generate && npm run build.
2. Configure DATABASE_URL (managed PostgreSQL TLS, serverless pooling), JWT_SECRET, KIOSK_API_KEY, APP_MODE=production, CORS_ORIGINS, SMTP variables, PAYMENT_ENV=production, CULQI_SECRET_KEY and PAYMENT_WEBHOOK_SECRET. Never ship these to browser/APK.
3. Apply `npx prisma migrate deploy` to the intended database from a controlled environment after backup. Never reset. Do not seed demo accounts into production.
4. Host PlateRecognition separately as a container with HTTPS; Tesseract/OpenCV is not deployed as part of the NestJS function. Set PLATE_RECOGNITION_URL.
5. Set BACKEND_UPSTREAM=https://your-api.vercel.app for BOTH nginx frontends. Host FuelFlow behind a trusted station network or authenticated gateway: its reverse proxy injects the kiosk key. Do not expose this privileged kiosk proxy as an unrestricted public website.
6. Build static Prime or APK with PRIME_API_BASE_URL=https://your-api.vercel.app/api/v1. Capacitor requires an absolute API URL. Backend CORS must allow the real web origins and Capacitor origin. No localhost is hardcoded for public use.
7. Run health, registration, recovery email delivery, live-provider reconciliation and Android device validation before release.

Local development: `docker compose up -d`, FuelFlow http://127.0.0.1:21081, Prime http://127.0.0.1:21082, backend http://127.0.0.1:21000/api/v1. Mailpit is development-only, port 21025. Local DB uses the V11 volume exclusively.
Optional managed development database: `docker compose -f compose.yaml -f compose.database-managed.yaml up -d` with DATABASE_URL set. Do not run the inherited test profile against a production database.

## Payment truth and limitations
OnlineOrdersService persists the intent/payment before contacting Culqi. Yape/Plin use provider QR only. Status polling queries Culqi with the secret API key and checks provider ID, merchant order number, amount, currency, paid state and payment timestamp. Duplicate notifications are serialized and cannot settle twice. The UI cannot mark a payment paid. Cash and card/NFC are still simulated.
`POST /api/v1/online-orders/:id/notify` requires x-webhook-secret and re-fetches provider state; a deployment adapter must map the commercial provider event to the internal intent ID and supply this header. This adapter/registration has NOT been verified against Culqi. Polling works independently of webhook delivery when credentials are configured.
An ambiguous create timeout stays CREATING and must be reconciled against the merchant order number. Automatic recovery of such intents, expiry/cancellation and provider refunds are not complete. Never create a replacement payment blindly.
No Culqi sandbox credentials or live credentials were available. Local tests use an explicitly mocked provider, NOT Culqi sandbox. No actual money was collected.
The welcome discount currently applies at POSTPAGO settlement only; PREPAGO welcome discount remains unfinished. A cancelled/failed postpay settlement rolls back the claim. Existing users remain ineligible; only new registrations receive eligibility.

## SMTP
PASSWORD_RESET_DELIVERY=smtp uses SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM. Use a verified sender and server credentials/app password. Production refuses Mailpit/demo modes. Recovery storage uses hashes, expiry, limited attempts, single use and bcrypt password hashing. Missing email gets the exact requested message. Real external Gmail/Hotmail delivery was not tested; SMTP was exercised with Mailpit.

## Android validation
A debug APK compiled using https://api.example.invalid/api/v1 as an explicit nonfunctional build marker. Rebuild with the actual public URL before installation/user acceptance. No device-to-public-API validation was performed. The test APK is not a production deliverable.

## Official integration references
- https://vercel.com/docs/frameworks/backend/nestjs
- https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/billetera-moviles/
- https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/ordenes/
- https://apidocs.culqi.com/
