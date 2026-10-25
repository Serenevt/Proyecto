# Recuperación mediante correo

`docker compose up -d` usa `PASSWORD_RESET_DELIVERY=mailpit`. El Backend envía por SMTP a `mailpit:1025`; el mensaje queda atrapado localmente. Abre **http://localhost:10025** para leerlo. El puerto SMTP no se publica. Mailpit no reenvía mensajes a Internet, Gmail ni Outlook. Su interfaz está vinculada exclusivamente a `127.0.0.1` y los mensajes son temporales.

En Prime: **¿Olvidaste tu contraseña? → correo → Solicitar código → leer Mailpit → introducir código → nueva contraseña**. Un correo inexistente recibe la misma respuesta pública. La API nunca devuelve el código. El código aleatorio tiene ocho dígitos; PostgreSQL almacena HMAC-SHA256 ligado al registro. Caduca en `PASSWORD_RESET_TTL_MINUTES` (10 por defecto, máximo 60), permite `PASSWORD_RESET_MAX_ATTEMPTS` (5 por defecto, máximo 10) y un solo intercambio por token. El token de cambio, aleatorio de 256 bits, se guarda como SHA256, dura como máximo cinco minutos y nunca más que el código original. Cambiar la contraseña invalida el token y las sesiones previas mediante `authVersion`. Hay cooldown de un minuto por cuenta y limitación por IP.

## SMTP externo

Configura en `V10/.env` los valores de **tu proveedor**, sin versionarlos:

```dotenv
PASSWORD_RESET_DELIVERY=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=REPLACE_WITH_PROVIDER_USER
SMTP_PASSWORD=REPLACE_WITH_PROVIDER_PASSWORD
SMTP_FROM=Primax Prime <no-reply@your-verified-domain.example>
```

Los valores anteriores son marcadores, no credenciales utilizables. Para TLS implícito utiliza el puerto 465 y `SMTP_SECURE=true`; para 587, `false` y STARTTLS obligatorio. No se desactiva la validación de certificados. El proveedor debe autorizar el remitente y, si corresponde, el dominio. Nodemailer solo recibe esta configuración en el Backend; no pasa a variables de build frontend ni Android.

```sh
docker compose up -d backend
```

Después solicita recuperación desde una cuenta tuya registrada y verifica que el mensaje llegue al buzón externo; introduce el código y comprueba el cambio de contraseña. Un proveedor SMTP que acepta un mensaje no garantiza su recepción final: revisa también spam y el panel del proveedor. No publiques códigos ni secretos en logs. Si el proveedor falla, la respuesta sigue siendo genérica para evitar enumeración; el Backend registra solamente una advertencia sin datos sensibles. Puedes solicitar otro código tras el cooldown.

**Envío externo pendiente de credenciales SMTP.** No había `.env` V10 ni variables SMTP externas disponibles al realizar esta tanda. La prueba local contra Mailpit se documenta en la validación final.

Para producción usa además `APP_MODE=production`, `SHOW_DEMO_ADMIN_CREDENTIALS=false` y secretos propios del servidor. `mailpit` y el adaptador heredado `demo` se rechazan en modo producción. El adaptador `demo` se conserva para compatibilidad de herramientas históricas; no es el modo por defecto ni entrega correo real.

Referencias de configuración: [Nodemailer SMTP](https://nodemailer.com/smtp), [Mailpit Docker](https://mailpit.axllent.org/docs/install/docker/).
