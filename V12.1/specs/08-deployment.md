# Despliegue objetivo de staging

## Propósito y estado

Fijar fronteras de alojamiento de V12.1 para un **futuro** staging académico. El código está validado localmente; esta spec no afirma que existan recursos remotos ni ordena desplegar, crear cuentas o migrar bases en esta fase.

| Ámbito | Componentes |
|---|---|
| Cloud/staging | Backend NestJS persistente; FuelFlow estático + BFF/proxy Supervisor; Primax Prime; Primax Control + proxy de mismo origen; PostgreSQL; Redis; PlateRecognition como servicio protegido. |
| PC de estación | PrintAgent local, accesible sólo por loopback y con impresora/driver compatibles. |
| Eliminado | Mailpit. |
| Futuro | Proveedor real de correo mediante SMTP genérico existente. |

## Reglas y alternativas

- **DEP-001:** Backend debe alcanzar PostgreSQL y Redis según perfil configurado. Migraciones y seeds sólo se ejecutan sobre destino aprobado y aislado; no se reutiliza `.env` local ni se destruyen volúmenes. Las interfaces públicas reciben únicamente URL/configuración no secreta.
- **DEP-002:** FuelFlow mantiene BFF HMAC y cookies seguras bajo HTTPS; Control conserva proxy de mismo origen; Prime llama a API HTTPS con CORS de origins exactos. El runtime de Backend es un servicio Node persistente según la arquitectura de staging documentada.
- **DEP-003:** PlateRecognition pertenece al MVP, pero es opcional en runtime. Para staging gratuito usa Web Service HTTPS separado con `OCR_SERVICE_SECRET` compartido exclusivamente entre Backend y OCR; `POST /recognize` rechaza solicitudes sin esa credencial. La red privada es preferida para producción. Si OCR no está disponible, `PLATE_RECOGNITION_ENABLED=false` y la entrada manual mantienen la operación.
- **DEP-004:** PrintAgent no se aloja en cloud. Si está apagado, la operación y el comprobante digital permanecen; impresión navegador es fallback existente. La impresión física desde origen HTTPS requiere validación posterior de navegador/origen local.
- **DEP-005:** Mailpit no forma parte del footprint. Con `PASSWORD_RESET_DELIVERY=disabled`, login, administración ya aprovisionada y ventas funcionan. Solicitud pública/verificación y recuperación que requieren correo comunican indisponibilidad. SMTP genérico podrá configurarse posteriormente sin incluir proveedor ni credenciales ahora.

## Precondiciones y criterios de aceptación

Antes de un despliegue futuro deben aprobarse dominios HTTPS, orígenes, secretos nuevos, aislamiento y restauración de PostgreSQL, capacidades Redis, protección de OCR, límites de BFF/Backend, datos académicos y pruebas E2E en ese entorno. La validación local sólo acredita Compose y servicios locales; no acredita disponibilidad cloud, red privada remota, cámara/impresora física ni correo real.

Evidencia actual: `compose.yaml`, `.env.example`, `Backend/.env.example`, `Backend/src/config/environment.ts`, `FrontEnd_1/vercel.json`, `FrontEnd_2/vercel.json`, `FrontEnd_3/vercel.json`, `docs/STAGING-ARCHITECTURE.md`, `docs/STAGING-READINESS.md`, `tools/ocr-fallback-ui.cjs` y `FrontEnd_3/tests/print-agent.test.js`. Relación académica: RNF-03/04/09/10/12/14.
