# Identidad, prepago y recuperación V10

## Comportamiento

- PREPAGO acepta placa válida manual u OCR. Conserva la placa en autorización y transacción. Una placa desconocida no crea User, Membership ni Vehicle, ni gana puntos. El pago debe estar aprobado antes de autorizar combustible.
- DNI opcional de 8 dígitos, RUC opcional de 11 y pasaporte opcional alfanumérico de 5–20 caracteres. Pasaporte se recorta y convierte a mayúsculas. DNI y pasaporte son alternativas; los datos fiscales siguen siendo opcionales.
- Los tres documentos tienen índices UNIQUE PostgreSQL/Prisma; admiten múltiples NULL. Conflictos devuelven 409 con mensaje específico. Registro y membresía se confirman juntos; un conflicto revierte también el contador.
- Login único en `POST /api/v1/auth/login`: `{identifier, password}`, correo o DNI. Se conserva `{email, password}`. No se habilitó el login opcional por pasaporte: los extranjeros usan su correo y no necesitan DNI.
- Recuperación: `forgot-password` recibe correo; `verify-reset-code` recibe correo y código; `reset-password` recibe resetToken y password. Todos bajo `/api/v1/auth/`.
- Código criptográficamente aleatorio de 8 dígitos, vigencia 10 minutos, máximo 5 intentos; después de verificar se entrega un token aleatorio de 256 bits con vigencia máxima de 5 minutos. Ambos son de un solo uso. La base guarda HMAC/hash, no secretos en claro. Transacciones serializables protegen los usos concurrentes. Contraseña nueva con bcrypt coste 12; se invalidan los JWT anteriores mediante authVersion.
- Solicitud devuelve el mismo mensaje para correo conocido/desconocido. Límites por IP y enfriamiento por cuenta. La UI conserva el token únicamente en memoria, nunca en URL ni almacenamiento del navegador.

## Correo actual y adaptador heredado

Compose ahora configura `PASSWORD_RESET_DELIVERY=mailpit`: envía SMTP real a un buzón local atrapado en http://localhost:10025. Para entrega externa, Nodemailer admite proveedor SMTP configurable. Consulta [SMTP-RECOVERY.md](SMTP-RECOVERY.md). No existe proveedor SMS. La caducidad y el límite de intentos son configurables; los valores anteriores siguen siendo los defaults.

El adapter de bandeja demo fue retirado en V11. Para pruebas locales usar Mailpit; para produccion configurar SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD y SMTP_FROM. No existe lector de codigos desde una bandeja ficticia. Ver DEPLOYMENT-V11.md para configuracion y limites reales.
