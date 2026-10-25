# Evidencia V10 — 20/10/2026 (America/Lima)

Fuente: carpeta V9 local actual, sin checkout, fetch ni uso de origin/main. No commit, push, merge ni despliegue. V8 y V9 conservan sus hashes iniciales: 226 y 366 archivos fuente/configuración/documentación respectivamente. `docs/source-integrity.json` conserva el inventario SHA-256 (no contiene secretos).

## Suites finales

| Suite | Base V9 | Nuevas V10 | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|---:|---:|
| Backend unitarias | 100 | 8 | 108 | 0 | 0 |
| FuelFlow | 49 | 0 | 49 | 0 | 0 |
| Prime | 25 | 0 | 25 | 0 | 0 |
| Mobile/browser | 33 | 3 | 36 | 0 | 0 |
| OCR en contenedor | 7 | 0 | 7 | 0 | 0 |
| Backend E2E PostgreSQL | 104 | 8 | 112 | 0 | 0 |
| Docker/integración navegador | 12 | 0 | 12 | 0 | 0 |
| **Total** | **330** | **19** | **349** | **0** | **0** |

No se suman reejecuciones. Mobile contiene 12 escenarios en tres resoluciones. Las comprobaciones ad hoc de arranque, APK, hashes, secretos, HTTP, persistencia y LAN no inflan este total. No se eliminaron pruebas.

Backend E2E final preservó `e2e_a5f6f4fd26274d61a03c6f3f4b5feeab`, `e2e_v9_bdde0e0ead954732b63f16372e489398` y `e2e_register_2bcb72f737ec4ffe966a2ff3f32490a2`. Los errores SQL intencionales registrados por las pruebas de rollback no son tests fallidos.

## Arranque aislado real

Copia `V10/.clean-start/clone`, seleccionada con `git ls-files -co --exclude-standard`: 295 archivos versionables al momento de crear el snapshot. Inventario: `docs/clean-source-manifest.json`. Sin `.env`, node_modules, dist, www, build Android ni caches del host. Builder nuevo `primax-v10-clone-builder` con caché vacía e imágenes de aplicación nuevas. Proyecto temporal `primax-v10-clone`; volumen nuevo `primax-v10-clone_postgres_data`. Los nombres se eligieron mediante variables del proceso de prueba, no con un `.env`.

Desde la copia, el único comando de preparación de la aplicación fue **`docker compose up -d`**. No se ejecutó npm/pip/Prisma/seed manualmente antes. El log completo local está en `tools/clean-start.log` (ignorado). El build ejecutó realmente npm ci con Node 22.21.1/npm 10.9.4 y pip/Tesseract/OpenCV dentro de contenedores Linux. PostgreSQL → migraciones → seed → Backend healthy, automáticamente. Los cinco servicios principales terminaron healthy.

HTTP 200 verificado: FuelFlow 10081, Prime 10082, Backend 10000/api/v1/health, Swagger 10000/api/docs. PostgreSQL y OCR no tienen host ports.

En esta misma base nueva se ejecutaron registro desde Crear cuenta, hash bcrypt verificado en PostgreSQL, Membership ACTIVE automática, login posterior, vinculación Vehicle, compra FuelFlow con usuario nuevo, historial Prime, puntos y RewardMovement único. S/100 concede 11 puntos. Los siete importes positivos límite se verificaron además con persistencia/ledger en E2E; cero da cero en política y continúa inválido como compra.

El flujo OCR/deuda se ejecutó completo (no solo reconsulta histórica): saldo inicial S/5, consumo S/12.60, deuda S/7.60, 1 punto, recarga S/20, saldo final S/12.40 y deuda cero. Payment pasó PARTIAL → CAPTURED y Transaction PAYMENT_PENDING → PAID. Se conservó el snapshot fiscal después de editar el perfil.

Las evidencias financieras locales están en `tools/evidence/` (ignoradas; incluyen los identificadores de los datos sintéticos y snapshots de persistencia). La cuenta nueva conserva User, Membership, Vehicle, Transaction y 11 puntos tras reiniciar. El segundo `docker compose up -d` conservó el snapshot íntegro de diez tablas y exactamente un demo@primaxprime.pe, PRIME-0001 y ABC-123. No se eliminaron volúmenes ni datos.

## UI, Android y plataformas

36/36 pruebas móviles en Chrome: 360×800, 390×844, 412×915. Capturas revisadas visualmente: `FrontEnd_2/test-results/` (ignoradas). Barra naranja de paleta existente, icono/texto activos blancos, indicador blanco, opciones completas, sin overflow horizontal y espacio de scroll para contenido. Se conserva env(safe-area-inset-bottom); no se afirma validación en teléfono físico.

APK debug: `FrontEnd_2/android/app/build/outputs/apk/debug/app-debug.apk`. Build con JDK 21, Gradle 8.14.3, SDK instalado: BUILD SUCCESSFUL, 93 tareas. El primer intento con JDK 25 fue incompatible; se repitió con JDK 21 y pasó. API de este APK: `http://192.168.1.16:10000/api/v1` (IP LAN actual del PC); recompilar si cambia. Incluye registro, barra naranja, texto S/9, login y API configurable; inspección del ZIP confirmó ausencia de secretos del servidor. Sin firma release ni instalación física.

Windows + Docker Desktop: prueba real con contenedores Linux. Debian 13: **PREPARADO/VALIDADO ESTRUCTURALMENTE PARA DEBIAN 13**, sin prueba física. No hay dependencia obligatoria de host.docker.internal ni herramientas npm/pip del host para el arranque Docker.

## Correcciones durante la validación

- Los puertos propuestos 9081/9082 ya pertenecían a V9; V10 usa 10081/10082/10000 sin detener V9.
- Fixture de rollback adaptado: S/153 genera los 17 puntos que disparan su constraint SQL. Se preservó la comprobación atómica y se repitió E2E completo.
- Fixture de canje concurrente adaptado a la regla S/9; misma cobertura y ningún test eliminado.
- Prueba visual nueva conectada al fixture API igual que las suites previas; se repitieron 36/36.
- El flujo histórico de deuda tenía textos anteriores a las correcciones críticas. Se actualizaron aserciones a Saldo pendiente/Pagado, manteniendo el importe de deuda, Payment y Transaction como evidencia real.
- Dos suites de integración se lanzaron concurrentemente contra el mismo demo; una vio el punto adicional correcto del consumo de la otra. Se repitió secuencialmente: 3/3 y 9/9, sin cambiar las reglas financieras.
- Utilidad demo y generador opcional de entorno migrados de la configuración antigua a SOLES_PER_POINT. La utilidad demo sigue el protocolo de autorización y avance persistidos.

## Seguridad y Git

Auditoría de bundles, imágenes, logs y archivos versionables completada. No se copiaron credenciales privadas de V9. Los defaults de Compose son explícitamente públicos y exclusivos de demo. Bundles no contienen KIOSK_SECRET, JWT_SECRET ni POSTGRES_PASSWORD. `.env`, node_modules, coverage, reports, APK, keystores, local.properties, .gradle y copias temporales están ignorados.

`git status --short`: V10 nueva y V8 previamente no versionada; V9 sin cambios. `git diff --stat` vacío porque V10 aún no se añadió al índice. `git diff --check` sin errores. No se ejecutó git add, commit, push ni merge.

## Verificaciones adicionales finales

Modo LAN ejecutado realmente con compose.lan.yaml: frontend1, frontend2 y Backend healthy, HTTP 200 también por 192.168.1.16. PostgreSQL/OCR permanecieron internos. Se restauró el binding local al terminar. No se afirma conexión desde un segundo dispositivo.

La utilidad demo corregida se ejecutó en un contenedor de pruebas contra la base temporal: compra S/100, 11 puntos, historial presente y Swagger 200. No se suma como otro caso de suite.

APK SHA-256: `808fa97dc81bfb3c0e4e77e03180b2e5266cd94b93dc34fa5ca903f27db90c6e`.

Estado de entrega: stack normal `primax-v10` iniciado sin `.env`, cinco servicios healthy y cuatro verificaciones HTTP 200. FuelFlow: http://localhost:10081; Prime: http://localhost:10082; API: http://localhost:10000. V9 sigue ejecutándose healthy en sus puertos originales. Los tres entornos temporales V10 y los builders de aislamiento quedaron detenidos, conservando sus volúmenes y evidencia. No hay bloqueos del gate; pruebas físicas en Debian y teléfono quedan expresamente fuera de lo afirmado.
