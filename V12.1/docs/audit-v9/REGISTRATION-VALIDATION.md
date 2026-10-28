# Registro real, Android y Backend compartido — 19/10/2026

## Resultado

Registro real implementado y validado con PostgreSQL. Se conserva la fase transaccional anterior: las 296 pruebas de base siguen aprobando; se agregan 34 casos, para **330 aprobados, 0 fallidos, 0 omitidos**. No se hizo commit, push ni despliegue. V8 permanece intacta.

| Grupo | Antes | Nuevas | Total aprobado | Fallidas | Omitidas |
|---|---:|---:|---:|---:|---:|
| Backend unitarias | 100 | 0 | 100 | 0 | 0 |
| FuelFlow unitarias | 49 | 0 | 49 | 0 | 0 |
| Prime unitarias | 21 | 4 | 25 | 0 | 0 |
| Mobile navegador | 24 | 9 | 33 | 0 | 0 |
| OCR | 7 | 0 | 7 | 0 | 0 |
| Backend E2E PostgreSQL | 84 | 20 | 104 | 0 | 0 |
| Docker/integración navegador | 11 | 1 | 12 | 0 | 0 |
| **Total** | **296** | **34** | **330** | **0** | **0** |

No se suman reejecuciones. Mobile son 11 escenarios por tres resoluciones; agrupando resoluciones, el total es 308 escenarios. Las comprobaciones adicionales de persistencia tras reinicio, LAN, build Android, secretos y hashes no se suman como tests. El caso histórico `v9-flow` conserva su comportamiento de reconsultar una compra ya liquidada; el nuevo flujo de registro sí se ejecutó completo desde una cuenta nueva.

## Implementación

- **Endpoint:** `POST /api/v1/auth/register`, público con límite de 5 solicitudes/minuto. Login conserva 10/minuto. Se reutilizan Controller/DTO/AuthService/UsersService/UsersRepository/Prisma y el emisor JWT existente.
- **Campos:** nombre, correo y contraseña obligatorios. DNI, RUC y razón social opcionales; no se exige DNI y RUC juntos ni vehículo.
- **Validación Backend:** nombre saneado 1–80, correo válido normalizado y único en DB; contraseña mínimo 10 caracteres, máximo 72 bytes UTF-8, no solo espacios; DNI 8 dígitos, RUC 11; razón social saneada 1–160. DTO rechaza campos ajenos. Los datos fiscales no se verifican contra organismos externos.
- **Hash:** bcrypt coste 12, algoritmo existente. Solo `passwordHash` en DB; ninguna respuesta de alta/login incluye contraseña ni hash. El registro devuelve el mismo formato de sesión JWT que login.
- **Atomicidad:** escritura anidada Prisma crea User y Membership como una sola transacción. Se forzó un fallo SQL al insertar Membership en esquema de pruebas y se comprobó ausencia de User. No hubo migración de esquema nueva.
- **Membresía:** ACTIVE, saldo cero, número `PRIME-` + 24 caracteres hexadecimales generados con 12 bytes aleatorios en Backend. UNIQUE en DB y reintento de colisión. Se mantiene PRIME-0001.
- **Vehículos:** `POST /api/v1/vehicles` requiere JWT, deriva el titular de la sesión y valida membresía activa. Alta o vinculación de placa libre; misma placa del mismo titular es idempotente; otra membresía produce 409. No se admite membershipId arbitrario. No hay transferencia ni certificación de propiedad legal.
- **Prime:** pantalla Crear cuenta, enlaces de ida/vuelta al login, estilos existentes, formulario fiscal opcional, errores recuperables y bloqueo de envío en curso. Tras el alta inicia sesión. Membresía incorpora Agregar vehículo. localStorage solo conserva sesión/preferencias; los registros reales se consultan por API.
- **FuelFlow:** sigue como web Docker, sin cambiar su UI o reglas durante esta fase. Usa el proxy Nginx y el mismo Backend.

## Evidencia integrada y persistencia

`tools/registration.spec.cjs` ejecutó registro por la UI Prime (390×844), comprobación User/Membership con Prisma, recarga de página, logout, cierre del contexto de navegador, login en un contexto nuevo, vehículo desde la UI y compra por FuelFlow. La misma compra apareció en historial Prime con 100 puntos. Identificadores preservados:

- User: `7ab7728b-fc59-4b30-8919-9f9617f91c17`.
- Membership: `64afeca3-7cab-469e-831c-e522e4f9f5c1`.
- Número: `PRIME-6F17DD07616C27471792ED0F`.
- Vehículo: `R3L-188`.
- Transaction: `f5fb82d5-62a9-493f-90c7-34e82b5249b5`.

Se tomó un snapshot sin passwordHash y se reiniciaron realmente postgres, backend, frontend1, frontend2 y plate-recognition. Después del reinicio se compararon User, Membership, perfil fiscal, Vehicle y Transaction; permanecieron idénticos. Un login nuevo obtuvo JWT válido y los mismos 100 puntos. El volumen existente no se borró ni reseteó. El cierre/reapertura de contexto prueba una sesión de navegador nueva; no se afirma reinicio del sistema operativo.

Los E2E usan esquemas aislados y preservados: `e2e_e4392d75bf694339a24f01df0742d15b`, `e2e_v9_4f14e73d0d02404897aa24cb27eb2116`, `e2e_register_7c25935217b4400990ef3b4b43cf387b`. El error Prisma de registro en el log es el fallo SQL intencional de la prueba de rollback. Las pruebas no eliminan la cuenta ni los movimientos creados.

## Docker, LAN y Android

`docker compose up -d --build --wait` ejecutado con éxito; migraciones y seed terminan 0, preservando datos existentes. Los cinco servicios quedan healthy. Modo local restaurado al finalizar: FuelFlow 9081, Prime 9082, Backend 3100, PostgreSQL loopback 5434 y OCR interno. Health devuelve `status=ok,database=up`; Swagger y ambos frontends responden HTTP 200.

El override LAN se validó y levantó realmente. Como V6 ya ocupaba `127.0.0.1:3000`, se usó `LAN_BACKEND_BIND` con la IP LAN del PC para exponer V9 en esa interfaz y puerto 3000, sin tocar V6. Se verificó HTTP desde el host tanto por bindings como por la IP LAN; FuelFlow 9081, Prime 9082 y Backend 3000 respondieron. PostgreSQL permaneció en loopback y OCR sin puerto publicado. No se modificó firewall ni se probó otro dispositivo. `LAN_BACKEND_PORT` y `LAN_BACKEND_BIND` son configurables; no hay IP fija en archivos de configuración del repositorio.

APK debug compilada con SDK/JDK existentes mediante Capacitor/Gradle: **BUILD SUCCESSFUL**, 93 tareas. No se firmó release ni se instaló en teléfono/emulador.

Ruta: `FrontEnd_2/android/app/build/outputs/apk/debug/app-debug.apk`.

El APK de esta ejecución usa la IP LAN detectada del PC, puerto 3000, en `PRIME_API_BASE_URL`; requiere activar el modo LAN para funcionar desde un teléfono. Para otro host se recompila con su URL. No usa localhost ni PostgreSQL directo. El build acepta también `https://api.example.com/api/v1`, rechaza credenciales en URL y loopback para Android. `FUELFLOW_DEMO=0` elimina del bundle los literales de credenciales demo, no solo su presentación. Un escaneo del ZIP real comprobó ausencia de JWT_SECRET, KIOSK_SECRET, contraseña PostgreSQL y archivos .env. CORS aceptó el preflight de `https://localhost`, origen de Capacitor, con HTTP 204.

## Nuevas pruebas

- 20 E2E: alta, hash, JWT, membresía sin vehículo, campos fiscales, normalización/unicidad concurrente de correo, validaciones, número distinto, login posterior, rollback SQL real, conexión Prisma nueva, vinculación concurrente/otro titular/campo inyectado/sin JWT y rate limit.
- 4 unitarias Prime: sesión de registro sin contraseña local, alta fallida sin sesión, rechazo de URLs inseguras/inválidas y aceptación de URL LAN/HTTPS.
- 9 casos móviles: alta responsive con campos opcionales, conexión rechazada recuperable y duplicado sin sesión, cada uno en tres viewports.
- 1 flujo multicanal real descrito arriba.

Los requisitos académicos RF-16, RN-12 y RNF-14 mejoran su implementación y evidencia; se conservan **CUMPLE PARCIALMENTE**. Quedan la política organizacional de autorización/titularidad y evidencia formal de consentimiento, además de ejecución Android física. No se cambian otros dictámenes ni los nueve requisitos promovidos en la fase anterior.

## Pendientes y límites

Para la demo en celular: activar el override LAN, instalar manualmente el APK debug, comprobar que ambos equipos estén en la misma red y repetir registro/vehículo/compra/historial. Si cambia la IP del PC, recompilar el APK. Cámara física, permisos de red/firewall y ejecución nativa siguen sin acreditarse.

Preparación de Internet documentada, sin recursos cloud: URL HTTPS para APK, FuelFlow con proxy protegido, Backend compartido, PostgreSQL y OCR privados. El proxy kiosco local no se presenta como control suficiente para una terminal pública en Internet. No se añadieron pasarela comercial, verificación de correo, recuperación de contraseña ni comprobación oficial de identidad/titularidad.

Logs locales `docs/audit-v9/registration-*.log` (ignorados por Git); resumen versionable en `registration-results.json`. Cambios funcionales limitados a auth/users/vehicles, Prime y configuración LAN/build. Se conservan las correcciones transaccionales anteriores. README raíz y Prime actualizados. Estado Git final en `registration-git-status.txt`; diff y whitespace revisados. V8: 226 hashes intactos.
