# Primax Prime

Aplicación independiente de membresía, beneficios y fidelización. HTML/CSS/JavaScript modular; sin backend, base de datos, cobros ni notificaciones reales. No depende de la interfaz de FuelFlow. Usa el logo del proyecto.

## Ejecutar con Docker

Desde `V6`: `docker compose up -d --build frontend2` y abrir
http://localhost:8082. No requiere Node en el host ni `.env` para levantar solo
este servicio. Docker Desktop no es obligatorio en Linux; Docker Engine y el
plugin Docker Compose son suficientes. Ver [instrucciones para Debian 13 y el
stack completo](../README.md).

El Dockerfile construye `www/` con Node 22 y sirve ese resultado con Nginx. La
interfaz, navegación, lógica demo y proyecto Capacitor se mantienen sin cambios;
no se conecta al backend en esta fase.

## Desarrollo local

Requiere Node.js 22 o superior. Desde esta carpeta:

```sh
npm.cmd install
npm.cmd run dev
```

Abrir http://127.0.0.1:5180. `npm run build` genera `www/`. `npm test` prueba lógica local. `npm run test:mobile` prueba el build en Chrome en 360×800, 390×844 y 412×915; usa Playwright instalado aquí o, como alternativa local, la instalación existente de V5-Mobile (solo lectura). Chrome debe estar instalado.

Para servir el build en PowerShell:

```powershell
$env:SERVE_BUILD='1'
npm.cmd run dev
```

Los servicios de `js/services/` centralizan usuario, vehículos, movimientos, beneficios y preferencias en la clave localStorage `primax-prime:v1`. Recargar acredita saldo ficticio; canjear descuenta puntos y guarda un cupón. Si el navegador bloquea el almacenamiento, se mantiene una sesión en memoria. Borrar la clave reinicia los datos de demostración.

## Inicio de sesión simulado

La aplicación muestra primero el login. Cuenta única: **demo@primaxprime.pe**, contraseña **Prime123**, nombre inicial **Diego**. Las credenciales se comparan exactamente; no hay registro, backend, API ni base de datos. `js/services/authService.js` separa la autenticación para una futura integración.

La sesión se guarda únicamente como `prime_authenticated=true` en localStorage y permite entrar directamente a Inicio al abrir la aplicación. Membresía incluye **Cerrar sesión**: elimina solo esa clave, vuelve al login y conserva todos los datos de `primax-prime:v1`, incluyendo cambios de nombre. Si el almacenamiento está bloqueado, el login muestra un mensaje y no permite acceso. La sesión es una simulación local, sin validación remota.

`npm.cmd test` ejecuta 8 pruebas de servicios/autenticación. `npm.cmd run test:mobile` ejecuta 15 pruebas en Chrome entre los tres tamaños móviles, incluyendo login correcto e incorrecto, mostrar/ocultar contraseña, persistencia al recargar/reabrir y conservación de datos al cerrar sesión.

## Integración futura

Primax Prime → API compartida → PostgreSQL. FuelFlow utilizará esa API para registrar compras; el servidor vinculará miembro/vehículo, generará el movimiento y calculará los puntos. Sustituir los servicios por adaptadores HTTP asíncronos y añadir estados de carga/error a las vistas. Contratos sugeridos: miembro `{id,name,number,points,balance}`, vehículo `{id,plate,label}`, movimiento `{id,memberId,vehicleId,type,amount,points,date,station,source,externalPurchaseId}`. El servidor deberá aplicar autenticación, autorización, idempotencia por compra, reglas de puntos y atomicidad de saldo/canjes. No confiar en localStorage para dinero o puntos reales.

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

Validación realizada tras añadir el login: 8 pruebas de servicios/autenticación y 15 pruebas móviles en Chrome (360×800, 390×844 y 412×915), todas aprobadas; build web, sincronización Capacitor y Gradle `assembleDebug` completados con JDK 21. El diseño y las funcionalidades existentes se conservan. El código nativo y el wrapper son versionables; `www/`, recursos web copiados, `node_modules/`, `.idea/`, `.gradle/`, directorios `build/`, `local.properties` y APK quedan excluidos.

Pendiente para distribución: probar en dispositivo/emulador Android (safe areas, teclado, navegación y persistencia), personalizar icono/splash nativos y configurar firma release. Se conservan los recursos nativos predeterminados de Capacitor. Para iPhone se requiere macOS/Xcode. El logo web es JPG sin transparencia. Datos, promociones, estaciones y contactos son demostrativos.

