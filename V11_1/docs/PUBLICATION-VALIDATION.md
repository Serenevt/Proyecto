# Validación de la publicación V11_4 → V11_1

Fecha: 25 de octubre de 2026. Repositorio: Serenevt/Proyecto. Rama base remota comprobada: main. Rama preparada: publicar-v11_1-desde-v11_4. V11_1 no existía en la rama remota: no se reemplazaron ni eliminaron archivos ajenos. No se fusiona el PR ni se despliega una web pública.

## Fuente y conservación del producto

Se inventariaron los archivos de trabajo actuales de V11_4 antes de copiar, fuera de esa carpeta. El inventario tiene 712 archivos relevantes con SHA-256 (excluye dependencias/cachés). Incluye nuevos archivos y modificaciones locales; V11_4 no se reemplazó por un commit remoto. Al finalizar se volvieron a verificar sus hashes, junto con V11, V11_2 y V11_3, sin cambios.

[Inventario público de contenido](PUBLICATION-CONTENT.json): **452 archivos publicables del origen**, **443 idénticos en la copia de trabajo** y **9 con ajustes exclusivos de empaquetado/documentación**. El README original se conserva literalmente en README-V11_4-SOURCE.md. Los hashes raw y de blobs Git se distinguen para no confundir normalización de fin de línea con cambios funcionales.

Son idénticos los fuentes funcionales de Backend, esquema/migraciones/seed original, FrontEnd_1/src/assets, FrontEnd_2/js/styles/index/assets, OCR y el motor/servidor/contrato de PrintAgent. Se conservan interfaces, textos, estilos, pagos y simulaciones, inventario, membresía, reconocimiento, boleta/factura, medidas/diseño térmico, cierres, recuperación, seguridad e idempotencia. La compilación sigue identificando el producto como V11_4; V11_1 es el nombre de publicación.

Ajustes sobre archivos de origen:

- Compose principal: nombre primax-v11-1, base primax_v11_1, puertos 25081/25082/25000/25025, CORS derivado de los puertos configurados y entrada protegida para el seed.
- Overrides local/LAN y entrada compatible FrontEnd_1/compose.yaml: nombres/puertos coherentes. No se usan en el recorrido básico.
- Ejemplo PrintAgent: origen http://localhost:25081. No cambia formato, puerto del agente, motor ni lógica de impresión.
- Guardia de una E2E: exige exclusivamente primax_v11_1, evitando probar accidentalmente contra V11_4.
- .gitignore y Backend/.gitignore: exclusiones privadas y conservación de .env.example seguro.
- README: instalación portable e identificación V11_4 publicada bajo V11_1.

Archivos adicionales: wrapper seed-local-demo.cjs y sus pruebas; ejecutores publication-browser.cjs y publication-smoke.cjs que adaptan solo URLs/salida de pruebas; configuración de escáner de secretos; informe, inventario y capturas de publicación. No se cambian reglas de producción, precios, descuentos, autorizaciones, despacho ni esquema.

## Primer arranque desde archivos limpios

Se exportó el índice de Git a un directorio independiente. Antes del primer arranque no había .env, configuración privada, claves TLS, node_modules, dist, www ni artefactos del equipo fuente en esa copia. Docker recibió los fuentes/lockfiles/Dockerfiles preparados para publicar.

Se comprobó que no existían imágenes propias ni volumen del proyecto nuevo **primax-v11-1-clean-20261025**. Con COMPOSE_PROJECT_NAME definido únicamente para aislar la prueba, el comando ejecutado fue exactamente:

```powershell
docker compose up -d
```

**Resultado: código 0**, sin --build, instalación manual de dependencias del proyecto, copia de .env ni migraciones ejecutadas por separado. Compose construyó las imágenes faltantes, PostgreSQL pasó su healthcheck, migrate aplicó el esquema, seed completó y backend/frontend quedaron disponibles. Pueden reutilizarse imágenes/layers base públicos de la caché Docker; no se borró ninguna imagen/volumen ajeno para simular limpieza. No se afirma haber vaciado BuildKit.

Rutas/puertos comprobados en esa copia:

| Servicio | Resultado |
|---|---|
| http://localhost:25081/src/index.html | FuelFlow servido y recorrido de ticket validado |
| http://localhost:25082/ | Prime servido, login y saldo validados |
| http://localhost:25000/api/v1/health | status ok, database up |
| http://localhost:25025/ | Mailpit DEMO local |
| PostgreSQL y OCR | Sin puertos de host publicados |

La cuenta documentada demo@primaxprime.pe / Prime123 se probó mediante login HTTP sin mostrar ni guardar su token en la publicación. La disponibilidad inicial depende de construcción y salud de servicios; no es inmediata.

Mientras el PR esté sin fusionar, clonar seleccionando la rama indicada en el README. El comando git clone de la rama predeterminada contendrá V11_1 únicamente después de que el usuario revise y fusione el PR; esta tarea no lo hace automáticamente.

## Pruebas nuevas

| Grupo | Resultado final |
|---|---:|
| Chrome contra la copia limpia | 29/29, cero omitidos/flaky |
| Unitarias FuelFlow | 77/77 |
| Unitarias Prime | 27/27 |
| Contrato/API/persistencia de PrintAgent | 25/25 |
| Backend unitarias en imagen de prueba | 135/135 |
| Backend E2E en PostgreSQL exclusivo | 237/237 |
| Guardia del inicializador de publicación | 3/3 |
| Backend lint y compilación TypeScript | Correctos |
| Layout GDI offscreen, sin trabajos físicos | 4/4 |
| Segundo up, seed repetido y reinicio | Huella de datos idéntica |
| Smoke Chrome tras reinicio | Ticket, no impresión, login y saldo correctos |
| Override de puertos/CORS/proxy por Compose config | Correcto |

Se ejecutaron npm --prefix FrontEnd_1 test, npm --prefix FrontEnd_2 test, npm --prefix PrintAgent test y node tools/test-layout-v11_4.cjs. Las dependencias host para pruebas opcionales de navegador se instalaron **después** del primer arranque; no intervinieron en la construcción/ejecución básica de Docker.

Backend se comprobó con docker compose --profile test build tests y docker compose --profile test run --rm --no-deps tests. Las 135 unitarias y 237 E2E pasaron. Lint detectó inicialmente imports/globals en el nuevo test del empaquetado; se corrigió únicamente ese test y se ejecutaron de nuevo sus 3 casos, lint y build con código 0. No se alteró producto ni se presentan resultados históricos como nuevas pruebas.

El ejecutor publication-browser.cjs copia temporalmente las pruebas originales V11_4 y sustituye solo URLs 240xx por 250xx (o las variables PUBLICATION_*). Los originales permanecen intactos. Sus casos comprobaron:

- Dos botones finales exactos y ausencia de Generar comprobante, ticket-overlay y modal DEMO.
- Prepago/pospago y boleta/factura usando transacciones DEMO reales de la base de prueba; datos del backend prevalecen sobre snapshot antiguo.
- Un solo trabajo simulado ante doble clic, consulta previa, aceptación, respuesta perdida, retryable, unknown y agente desconectado.
- Cierre sin imprimir: cero solicitudes al agente, cero POST financieros, sin descarga/ventana.
- Backend caído e intervención pendiente: ticket y operación conservados.
- Error de formato de 100 mm dentro del ticket, sin modal ni recorte.
- Prime: tarjeta inferior única con título/importe/mensaje y sin botones internos, tras login, recarga, navegación, actualización y nueva deuda; recarga separada y sincronización 20 → 40 → 30.
- Stock, cámaras sintéticas/revisión, membresía, Yape/Plin DEMO, cancelación y recuperación.
- HTML/JS actualizados y ausencia de service worker en los orígenes probados.

Los casos de impresión del navegador usan respuestas/adaptador simulados. El código publicado no incorpora un modo de impresión falso. El render GDI usa System.Drawing real sobre bitmap a 203 DPI y el mismo ThermalLayout.cs: boleta 71,84 mm, factura 78,16 mm y boleta estrecha 74,75 mm mínimos frente a 97,08 mm útiles del fixture; documento largo 136,09 mm rechazado. No certifica un driver ni papel físico. Los streams de cámara sintéticos tampoco certifican hardware real.

## Persistencia sin restablecer datos

Se calculó una huella SHA-256 de los datos completos de todas las tablas públicas, ordenados canónicamente, sin publicar datos, hashes de contraseña ni sesiones. Se comparó antes/después de:

1. Ejecutar otra vez docker compose up -d.
2. Ejecutar de nuevo el seed con la misma imagen/cuenta.
3. Reiniciar únicamente postgres, backend, frontend1, frontend2, OCR y Mailpit del proyecto de validación.

La huella permaneció idéntica: **18 transacciones / 20 pagos / 13 deudas** en la base DEMO de publicación. Incluye clientes/operaciones creados por las pruebas, no ventas reales. Esto comprueba que no se restablecieron contraseñas, saldos, inventario ni registros existentes.

Después del reinicio, publication-smoke.cjs volvió a abrir el mismo ticket, finalizó sin imprimir con cero solicitudes al agente/POST financieros, hizo login en Prime y recargó la página conservando S/30 de deuda del cliente de prueba. Los seis servicios volvieron saludables. Mailpit es una bandeja DEMO local; no se promete persistencia de su buzón ni entrega SMTP externa.

## Seguridad y revisión del contenido

[Categorías/rutas omitidas](PUBLICATION-EXCLUSIONS.md): dependencias/builds/cachés regenerables, logs, sesiones y JSON de ejecuciones locales, inventarios de equipos, configuración privada, claves/certificados privados, bases/dumps e historiales de impresión. El documento académico PDF con datos personales queda fuera; no es requisito del sistema ni se modificó en la fuente. Se conserva documentación técnica, pruebas, fixtures de OCR y evidencia DEMO publicable.

Se ejecutó Gitleaks con salida totalmente redactada. La revisión inicial detectó 66 falsos positivos, todos hashes SHA-256 del manifiesto histórico v10_2. La excepción AND se limita a los dos archivos de manifiesto revisados y valores de exactamente 64 dígitos hexadecimales; no excluye código/configuración del análisis. Resultado final: **cero hallazgos de secretos**. Los valores DEMO de Compose son ejemplos públicos locales, no credenciales comerciales. No se distribuyen claves TLS, tokens GitHub ni configuración sensible del equipo.

Se revisó el diff y se verificó que todos los cambios están bajo V11_1/. El chequeo de whitespace señala tres líneas ya existentes en la fuente (Gradle, configuración Playwright y documentación); se conservaron para no reformatear el producto sin necesidad. No hubo eliminaciones remotas ni cambios en otras carpetas.

## Capturas y preparación de impresión física

Capturas nuevas tras ejecutar/reiniciar la publicación: [Ticket](publication-screenshots/ticket-after-restart.png), [Prime](publication-screenshots/prime-after-restart.png), [error inline](publication-screenshots/ticket-error-inline.png). Diagnóstico GDI nuevo: [boleta](publication-screenshots/boleta-layout.png), [factura](publication-screenshots/factura-layout.png). Son datos DEMO; las imágenes de layout no son fotografías de papel.

No se imprimió físicamente, no se efectuaron cobros reales ni se publicó una aplicación en Internet. Compose no instala el driver, configura la cola USB, establece confianza TLS ni arranca un agente Windows dentro de los contenedores. El agente mantiene localhost:24443; autorizar el origen publicado localhost:25081 durante instalación en una carpeta/configuración propias. La aplicación funciona sin él y conserva el error inline y el cierre sin impresión.

[README](../README.md) y [guía A6 original](PRINTING-A6-V11_4.md) describen instalación del controlador, probe del formato final, certificados locales, origen, arranque, diagnóstico y prueba física controlada. La aceptación del sistema no confirma papel. La precisión física de 100 mm, permisos/TLS del navegador final, unidad A6 real y validez fiscal siguen pendientes. Los comprobantes conservan DEMO / Sin validez fiscal / No validado por SUNAT.

## Repetición de las pruebas

Tras arrancar Compose, las pruebas backend pueden ejecutarse con el perfil test. Las pruebas host opcionales requieren Node 22/24, npm ci en FrontEnd_2 y Chrome instalado:

```powershell
npm --prefix FrontEnd_2 ci
node tools/publication-browser.cjs
node tools/publication-smoke.cjs
node tools/test-layout-v11_4.cjs
```

El último comando necesita Windows/System.Drawing, pero no impresora ni PrintDocument.Print. Los JSON de sesiones/resultados generados quedan ignorados; no publicarlos. Los verificadores históricos de versiones anteriores requieren sus checkouts/baselines y no se ejecutan como parte de esta validación. No se creó sincronización permanente en segundo plano.
