# Validaci?n V11 ? 2026-10-22 (America/Lima)

**V11 NO LISTA PARA VALIDACI?N FINAL**

## Estado de los 22 puntos solicitados
1. V11 creada exclusivamente desde V10_2 local; ninguna fuente V8/V9/V10 se us? para construirla.
2. V10_2: 1356 archivos del manifiesto inicial verificados SHA-256, cero cambios. Ver source-verification-v11.json y tools/verify-v10_2.cjs.
3. Estructura: FrontEnd_1, FrontEnd_2, Backend, PostgreSQL, compose.yaml, docs; PlateRecognition y tools conservados como servicios/herramientas necesarios.
4. Backend NestJS preparado para Vercel; no desplegado ni probado p?blicamente. Ambos proxies admiten BACKEND_UPSTREAM HTTPS; APK/static Prime admite PRIME_API_BASE_URL.
5. PostgreSQL local operativo en volumen propio V11; DATABASE_URL gestionada y override preparados, no conectados a una BD online real. Migraciones aditivas aplicadas; no reset ni borrado.
6. Recuperaci?n: SMTP configurable heredado, cuenta inexistente devuelve mensaje solicitado, hashes/expiraci?n/intentos/uso ?nico/bcrypt. Mailpit SMTP probado; Gmail/Hotmail reales no probados.
7. OCR placa y membres?a: API valida Membership y Vehicle; OCR ofrecido solo en postpago. PRIM001/PRIM999/PRIM001A soportados; ingreso manual conservado.
8. OCR: ROI de texto, grayscale, CLAHE, bilateral denoise, sharpening, threshold adaptativo, perspectiva, variantes de rotaci?n, escalado, tres frames y consenso. Fixtures sint?ticas pasan; no se afirma validaci?n con tarjetas f?sicas o tel?fonos reales.
9. Efectivo sigue simulado.
10. Tarjeta sigue simulada NFC/POS.
11. Yape: adaptador Culqi, intent persistido y confirmaci?n por API; pruebas con proveedor simulado, no sandbox comercial.
12. Plin: mismo contrato de proveedor e idempotencia; sin validaci?n comercial.
13. QR exclusivamente para Yape/Plin; QR decorativo eliminado; bot?n consulta estado, no acredita dinero.
14. Postpago web?Prime: deuda persistida, tarjeta PAGO PENDIENTE FUELFLOW, monto/estaci?n/veh?culo/combustible/fecha; pago y polling. Liquidaci?n proveedor?PostgreSQL probada con mock. APK f?sica y servicio p?blico no probados.
15. Bono S/10: disponible para registros nuevos, >50 estricto, persistente/concurrente en POSTPAGO. **PREPAGO pendiente**; no se afirma completitud de este requisito.
16. Puntos: 1 cada S/9 netos cuando se aplica bono; historial existente sin recalcular.
17. Inventario: FuelInventory por estaci?n/combustible, panel desde API, d?bito por delta de galones?litros, CHECK+UPDATE transaccional; insuficiencia y concurrencia probadas.
18. Docker: seis servicios saludables. Puertos 21081/21082/21000/21025; vol?menes aislados V11. No se detuvieron/eliminaron servicios de versiones previas.
19. Android: APK debug compilado (93 tareas Gradle). URL marcador https://api.example.invalid/api/v1; **no usar como APK de producci?n**. Falta reconstruir/probar con API p?blica real y dispositivo.
20. Tests: **476 heredados adaptados a reglas V11 + 36 nuevos = 512 aprobados**, sin contar reejecuciones como tests nuevos. Desglose abajo.
21. Fallos/limitaciones restantes: bono en prepago, recuperaci?n autom?tica de intentos CREATING tras timeout externo, expiraci?n/cancelaci?n/reembolso de pagos, adaptaci?n/registro de webhook comercial y validaci?n p?blica/dispositivo. La instalaci?n heredada report? vulnerabilidades npm (Backend: 36 high); no se realiz? una actualizaci?n mayor sin validaci?n. No es correcto reducir todos los pendientes a credenciales.
22. Pendientes externos: cuenta/credenciales Culqi sandbox y producci?n con billeteras habilitadas, SMTP real/remitente verificado, proyecto/dominio backend HTTPS, PostgreSQL gestionado y hosting OCR si se quiere despliegue online. No se probaron pagos reales ni correo externo.

## Evidencia de pruebas (sin doble conteo)
| Grupo | Heredados | Nuevos | Total aprobado |
|---|---:|---:|---:|
| Backend unitarios | 126 | 9 | 135 |
| Backend E2E PostgreSQL | 193 | 6 | 199 |
| FuelFlow unitarios | 54 | 2 | 56 |
| Prime unitarios | 26 | 0 | 26 |
| Prime UI responsive | 45 | 0 | 45 |
| Browser V9/V10 adaptados V11 | 22 | 0 | 22 |
| Registro/compra entre interfaces | 3 | 0 | 3 |
| OCR Tesseract/OpenCV | 7 | 4 | 11 |
| Smoke V11 sobre API/PostgreSQL | 0 | 15 | 15 |
| **Total** | **476** | **36** | **512** |

La ejecuci?n E2E completa aprob? 198 tests; posteriormente se a?adi? y ejecut? la sexta prueba de proveedor en una ejecuci?n focalizada de 6/6. El total ?nico E2E es 199. Las pruebas de proveedor usan un mock expl?cito, no una cuenta Culqi sandbox.
Pruebas heredadas actualizadas: Yape/Plin ya no se esperan capturados por simulaci?n; correo inexistente ahora debe informar el error requerido; fixtures agregan stock real; OCR prepago ahora est? oculto; fixture identidad elimina pasaporte al asignar DNI. No se eliminaron suites v?lidas.
Logs locales (ignorados por git): Backend/test-v11.log, docker-tests-v11.log, e2e-final-v11.log, provider-tests-v11.log, FrontEnd_1/test-v11.log, FrontEnd_2/test-v11.log, FrontEnd_2/ui-v11.log, browser-integrated-v11.log, browser-e2e-v11.log, ocr-tests-v11.log, smoke-v11.log, FrontEnd_2/android-v11.log.
Builds Backend/FuelFlow/Prime, lint Backend, migraciones y docker compose ps comprobados. git diff --check ejecutado sin errores (avisos CRLF de cambios previos en V10).

## Incidencia de aislamiento de pruebas
La primera ejecuci?n de navegador heredada conserv? el fallback API :10000 mientras las interfaces apuntaban a V11. Dos pruebas crearon cuentas/veh?culos sint?ticos en la instancia Docker V10 antes de fallar. Se detuvo la ejecuci?n y se fijaron PORT=21000 y MAILPIT_PORT=21025, adem?s de los puertos V11 de interfaces; la nueva ejecuci?n aprob? 22/22. No se borraron esos registros. Los archivos V10 y V10_2 no fueron modificados por este trabajo. Esta incidencia impide afirmar que no hubo ning?n efecto sobre datos de una versi?n anterior.

## Seguridad y alcance
No .env con credenciales creado ni incluido; solo ejemplos. Claves de backend no se incluyen en los bundles web. APK, keystores, caches y backups ignorados. No commit, push ni merge. No publicaci?n. Los reportes V8/V9/V10 copiados son evidencia hist?rica y no certifican V11.
Ver DEPLOYMENT-V11.md para instalaci?n, l?mites del proveedor y referencias oficiales.
