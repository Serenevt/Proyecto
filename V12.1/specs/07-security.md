# Seguridad y límites de confianza

## Propósito y alcance

Separar identidades humanas, técnicas y servicios; proteger nuevas ventas, datos de clientes y administración. Esta spec describe controles existentes. No contiene valores de secretos ni autoriza relajar controles para staging.

## Reglas

- **SEC-001 — BFF/HMAC:** FuelFlow usa proxy de mismo origen y gateway de rutas/métodos permitidos. El BFF firma cada solicitud a Backend con HMAC, timestamp y contexto de sesión; Backend verifica la firma. No se permite destino arbitrario ni cabeceras de identidad aportadas libremente por el navegador.
- **SEC-002 — Sesión/CSRF:** Redis respalda sesión Kiosk y límites técnicos; falla cerrado cuando la dependencia requerida no responde. Mutaciones exigen protección de origen y CSRF. Pairing/terminal usan además cookie técnica y token CSRF coincidentes.
- **SEC-003 — Binding:** `TerminalCredential` se almacena como hash, caduca y puede rotarse/revocarse; autorización, orden PREPAGO y transacción nuevas requieren `TerminalOperation` activa y sus vínculos de estación, terminal y surtidor. `KIOSK_API_KEY` directa no sortea esa regla.
- **SEC-004 — Cookies:** Kiosk, terminal y Control usan cookies HttpOnly y SameSite=Strict; HTTPS exige `Secure` y nombres `__Host-` donde corresponden. El perfil HTTP local sólo aplica a loopback. Control usa proxy acotado del mismo origen; el navegador no almacena su token administrativo.
- **SEC-005 — Autorización humana:** Supervisor sólo accede a estaciones asignadas y rutas operacionales. Control exige estado de cuenta, rol, grants y station scope en Backend; cada lectura o mutación relevante aplica el alcance. Un JWT previo no conserva acceso tras deshabilitación/revocación.
- **SEC-006 — Secretos/red:** claves Kiosk, HMAC, JWT, OCR, credenciales DB/Redis/SMTP y hashes permanecen del lado servidor. CORS enumera origins exactos, sin comodín; API Prime usa URL pública sin secretos. PostgreSQL, Redis y PrintAgent no se exponen como servicios públicos directos. En staging gratuito, OCR tiene URL HTTPS pública pero `POST /recognize` exige credencial de servicio exclusiva que sólo posee Backend; ningún navegador la recibe.
- **SEC-007 — Abuso y auditoría:** rutas sensibles aplican rate limiting según su controlador/KioskStore; eventos de operación, inventario y pagos conservan evidencia y claves idempotentes. La respuesta pública no debe exponer códigos de recuperación, tokens o credenciales.

## Actores, precondiciones y alternativas

Cliente, Supervisor y administradores usan sus credenciales propias. Backend y BFF requieren secretos de servidor y almacenamiento operativo configurado. Firma, cookie, CSRF, rol, grant, scope o binding inválidos se rechazan; no se degrada a un modo sin seguridad. OCR indisponible degrada sólo a placa manual, sin afectar estas verificaciones.

## Criterios de aceptación y evidencia actual

- Petición financiera directa con `KIOSK_API_KEY` sin operación técnica recibe rechazo; el camino BFF firmado con binding válido funciona.
- Control no muestra datos de otra estación a ENCARGADO y su proxy rechaza namespaces/cookies ajenos.
- Sesión expirada/revocada no permite mutaciones; builds públicos no contienen secretos de servidor.

Evidencia: `FrontEnd_1/server/gateway.js`, `server/policy.js`, `Backend/src/kiosk/`, `Backend/src/auth/access.guard.ts`, `Backend/src/operations/`, `Backend/src/control/`, `Backend/src/setup-app.ts`, `FrontEnd_3/api/`; `FrontEnd_1/tests/kiosk-gateway.test.js`, `function-boundaries.test.js`, `FrontEnd_3/tests/control-proxy.test.js`, `Backend/test/phase1a.e2e-spec.ts`, `Backend/test/control.e2e-spec.ts`, `FrontEnd_2/tests/secrets.test.js`. Relación académica: RNF-04/05/06/13 y RN-11.
