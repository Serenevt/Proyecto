# Validación V9 — 12 de octubre de 2026

## Resultado

Stack funcional en Docker Desktop (Windows, contenedores Linux), cinco servicios `healthy`, HTTP 200 en FuelFlow, Prime, health y Swagger. Se completaron **247 casos de prueba distintos**; las repeticiones no se suman. Los chequeos adicionales de Docker, LAN, secretos e integridad no están incluidos en ese total.

| Suite | Casos aprobados | Ejecución |
|---|---:|---|
| Backend unit | 80 | Jest, Node 22.21.1, imagen tests |
| Backend E2E | 80 | Nest + PostgreSQL reales: 49 heredados y 31 nuevos |
| FrontEnd_1 unit | 32 | node --test |
| FrontEnd_2 unit | 13 | node --test |
| FrontEnd_2 móvil | 24 | Chrome/Playwright, 360×800, 390×844, 412×915 |
| PlateRecognition | 7 | unittest, Tesseract/OpenCV reales |
| FuelFlow UI V9 | 8 | Cámara sintética, OCR real fixture, fallbacks y deuda |
| Flujo integral V9 | 1 | Compra, comprobante, deuda, recarga e historial reales |
| Integración heredada | 2 | Navegador → Nginx → Nest → PostgreSQL y seguridad proxy |
| **Total** | **247** | Sin contar ejecuciones repetidas |

Backend lint, format:check (Prettier) y build: aprobados. FrontEnd_1 build: aprobado. FrontEnd_2 build: aprobado. Python: siete pruebas y análisis sintáctico `ast.parse` aprobados; no existe un linter Python configurado. Docker build completo (incluyendo tests): aprobado. APK debug: `BUILD SUCCESSFUL`, 93 tareas; archivo de 4.156.641 bytes en `FrontEnd_2/android/app/build/outputs/apk/debug/app-debug.apk`. Sin release signing.

## Fases y evidencia

1. Base V9: copia completa verificada contra 226 hashes de V8 antes de features. Backend 71 unit + 49 E2E; FuelFlow 32 unit; Prime 13 unit + 15 mobile: 180 pruebas de base. Se resolvieron los fallos heredados de fixtures y asociación del saldo antes de avanzar.
2. Backend V9: migraciones aditivas, deuda/ledger/perfil/snapshot y 31 casos nuevos E2E. Incluyen saldo suficiente/insuficiente, consentimiento, balance no negativo, límite, FIFO, recargas menores/iguales/mayores, estados, DNI/RUC, snapshots, perfil y reintentos concurrentes. OCR agrega nueve casos unitarios sobre confianza, placa e identidad.
3. OCR: ABC-123 legible, imagen vacía, desenfocada, normalización, HTTP, entrada inválida y health. Fixture sintético; ninguna fotografía personal.
4. Interfaces: estados pendientes y liquidación en Prime; perfil persistido; FuelFlow con cámara, archivo, cancelación, loading/error, baja confianza, placa manual, tres acciones de saldo insuficiente y límite. La recarga abre el puerto Prime configurado.
5. Flujo principal ejecutado íntegramente en navegador: Diego / PRIME-0001 / ABC-123; S/5.00 → consumo S/12.60 → saldo S/0.00, deuda S/7.60, Transaction PAYMENT_PENDING, Payment PARTIAL → recarga S/20.00 → deuda S/0.00, saldo S/12.40, PAID/CAPTURED. Transacción: `99792f33-098b-45b8-92c8-dcf417606270`. La selección boleta autocompletó DNI; factura autocompletó RUC/razón social. Se guardó snapshot y se comprobó que editar el perfil no lo cambia. La ejecución original tardó 27,4 s y pasó.
6. Integración heredada: compra de S/100.00, puntos 12→112, un Payment y un RewardMovement, historial visible; segundo caso verificó restricciones del proxy. Ambos aprobados (36,9 s). Es un pago demo externo; no altera el saldo Prime final de S/12.40.
7. Repetición final V9: 9 pruebas aprobadas. Para la compra principal ya realizada se verificó su estado persistido liquidado, sin volver a gastar ni reinicializar dinero. Las otras ocho pruebas UI/OCR se volvieron a ejecutar completas. Se separó `tools/evidence/` del directorio de resultados que Playwright limpia, después de detectar que la integración heredada había eliminado el archivo de evidencia, no la transacción.
8. Docker: config local/LAN válidos; imágenes construidas, migraciones/seed terminados con código 0; cinco servicios saludables. Auditoría HTTP y secretos aprobada. Prime también arrancó aislado sin API y mostró error recuperable de login, sin inutilizar la interfaz.
9. LAN: override levantado realmente, bindings 0.0.0.0 y HTTP del host verificados para FE1/FE2/Backend; PostgreSQL 127.0.0.1 y OCR sin puerto host. Se restauró modo local. No se tocó firewall ni se probó un segundo dispositivo.
10. Integridad final: 226 archivos de V8 coinciden por SHA-256. `git diff --check` sin errores; también se revisó whitespace por comparación explícita V8/V9 en los archivos nuevos/modificados, porque V9 todavía es untracked. No se hicieron add, commit, push, merge ni limpieza destructiva.

Esquemas de la ejecución final Backend conservados:

- `e2e_3dc30f5e2b154650bd7833cc20ce7417`
- `e2e_v9_b9d851c0cee44b41a3d650958305722c`

## Correcciones verificadas

- CORS heredado esperaba siempre 8081: ahora usa el origen configurado, permitiendo 9081 sin relajar la política.
- Restricciones SQL heredadas suponían que toda autorización se financiaba con saldo: se adaptaron para crédito y ledger de liquidación, conservando límites y datos.
- Concurrencia: reintentos serializables también contemplan errores SQL 40001/40P01 y colisiones idempotentes.
- Lint: corregidos dos errores menores y repetido el pipeline completo con éxito.
- Nginx: variable de puerto de Prime añadida al filtro envsubst; rebuild, healthcheck y prueba del redirect aprobados después de corregirla.
- Una repetición del flujo financiero falló porque el archivo de evidencia había sido limpiado por otro runner, mientras la cuenta ya tenía S/12.40. Se recuperó la referencia previamente registrada, se movió fuera de outputDir y se verificó la transacción contra Backend. No se alteró el saldo para hacer pasar la prueba.

El log E2E heredado contiene una excepción de Prisma inducida por una prueba de manejo de errores; la suite completa terminó 80/80 y código 0. No se presenta como un fallo de salud del stack.

## Estado local

- FuelFlow: http://localhost:9081
- Primax Prime: http://localhost:9082
- Backend: http://localhost:3100/api/v1/health
- Swagger: http://localhost:3100/api/docs
- PostgreSQL: 127.0.0.1:5434
- OCR: interno
- Proyecto/volumen: primax-v9 / primax-v9_postgres_data
- Git desde raíz: `?? V8/` preexistente, `?? V9/` nuevo; diff --stat vacío porque ambas carpetas aún no están versionadas. El inventario comparativo está en [CHANGES.md](CHANGES.md).

## Límites de lo probado

- No hubo ejecución física en Debian 13: se validaron Dockerfiles Linux, Compose portable, rutas relativas y Node/npm fijados desde Windows Docker Desktop.
- No se usó una webcam física: sí se automatizó getUserMedia mediante stream de canvas y se procesó ABC-123 por el OCR real; la placa impresa queda para comprobación manual.
- No se instaló la APK en un teléfono/emulador. Sí se construyó debug con API del emulador `http://10.0.2.2:3100/api/v1`; las 24 pruebas móviles son de navegador, no instrumentación Android.
- No se verificó acceso desde otro equipo LAN; sí los bindings y HTTP en el host, con base y OCR protegidos.
- No se desplegó Internet/cloud ni se integró dinero real. No se entrenó un modelo OCR ni se certificó precisión industrial.

Estas son validaciones físicas/externas pendientes, no pruebas declaradas aprobadas. Todos los builds y suites disponibles del proyecto fueron ejecutados.
