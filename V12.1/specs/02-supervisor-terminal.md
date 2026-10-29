# Supervisor, turnos y vinculación de terminal

## Propósito, alcance y actores

El **Supervisor de estación** habilita el autoservicio dentro de su asignación vigente. No equivale a ENCARGADO, ADMIN o SUPER_ADMIN de Control. La **identidad técnica Terminal/Kiosk** representa la estación de venta después del pairing; no es un usuario humano ni hereda el JWT del Supervisor.

## Precondiciones y flujo principal

La estación, el surtidor, la terminal y su asignación activa existen. El Supervisor inicia sesión con su cuenta humana, abre turno, habilita terminal y la empareja mediante el BFF. El navegador recibe cookie técnica HttpOnly; Backend guarda sólo el hash de `TerminalCredential`. Terminal preparada puede abrir una `TerminalOperation` con `operationId` propio de la venta. El pairing exige turno, asignación, terminal habilitada, sesión/CSRF y JWT Supervisor donde corresponde.

## Reglas y flujos alternativos

- **SUP-001:** sólo un Supervisor asignado a la estación puede abrir, suspender, reanudar o cerrar su turno y habilitar/bloquear/restaurar terminales de ese alcance. No aprueba cada venta.
- **SUP-002:** una venta nueva por FuelFlow requiere `TerminalCredential` vigente, `TerminalOperation` activa y coincidencia de `operationId`, estación, terminal, surtidor, asignación y habilitación. Backend deriva estos vínculos de la operación técnica; `KIOSK_API_KEY` directa no crea autorizaciones, órdenes ni transacciones nuevas.
- **SUP-003:** suspensión/cierre y bloqueo impiden nuevas operaciones según estado actual. Una operación válida ya abierta puede concluir; intervención requiere resolución explícita y no se descarta silenciosamente.
- **SUP-004:** credencial técnica caduca, puede rotarse o revocarse y se contrasta por hash en Backend. Rotación/revocación invalidan uso posterior y actualizan cookies del navegador solicitante. Una terminal puede recuperar su operación activa mediante su ID autorizado.
- **SUP-005:** la administración de estaciones, surtidores, terminales y asignaciones Supervisor pertenece a rutas administrativas protegidas. La asignación Supervisor es `SupervisorStationAssignment`; no existe un valor `SUPERVISOR` en `UserPermissionGrant`.

## Seguridad y datos

`SupervisorShift`, `TerminalEnablement`, `TerminalCredential`, `TerminalOperation`, `TerminalPumpAssignment` y `OperationalAuditEvent` preservan identidad, alcance y estados. PostgreSQL impone unicidad activa y claves compuestas relevantes. Las rutas humanas `/supervisor/*` exigen JWT y alcance; pairing/rotación/revocación y `/terminal/*` atraviesan BFF firmado, CSRF y política de rutas. El token técnico no se muestra al cliente como respuesta de pairing.

## Criterios de aceptación y evidencia actual

- Login → turno → habilitar → pairing → `terminal/me` preparada → abrir/recuperar/cerrar operación funciona para una estación asignada.
- Sin pairing, credencial o operación activa, la venta nueva se rechaza; una llamada directa con API key no evita el binding.
- Cerrar el turno impide una venta nueva sin invalidar una operación previamente válida en progreso.

Evidencia: `Backend/src/operations/operations.controller.ts`, servicios de `Backend/src/operations/`, `Backend/prisma/schema.prisma`, `FrontEnd_1/server/gateway.js`, `FrontEnd_1/src/js/terminalOperation.js`, `Backend/test/phase1a.e2e-spec.ts`, `FrontEnd_1/tools/terminal-e2e-local.mjs`, `FrontEnd_1/tools/supervisor-ui-e2e-local.mjs`, `FrontEnd_1/tools/financial-e2e-local.mjs` y `FrontEnd_1/tests/terminal-operation.test.js`. Relación académica: RF-10/18/20/21/22, RN-01/10/11/16.
