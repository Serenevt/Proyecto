# Primax Prime V10

Aplicación web y Android conectada al Backend común. Conserva identidad visual, navegación, beneficios, puntos, rewards, canjes, vehículos y wallet. La guía completa está en [README V10](../README.md) y los resultados ejecutados en [VALIDATION.md](../docs/VALIDATION-V10.md).

**Registro real:** Crear cuenta solicita nombre, correo y contraseña (mínimo 10 caracteres, máximo 72 bytes), con DNI/RUC/razón social opcionales. Backend crea User y Membership ACTIVE atómicamente y devuelve la sesión JWT existente. Desde Membresía → Agregar vehículo se vincula una placa a la cuenta autenticada; no se exige vehículo al registrarse. Todo se persiste en PostgreSQL compartido con FuelFlow. Evidencia actual: [REGISTRATION-VALIDATION.md](../docs/VALIDATION-V10.md).

V10 muestra saldo disponible y saldo pendiente, consumos parcialmente pagados y su posterior liquidación. Las recargas regularizan primero deudas en Backend; la interfaz no aplica una segunda lógica financiera. El perfil permite consultar nombre/correo y editar DNI, RUC y razón social mediante API autenticada.

La recuperación utiliza SMTP configurable en Backend; Docker captura el correo local en Mailpit. Consulta [SMTP y recuperación](../docs/SMTP-RECOVERY.md). No se incrustan credenciales de cuentas en web/APK ni se etiquetan usuarios registrados como Demo. Las variables SMTP son exclusivas del servidor.

## Web

```sh
npm ci --no-audit --no-fund
npm run build
npm test
npm run test:mobile
npm run dev
```

El servidor local sirve en 127.0.0.1:5180; `BACKEND_URL` permite cambiar el destino del proxy. Docker usa `/api/v1` relativo a Nginx. El build queda en `www/`. La suite actual tiene 25 casos unitarios y 33 pruebas móviles sobre tres tamaños; Chrome debe estar instalado. La API móvil de estas pruebas se simula; las pruebas de integración del directorio `../tools` consultan el stack real.

El login emite JWT; localStorage conserva sesión, preferencias e identificadores de operación para reintentos, nunca contraseñas ni la base fiscal/financiera. Logout limpia la sesión. La interfaz refresca datos desde Backend al recuperar foco y periódicamente. Alias, ayuda y ciertos controles previos siguen siendo demo local; DNI/RUC/razón social y wallet sí se persisten mediante Backend.

## Android

Capacitor 8.5.3; `appId` com.primax.prime; JDK 21; Gradle 8.14.3; AGP 8.13.0; SDK 36, mínimo API 24. Se conserva el proyecto existente y el lockfile.

PowerShell:

```powershell
$env:PRIME_API_BASE_URL='http://10.0.2.2:10000/api/v1'
npm.cmd run android:sync
.\android\gradlew.bat -p android assembleDebug --console=plain
```

La URL debe ser accesible desde el dispositivo: 10.0.2.2 para emulador estándar, IP del servidor para LAN, HTTPS para Internet. Incluir orígenes Capacitor en CORS del Backend. El sync requiere URL absoluta; debug admite HTTP para la demo. Linux: `bash android/gradlew -p android assembleDebug --console=plain`.

APK: `android/app/build/outputs/apk/debug/app-debug.apk`. Se construyó debug, sin firma release ni instalación física. La APK nunca consulta PostgreSQL directamente. `www`, dependencias, cachés, configuración SDK local, outputs Gradle y APK se excluyen de Git.

V10: barra inferior naranja Primax con activo blanco y safe-area conservada. Backend concede 1 punto entero por cada S/9 de consumo elegible; no se calculan puntos financieros en el frontend.
