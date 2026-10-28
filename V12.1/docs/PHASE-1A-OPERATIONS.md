# V12.1: fundamentos operativos (Fase 1A)

Esta integración agrega identidad técnica y control operacional sin modificar `V12/` ni las 18 migraciones previas. La migración nueva es `Backend/prisma/migrations/20261026000000_v12_1_operational_foundations`. Conserva `directUrl`, las filas legacy y las operaciones anteriores; las referencias nuevas de autorización/transacción a Terminal son opcionales para esos registros.

## Capacidades y límites

- Cliente: JWT de cuenta Prime existente.
- Supervisor: misma cuenta Prime con asignación activa a una estación. Puede abrir, suspender y cerrar turno; habilitar, bloquear y recuperar terminales; y resolver excepciones de su estación. No aprueba cada venta.
- Administración: sesión administrativa existente o concesión global `SYSTEM_ADMIN` activa. Administra permisos, estaciones asignadas, surtidores y terminales.
- Terminal: identidad técnica propia, credencial aleatoria de 256 bits con hash SHA-256 en PostgreSQL, caducidad de ocho horas y revocación/rotación. No requiere JWT del Supervisor para sus operaciones.

La base impide más de una asignación activa por Terminal o Pump, habilitación activa por Terminal, credencial activa por Terminal, operación activa por Terminal y turno abierto por Supervisor. Las claves foráneas compuestas impiden mezclar estaciones. Los eventos de auditoría no admiten UPDATE ni DELETE.

## Rutas

`/api/v1/supervisor/*` usa JWT humano y comprueba la asignación vigente a la estación en cada acción. `POST /api/v1/supervisor/terminals/:id/{pair,rotate,revoke-session}` sólo se acepta con la firma del gateway. `/api/v1/terminal/*` sólo acepta la credencial técnica a través del gateway firmado. `/api/v1/operational-admin/*` usa el permiso administrativo existente o el grant global.

Para emparejar en el perfil académico, el cliente obtiene primero `GET /api/kiosk/session` y envía su cookie y `x-csrf-token` a `POST /api/v1/supervisor/terminals/:id/pair`, además de `Authorization: Bearer <JWT del Supervisor>`. El gateway valida origen, firma la solicitud y entrega la credencial técnica en cookie `HttpOnly; Secure; SameSite=Strict`. Devuelve sólo ID, vencimiento y un token CSRF separado. La rotación usa `/rotate`; la revocación usa `/revoke-session` y borra las cookies del navegador solicitante. El Backend comprueba cada solicitud contra PostgreSQL, y Redis limita la tasa. Los POST de Terminal exigen coincidencia entre el token CSRF y su cookie.

La política de rutas del gateway mantiene su lista explícita; la Terminal y el emparejamiento tienen rutas adicionales cerradas por método y UUID. Los encabezados de identidad técnica y JWT humano forman parte del HMAC. El gateway no reenvía cookies ni destinos arbitrarios al Backend. Los rewrites `route`/`path` del BFF de referencia (`a9173ae`) no existen en el `vercel.json` oficial: la función `api/[...path].js` recibe la ruta directa y continúa rechazando parámetros de consulta.

El flujo legacy de ventas permanece operativo con su sesión de operador y la política existente. Esta fase sólo crea el vínculo opcional de autorización/transacción con Terminal para integrar ventas posteriores; no agrega inventario, reservas, movimientos, PIN POSPAGO ni interfaz `FrontEnd_3`.

## Validación local

La prueba `Backend/test/phase1a.e2e-spec.ts` exige una base PostgreSQL aislada llamada `primax_phase1a` en `127.0.0.1:26555` (o el contenedor de prueba declarado). Los scripts oficiales bloquean conexiones remotas para migraciones y pruebas. Aplicar las 19 migraciones en esa base y ejecutar la prueba comprueba restricciones SQL, concurrencia, permisos, turnos, revocación, auditoría y rutas HTTP. `FrontEnd_1/tests/kiosk-gateway.test.js` comprueba la cookie técnica, CSRF, firma y lista de rutas.
