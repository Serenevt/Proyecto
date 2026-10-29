# Primax Prime — cuenta del cliente

## Propósito, alcance y actor

Primax Prime permite al **Cliente** autenticarse, consultar y gestionar datos propios que Backend persiste. Existe como web y código Capacitor; no se atribuye aquí instalación física de APK, notificaciones push ni integración de pago real.

## Precondiciones y flujo principal

El cliente registra una cuenta o inicia sesión con correo o DNI y contraseña. Backend emite JWT; Prime recupera por API perfil, membresía, vehículos, saldo, historial, puntos, beneficios y canjes. La vista permite seleccionar/agregar vehículo, actualizar datos de perfil propios, consultar movimientos y realizar recargas **DEMO**. Las consultas tras refresh rehidratan el estado desde Backend.

## Reglas y alternativas

- **PRIME-001:** login y registro usan identidad Backend; Prime no persiste la contraseña. JWT de cliente sólo habilita datos y acciones propias; una sesión vencida se elimina y exige nuevo login.
- **PRIME-002:** saldo disponible, reservas, deuda y puntos provienen de Backend. Una recarga/canje fallido no altera localmente cifras como si hubiera sido confirmado. El historial distingue pago pendiente de pagado.
- **PRIME-003:** vehículo y membresía activa pueden asociarse a FuelFlow para POSTPAGO; la placa/código deben coincidir en Backend. Saldo insuficiente impide la reserva y permite recarga o elección explícita de PREPAGO en FuelFlow.
- **PRIME-004:** datos de documento/perfil y vehículos se validan y se limitan al propietario. Beneficios/canjes existentes se registran con ID de operación; no se inventan puntos en la interfaz.
- **PRIME-005:** con correo deshabilitado, el login continúa; recuperación de contraseña informa indisponibilidad y no finge envío. SMTP real queda pendiente.

## Seguridad y datos

Prime usa Bearer JWT y API configurada; el build público no incluye secretos servidor. Datos principales: `User`, `Membership`, `Vehicle`, `MembershipDebt`, `WalletMovement`, `RewardMovement`, `Benefit`, `Redemption` y `Transaction`. Preferencias como notificaciones son locales; no equivalen a entrega push real.

## Criterios de aceptación y evidencia actual

- Credenciales correctas abren sesión y datos propios; incorrectas no crean sesión. Refresh conserva acceso mientras el JWT sea válido; logout lo borra.
- Perfil, saldo, historial y puntos reflejan respuestas reales de API; la interfaz no marca `PENDING`/`PARTIAL` como pagado.
- Un error 503 conserva últimos datos visibles sin inventar una confirmación; un 401 retira la sesión.

Evidencia: `FrontEnd_2/js/services/`, `FrontEnd_2/js/app.js`, `Backend/src/auth/`, `Backend/src/memberships/`, `Backend/src/wallet/`, `Backend/src/rewards/`, `FrontEnd_2/tests/auth.test.js`, `services.test.js`, `FrontEnd_2/tests/payment-state.test.js`, `FrontEnd_2/tests/register.test.js`, `Backend/test/registration.e2e-spec.ts`. Relación académica: RF-16, RN-06/12 y RNF-14.
