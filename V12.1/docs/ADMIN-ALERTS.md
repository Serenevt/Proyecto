# Admin y alertas reales

FuelFlow muestra `placa · nombre` usando `Vehicle.membership.user.name` servido por Backend. Una placa sin Membership muestra `No afiliado`; no se inventa una identidad. El código Membership sigue siendo parte de la validación y auditoría de operaciones.

El acceso del Panel de Seguridad ahora autentica en `POST /api/v1/admin/login`. La sesión administrativa dura 30 minutos y queda solo en memoria del navegador. Un token de socio o una clave de terminal no permiten listar/resolver alertas. Hay límite de intentos de login.

Solo `APP_MODE=local` junto con `SHOW_DEMO_ADMIN_CREDENTIALS=true` habilitan la cuenta y ayuda de demostración. Compose local define `DEMO_ADMIN_USER=admin-demo` y `DEMO_ADMIN_PASSWORD=LocalAdminV10!`, independientes del usuario Prime y de cualquier secreto del servidor. `GET /api/v1/admin/demo-credentials` devuelve únicamente esas dos variables en ese modo. En producción se desactiva la ayuda y se configura `ADMIN_USER` con `ADMIN_PASSWORD_HASH` bcrypt; nunca se devuelve el hash. Reiniciar Backend aplica las variables nuevas. Para generar el hash sin incluir la contraseña en un comando o documento, usa un gestor de secretos/herramienta bcrypt de confianza del equipo.

## Eventos persistentes

- **PLATE_MISMATCH:** una Membership existente no está vinculada a la placa introducida en la identificación postpago o autorización. Se guarda la placa introducida, todas las placas vinculadas (no se elige una arbitrariamente), usuario, Membership, operación y fecha. Un código desconocido por sí solo no produce alerta. La comprobación de identificación no reserva saldo. La autorización mantiene sus validaciones anteriores. En el cierre postpago también se detecta una placa distinta de la autorización, incluso si ambos vehículos pertenecen a la misma cuenta. Las alertas se escriben antes de la transacción financiera para que sobrevivan al rechazo.
- **PENDING_BALANCE / Saldo pendiente:** el listado sincroniza deudas positivas de `MembershipDebt` asociadas a transacciones con Vehicle registrado. Incluye placa de la operación, usuario, importe pendiente actual, transacción y fecha original. Esto incluye deudas anteriores a la migración. Una consulta repetida o concurrente hace upsert con clave única por deuda; no duplica alertas. Una deuda pagada refleja importe cero y conserva el historial de revisión.

`BusinessAlert.eventKey` es única. El mismatch usa operación + Membership/autorización + placa; los reintentos con el mismo evento no duplican ni reabren alertas. Intentos nuevos son eventos nuevos. El cliente conserva el UUID durante los reintentos de identificación.

`GET /api/v1/admin/alerts` devuelve hasta 200 eventos recientes, abiertos y resueltos. El panel muestra **No hay alertas pendientes** cuando no hay abiertos; conserva visibles los resueltos dentro de ese listado. `POST /api/v1/admin/alerts/:id/resolve` marca `RESOLVED` con fecha y responsable; repetirlo conserva la primera resolución. **Revisar no paga deuda ni altera saldos**. Los registros anteriores se conservan en PostgreSQL y pueden consultarse según DATABASE-ACCESS.md. No se convierten logs técnicos en alertas.

`GET /api/v1/admin/dashboard` muestra las últimas transacciones y totales históricos de PostgreSQL. Se eliminaron métricas y transacciones ficticias, además de las alertas de ejemplo.
