# Primax Control — administración

## Propósito, alcance y actores

Primax Control ofrece administración operativa con información real de Backend. **ENCARGADO**, **ADMIN** y **SUPER_ADMIN** son perfiles administrativos con grants y alcance; el **Supervisor de estación** tiene un flujo operacional separado. Tener cuenta Prime o asignación Supervisor no concede acceso automático a Control.

## Precondiciones y flujo principal

Una cuenta aprobada y habilitada inicia sesión. Backend entrega cookie de sesión HttpOnly para el mismo origen de Control. La sesión determina rol, permisos explícitos y estaciones visibles. El panel ofrece dashboard, operaciones/detalle, terminales y surtidores, inventario y movimientos, recepción/reconciliación, personal, clientes, membresías, vehículos, transacciones, comprobantes académicos, auditoría e incidentes, según permisos. Refresh reconsulta sesión; logout limpia cookie.

## Reglas y alternativas

- **CTRL-001:** acceso exige cuenta administrativa aprobada y, salvo permiso global `SYSTEM_ADMIN`, correo previamente verificado cuando el flujo de solicitud pública está habilitado. Una cuenta rechazada, deshabilitada o sin aprobación no entra con JWT antiguo.
- **CTRL-002:** cada vista y acción exige su `AdminControlPermission`; la concesión por sí sola no amplía el alcance de estación. ENCARGADO queda limitado a estaciones asignadas. SUPER_ADMIN y `SYSTEM_ADMIN` ejercen el alcance global definido por Backend, sin convertirse en Supervisor operacional.
- **CTRL-003:** altas, aprobación, rechazo, deshabilitación y actualización de grants/asignaciones requieren actor autorizado y dejan trazabilidad. El alta supervisada de Supervisor asigna estaciones sin usar correo público.
- **CTRL-004:** consultas de clientes, membresías, vehículos, pagos/transacciones y comprobantes respetan alcance. Un comprobante se construye desde una transacción registrada y no cambia su estado financiero ni representa documento tributario oficial.
- **CTRL-005:** inventario, terminales, incidencias, reconciliación y auditoría exigen permisos específicos; una discrepancia o estado `REVIEW` no se resuelve mediante una edición silenciosa.
- **CTRL-006:** con SMTP deshabilitado, solicitud pública de acceso y reenvío de verificación devuelven indisponibilidad explícita antes de crear una cuenta pendiente imposible de verificar. Login y alta supervisada permanecen operativos.

## Seguridad y datos

Browser → proxy Control de mismo origen → Backend. Cookie HttpOnly, SameSite=Strict y Secure bajo HTTPS. El proxy sólo reenvía rutas Control permitidas y su cookie; no almacena token administrativo en JavaScript. Datos: `AdminControlAccount`, `AdminControlGrant`, `AdminStationAssignment`, `AdminEmailVerification`, `SupervisorStationAssignment`, `OperationalAuditEvent`, `OperationalIncident` y entidades consultadas de venta/inventario.

## Criterios de aceptación y evidencia actual

- Login → dashboard → navegación autorizada → refresh → logout; tras logout la sesión no autoriza lecturas.
- Una cuenta fuera de alcance no obtiene filas de otra estación; un grant faltante bloquea la acción aunque la vista sea conocida.
- Un acceso público sin SMTP responde 503 y no crea solicitud; un Supervisor puede ser creado por el administrador habilitado.

Evidencia: `Backend/src/control/`, `FrontEnd_3/js/app.js`, `FrontEnd_3/api/`, `Backend/test/control.e2e-spec.ts`, `Backend/test/control-operations.e2e-spec.ts`, `control-customers.e2e-spec.ts`, `FrontEnd_3/tests/control-proxy.test.js`, `control-state.test.js`, `Backend/src/control/email-disabled.spec.ts`. Relación académica: RF-18/20/21/22, RN-11/14 y RNF-04/06.
