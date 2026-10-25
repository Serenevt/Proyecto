# Resultado actual — PrintAgent HTTP local

**Validación física aprobada:** se corrigió el 403 de salud/JSON UTF-8. La primera prueba (trabajo 4) salió con recorte; el diseño se limitó a 48 mm y se hizo una segunda prueba expresamente autorizada (trabajo 5). Windows la aceptó y el usuario confirmó importe completo, letras legibles y tamaño correcto. Pasaron 329 ejecuciones de pruebas y 5 casos térmicos. El informe vigente es [RESULTADOS-FISICOS.md](final-physical/RESULTADOS-FISICOS.md).

El modo activo usa **http://127.0.0.1:25443**, sin certificados ni modificación de la confianza de Windows. Sustituye la propuesta HTTPS anterior. La configuración preparada es `PrintAgent/config.http.local.json` y mantiene **PeriPage A6(1)**, 203 DPI, formato nominal 57 × 100 mm e historial `data-v11_1_1`.

El informe HTTPS anterior se conserva en [RESULTADOS-HTTPS-HISTORICO.md](RESULTADOS-HTTPS-HISTORICO.md). Sus peticiones de autorización de certificados han quedado sin efecto.

Se implementaron restricciones de dirección, Origin, Host, métodos, encabezados, preflight y cuerpo; el frontend rechaza páginas externas y no sigue redirecciones del agente. No hay CORS abierto ni cambios de seguridad del navegador. Se conservan todos los controles de idempotencia y recuperación de estados desconocidos.

Las evidencias nuevas se guardan en [http-local](http-local): pruebas unitarias, validación completa, navegador, escucha real, certificado antes/después y verificación del origen. El diagnóstico real bloquea trabajos; las pruebas de finalización usan un adaptador simulado. Ninguna envía contenido al adaptador físico.

## Validación HTTP anterior, conservada como antecedente

| Pruebas ejecutadas | Correctas |
|---|---:|
| FrontEnd_1 | 88/88 |
| FrontEnd_2 | 27/27 |
| PrintAgent | 50/50 |
| Backend | 135/135 |
| Aislamiento del iniciador | 5/5 |
| Interfaz y HTTP real en el entorno de pruebas | 13/13 |
| Web iniciada, Chrome y Edge | 8/8 |
| **Total de ejecuciones satisfactorias** | **326/326** |
| Diseño térmico, sin impresora | **4/4 casos** |

También pasaron lint y compilación del Backend y compilación de ambas interfaces. [Resumen verificable](http-local/summary.json) · [Suite completa](http-local/validation-suite.json).

La web Docker entrega el módulo HTTP actualizado, build **V11_1.1-99b142af3099**. Se reconstruyó y recreó únicamente FrontEnd_1 de esta instancia, sin tocar los servicios o datos de otras versiones. Backend sigue respondiendo `database: up`.

Se verificó **Chrome 155.0.8059.85** y **Edge 156.0.4314.42** desde `http://localhost:26081`. En contextos sin interceptación de red, ambos completaron el preflight y GET de salud, rechazaron un origen no emparejado y mantuvieron sus controles de seguridad. `isSecureContext` fue verdadero; los permisos consultados estaban en `prompt` y no fue necesario concederlos para este recorrido entre loopbacks. No se usaron flags para saltarse CORS, LNA o certificados.

El botón azul contactó al agente real en modo diagnóstico y recibió su rechazo controlado **503**, conservando el ticket. La finalización con `accepted`, el doble clic y la persistencia de `unknown` se comprobaron contra un servidor HTTP con el mismo handler y un adaptador simulado. Para esos flujos la respuesta del Backend se simula: no se crean ventas, cobros o trabajos de Windows. [Chrome](http-local/browser-diagnostic-chrome.json) · [Edge](http-local/browser-diagnostic-edge.json) · [Preflight real](http-local/browser-cors-chrome.json).

Los almacenes **CurrentUser\Root** y **LocalMachine\Root** tienen exactamente los mismos certificados antes y después. [Comparación](http-local/certificate-stores-comparison.json). Los 466 archivos originales siguen intactos. El agente de producción queda detenido; el diagnóstico y los servidores simulados se cierran al terminar.

La validación HTTP descrita en este apartado se realizó sin impresiones físicas. Las pruebas físicas posteriores se registran por separado en el informe enlazado al inicio. HTTP local es compatible con los requisitos de esta instalación en un equipo confiable; no aporta el cifrado o la identidad criptográfica de HTTPS y se rechaza expresamente para páginas de LAN o Internet.

[Instrucciones actuales](../../README.md) · [Comparación HTTP/HTTPS y límites](../../http-local.md).
