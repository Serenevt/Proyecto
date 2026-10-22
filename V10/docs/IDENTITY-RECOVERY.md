# Identidad, prepago y recuperación V10

## Comportamiento

- PREPAGO acepta placa válida manual u OCR. Conserva la placa en autorización y transacción. Una placa desconocida no crea User, Membership ni Vehicle, ni gana puntos. El pago debe estar aprobado antes de autorizar combustible.
- DNI opcional de 8 dígitos, RUC opcional de 11 y pasaporte opcional alfanumérico de 5–20 caracteres. Pasaporte se recorta y convierte a mayúsculas. DNI y pasaporte son alternativas; los datos fiscales siguen siendo opcionales.
- Los tres documentos tienen índices UNIQUE PostgreSQL/Prisma; admiten múltiples NULL. Conflictos devuelven 409 con mensaje específico. Registro y membresía se confirman juntos; un conflicto revierte también el contador.
- Login único en `POST /api/v1/auth/login`: `{identifier, password}`, correo o DNI. Se conserva `{email, password}`. No se habilitó el login opcional por pasaporte: los extranjeros usan su correo y no necesitan DNI.
- Recuperación: `forgot-password` recibe correo; `verify-reset-code` recibe correo y código; `reset-password` recibe resetToken y password. Todos bajo `/api/v1/auth/`.
- Código criptográficamente aleatorio de 8 dígitos, vigencia 10 minutos, máximo 5 intentos; después de verificar se entrega un token aleatorio de 256 bits con vigencia máxima de 5 minutos. Ambos son de un solo uso. La base guarda HMAC/hash, no secretos en claro. Transacciones serializables protegen los usos concurrentes. Contraseña nueva con bcrypt coste 12; se invalidan los JWT anteriores mediante authVersion.
- Solicitud devuelve el mismo mensaje para correo conocido/desconocido. Límites por IP y enfriamiento por cuenta. La UI conserva el token únicamente en memoria, nunca en URL ni almacenamiento del navegador.

## DEMO académico/local

Compose configura `PASSWORD_RESET_DELIVERY=demo`. No existe proveedor de email ni SMS. La pantalla lo identifica explícitamente. El buzón local se cifra con AES-GCM y permisos restringidos dentro del contenedor.

1. Solicitar el código desde «¿Olvidaste tu contraseña?».
2. El operador local ejecuta desde V10:

   ```powershell
   docker compose exec -T backend node scripts/read-reset-demo.cjs correo-de-prueba@example.test
   ```

3. Entregar el código al participante y completar verificación/nueva contraseña en la UI.

No publicar la salida del lector ni convertirlo en un endpoint HTTP. El buzón es temporal; recrear el contenedor puede perder mensajes. Para deshabilitarlo, configurar `PASSWORD_RESET_DELIVERY=disabled`. Un despliegue con envío real requiere implementar un proveedor; el sistema actual no lo simula como real.

## Migración sobre datos existentes

La migración de documentos únicos no borra ni reasigna datos históricos. Si existen duplicados, es necesario resolver su propiedad antes de crear los índices.

En la base local examinada el 21/10/2026, `PRIME-0001`, `PRIM004` y `PRIM005` compartían DNI `12345678`. Se confirmó el origen sintético de las últimas dos mediante sus correos `@example.test`, los generadores de las suites y sus evidencias anteriores de registro/consumo. Con autorización expresa del usuario se respaldaron los datos y se dejaron NULL únicamente esos dos DNI. PRIME-0001 quedó intacta. La comparación de todas las tablas públicas confirmó que no cambió ningún otro dato durante la corrección. Respaldo local privado: `tools/evidence/dni-repair-1792641778892/before.json`; resultado en `verification.json`. No publicar el respaldo: contiene datos completos del entorno local.

Se verificó que la migración fallida había revertido sus columnas, se marcó únicamente `20261022000000_guest_prepay_unique_documents` como rolled back y se reaplicaron las migraciones. `prisma migrate status` confirma las 12 migraciones al día. No se usó reset ni se borraron volúmenes. Los scripts `repair-demo-dni.cjs` y `verify-preserved-data.cjs` documentan la reparación y su verificación; el primero es una operación única con guardas y no debe repetirse sobre cuentas ya corregidas.
