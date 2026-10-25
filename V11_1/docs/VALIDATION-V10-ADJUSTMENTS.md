# Validación de los dos ajustes de V10 — 21/10/2026

Estado: **V10 LISTA PARA MERGE**. Solo cambios dentro de V10. Sin commit, push, merge, cloud ni deploy. V8 permanece como carpeta previamente no versionada; V9 no tiene cambios. No se creó V11 ni se eliminaron volúmenes.

## Cambios

- Membership: el generador del registro usa `MembershipNumberCounter` en PostgreSQL. Un UPDATE bloquea la fila hasta confirmar la transacción completa de User + Membership. El contador también revierte si falla el registro. Se mantiene el índice UNIQUE de Membership.number y se omiten códigos ocupados sin modificar registros históricos. Secuencia: PRIM001…PRIM999, PRIM001A…PRIM999A, PRIM001B…; después de Z sigue AA.
- Saldo insuficiente: FrontEnd_1 muestra disponible, total y faltante, con exactamente «Ya recargué» y «Registrar saldo pendiente». El segundo se deshabilita si Backend informa que excede el límite de deuda. Se mantiene el estilo existente y se comprobó el diálogo a 390×844 sin overflow.
- «Ya recargué» vuelve a solicitar la autorización al Backend con el operationId persistido. Backend bloquea y relee la membresía en PostgreSQL: si alcanza, reserva y permite continuar; si no alcanza, devuelve los importes actualizados. No hay polling automático.
- «Registrar saldo pendiente» usa el allowDebt y el circuito existente de autorización, consumo, Payment y MembershipDebt. Backend calcula el faltante. No se agregó otro sistema financiero. Ambos botones bloquean dobles clics durante la petición; se conservan los reintentos y la recuperación existentes.
- FrontEnd_2 no contiene este diálogo de pago. Conserva su interfaz blanca/naranja, barra inferior, estados de deuda e historial y flujo de recarga.

## Suites finales

| Suite | Anteriores V10 | Nuevas | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|---:|---:|
| Backend unitarias | 108 | 8 | 116 | 0 | 0 |
| FuelFlow | 49 | 0 | 49 | 0 | 0 |
| Prime | 25 | 0 | 25 | 0 | 0 |
| Mobile/browser | 36 | 0 | 36 | 0 | 0 |
| OCR en contenedor | 7 | 0 | 7 | 0 | 0 |
| Backend E2E PostgreSQL | 112 | 10 | 122 | 0 | 0 |
| Docker/integración navegador | 12 | 6 | 18 | 0 | 0 |
| **Total** | **349** | **24** | **373** | **0** | **0** |

No se suman reejecuciones ni verificaciones ad hoc. Se conservan todos los casos anteriores: se actualizó la expectativa del formato Membership y las expectativas de acciones del diálogo al nuevo requisito. El caso de la opción retirada comprueba ahora el cierre por Escape; los nuevos casos comprueban exactamente dos botones. No se eliminaron pruebas para obtener verde.

Cobertura nueva: los seis códigos exigidos, límites Z/AA, persistencia histórica, colisión con código ocupado, cuatro registros simultáneos, reconsulta con saldo insuficiente/actualizado/suficiente, errores de conexión, doble clic y bloqueo durante la consulta, operación estable, deuda parcial y liquidación posterior. Las suites anteriores cubren adicionalmente FIFO con liquidación parcial, saldo cero/PENDING, manipulación, rollback, idempotencia, recuperación, login, Vehicle, OCR y puntos S/9.

Flujo real repetido con cuenta sintética nueva: saldo S/5.00, compra S/12.60, pendiente S/7.60, Payment PARTIAL y Transaction PAYMENT_PENDING; recarga S/20.00, saldo final S/12.40, pendiente cero, Payment CAPTURED y Transaction PAID. Evidencia financiera local en `tools/evidence/v10-flow-<membershipId>.json`; captura móvil en `tools/evidence/v10-balance-mobile.png` (archivos ignorados).

Esquemas E2E finales preservados: `e2e_e8d78261c2a346889b496f076cb611a7`, `e2e_v9_6edce78ad6dc4178918618206d4f8528`, `e2e_register_d071847b95e9460f9e7c7a5f5f8a76b8`.

## Comandos y comprobaciones

- `docker compose up -d --build`: compilación e incorporación automática de la migración, sin reset de base ni preparación manual.
- `docker compose --profile test run --build --rm --no-deps tests`: 116 unitarias, 122 E2E, lint y build Backend aprobados. E2E crea esquemas separados y los conserva.
- `npm.cmd test` y `npm.cmd run build` en ambos frontends: aprobados.
- `npm.cmd run test:mobile`: 36/36 en 360×800, 390×844 y 412×915.
- `docker compose exec -T plate-recognition python -m unittest -v test_ocr`: 7/7.
- `node FrontEnd_2/node_modules/@playwright/test/cli.js test --config tools/playwright.v9.cjs`: 15/15; repetición dirigida del diálogo móvil: 6/6.
- `node tools/run-integration.cjs --docker`: 3/3, incluido registro → login → Vehicle → FuelFlow → Prime y recuperación/idempotencia contra PostgreSQL.
- **`docker compose up -d`**: aprobado sin pasos preparatorios extra. Migración y seed terminan correctamente; cinco servicios principales healthy. Snapshot de diez tablas idéntico antes/después del arranque, con un único usuario demo, PRIME-0001 y ABC-123.
- `tools/check-lan.cjs`: HTTP correcto por LAN 192.168.1.9 para ambos frontends y Backend, PostgreSQL/OCR internos; bindings locales restaurados.
- `npm.cmd run android:debug`: BUILD SUCCESSFUL, JDK 21, Gradle 8.14.3, 93 tareas. API del APK: `http://192.168.1.9:10000/api/v1`. `tools/check-android.py` aprobado sobre el APK nuevo. Sin prueba en teléfono físico.
- APK SHA-256: `5fb4965ce7463518144c3c80e83251622e61a2196e143653e0737a61551589dc`.
- `git status`, `git diff --stat` y `git diff --check` ejecutados. Diff sin errores de espacios. Los cambios de aplicación, migración, pruebas y evidencia están exclusivamente en V10; V8 ya aparecía como no versionada al iniciar.

## Incidencias resueltas durante la validación

Docker Desktop estaba detenido y se inició. Dos aserciones nuevas confundían la representación decimal `7.6` con `7.60`: se corrigieron para comprobar el mismo importe. La prueba histórica del flujo apuntaba a evidencia de otra base; ahora ejecuta el flujo completo con una cuenta sintética nueva cada vez, sin alterar dinero demo ni reutilizar evidencia ajena. Se usó una contraseña de fixture válida para el alta nueva. Una espera OCR excedió 5 segundos durante carga simultánea y pasó al repetir la suite completa. Los errores SQL de los casos de rollback son intencionales. Ninguno de estos fallos permanece en las ejecuciones finales.
