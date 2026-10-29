# Recuperación mediante correo

Mailpit eliminado del MVP. Proveedor de correo real pendiente de configuración posterior. El Compose local usa `PASSWORD_RESET_DELIVERY=disabled`; el login y las operaciones siguen funcionando. La recuperación y las solicitudes públicas de acceso a Control que necesitan verificar correo devuelven indisponibilidad explícita. El administrador puede dar de alta usuarios por el flujo supervisado.

La capa `RecoveryDelivery` acepta `PASSWORD_RESET_DELIVERY=smtp` con `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM`. Estos valores deben configurarse más adelante en el entorno privado del Backend; no hay proveedor ni credenciales ahora. STARTTLS es obligatorio con `SMTP_SECURE=false`. Los tests inyectan un stub de entrega y no requieren servidor SMTP.

Los códigos de recuperación son de un solo uso y caducan; la API no los devuelve. `PRIMAX_CONTROL_PUBLIC_URL` define el enlace de verificación cuando exista entrega SMTP.
