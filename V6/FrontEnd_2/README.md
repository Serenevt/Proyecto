# Primax Prime

Aplicación de membresía independiente de FuelFlow, conectada al backend común V6.
Se conservan HTML/CSS, navegación y proyecto Android.

La guía completa de instalación, Docker, Windows/Debian, seguridad, endpoints y
prueba conjunta está en [V6/README.md](../README.md).

## Desarrollo y pruebas

Con Node 22/24, backend en localhost:3000 y PostgreSQL disponible:

```sh
npm ci --no-audit --no-fund
npm run dev
```

El servidor local en http://127.0.0.1:5180 sirve la UI y hace proxy de /api/v1,
eliminando cualquier cabecera kiosk. `npm run build` genera www; `npm test`
verifica servicios; `npm run test:mobile` ejecuta 15 pruebas de interfaz en tres
tamaños usando respuestas HTTP controladas. Chrome debe estar instalado.
La prueba real contra BD se ejecuta desde V6 con `node tools/run-integration.cjs`
o `node tools/run-integration.cjs --docker`.

## Sesión y datos

Login real: demo@primaxprime.pe; contraseña local definida por DEMO_PASSWORD al crear la cuenta. El servidor emite un JWT con
expiración; localStorage conserva únicamente sesión y preferencias del
dispositivo. Cerrar sesión elimina el token y los datos remotos en memoria;
401 vuelve al login. No se guardan contraseñas.

Usuario, número de membresía, vehículos, consumos, puntos, beneficios y canjes
se leen de la API. Las listas están paginadas. La actualización ocurre cada
10 segundos con la página visible y al recuperar el foco.
Los canjes se envían con operationId persistente y muestran el cupón real.
Las recargas de saldo, alias local, notificaciones y asistencia continúan
identificadas como demostraciones; no afectan puntos del backend.

`apiClient` concentra HTTP, JWT, timeout y errores. Los servicios de auth,
membership, transactions, rewards y benefits mantienen la UI independiente.

## Configurar API y Android

Web Docker usa /api/v1 mediante Nginx. Android requiere una URL accesible desde
el dispositivo: establecer PRIME_API_BASE_URL antes del build/sync. Ejemplo
PowerShell: `$env:PRIME_API_BASE_URL='https://api.example.com/api/v1'`.
Solo es configuración pública; nunca añadir KIOSK_API_KEY al APK.
Conservar HTTPS y configurar los orígenes de Capacitor en CORS del backend.

## Android con Capacitor 8

Proyecto nativo generado en `android/` con Capacitor 8.5.3: `appName: Primax Prime`, `appId: com.primax.prime` y `webDir: www`. Usa JDK 21, Gradle 8.14.3, Android Gradle Plugin 8.13.0, SDK de compilación/destino 36 y Android mínimo API 24. Las versiones instaladas se conservan en `package-lock.json`; usar `npm.cmd ci` para reproducirlas.

Desde esta carpeta, en PowerShell, seleccionar el JDK 21 instalado antes de compilar (el JDK 25 incluido en Android Studio no es compatible con este wrapper):

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21.0.11'
$env:GRADLE_USER_HOME=Join-Path $env:USERPROFILE '.gradle'
npm.cmd run android:debug
```

`android:debug` reconstruye la web, sincroniza Capacitor y ejecuta `assembleDebug`. El SDK debe estar configurado mediante `ANDROID_HOME` o `android/local.properties` con `sdk.dir`; este archivo es local y está ignorado por Git. Adaptar `JAVA_HOME` si JDK 21 está instalado en otra ubicación. En Android Studio seleccionar también JDK 21 como Gradle JDK.

APK debug: `android/app/build/outputs/apk/debug/app-debug.apk`. Para actualizar solo los recursos web ejecutar `npm.cmd run android:sync`; para abrir el proyecto en Android Studio, `npm.cmd run android:open`. No volver a ejecutar `cap add android` sobre el proyecto existente.

Validación histórica anterior a esta integración, tras añadir el login: 8 pruebas de servicios/autenticación y 15 pruebas móviles en Chrome (360×800, 390×844 y 412×915), todas aprobadas; build web, sincronización Capacitor y Gradle `assembleDebug` completados con JDK 21. El diseño y las funcionalidades existentes se conservan. El código nativo y el wrapper son versionables; `www/`, recursos web copiados, `node_modules/`, `.idea/`, `.gradle/`, directorios `build/`, `local.properties` y APK quedan excluidos.

Pendiente para distribución: probar en dispositivo/emulador Android (safe areas, teclado, navegación y persistencia), personalizar icono/splash nativos y configurar firma release. Se conservan los recursos nativos predeterminados de Capacitor. Para iPhone se requiere macOS/Xcode. El logo web es JPG sin transparencia. Datos, promociones, estaciones y contactos son demostrativos.


En esta integración se validó el build web y el navegador móvil; no se ejecutó Gradle ni un APK en dispositivo.
