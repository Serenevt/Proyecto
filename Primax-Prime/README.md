# Primax Prime

Aplicación independiente de membresía, beneficios y fidelización. HTML/CSS/JavaScript modular; sin backend, base de datos, cobros ni notificaciones reales. No depende de la interfaz de FuelFlow. Usa el logo del proyecto.

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

## Integración futura

Primax Prime → API compartida → PostgreSQL. FuelFlow utilizará esa API para registrar compras; el servidor vinculará miembro/vehículo, generará el movimiento y calculará los puntos. Sustituir los servicios por adaptadores HTTP asíncronos y añadir estados de carga/error a las vistas. Contratos sugeridos: miembro `{id,name,number,points,balance}`, vehículo `{id,plate,label}`, movimiento `{id,memberId,vehicleId,type,amount,points,date,station,source,externalPurchaseId}`. El servidor deberá aplicar autenticación, autorización, idempotencia por compra, reglas de puntos y atomicidad de saldo/canjes. No confiar en localStorage para dinero o puntos reales.

## Capacitor / APK pendiente

La configuración usa `com.primax.prime` y `webDir: www`. No se generaron proyectos nativos. Instalar `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` (e iOS en macOS), ejecutar build, `npx cap add android`, `npx cap sync android`, `npx cap open android`. Configurar SDK/JDK/Android Studio, iconos/splash, firma y permisos; probar safe areas y teclado en dispositivos. Para iPhone se requiere macOS/Xcode. El logo es JPG sin transparencia. Datos, promociones, estaciones y contactos son demostrativos.

