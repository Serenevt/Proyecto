# Resultado de V11_1.1 — 25 de octubre de 2026

La nueva versión está en `C:\Users\HP\Desktop\V11_1.1`. El proyecto original `C:\Users\HP\Desktop\Prueba\V11_1` permanece sin cambios: los 466 archivos se copiaron y verificaron por SHA-256, y la revisión posterior encontró cero archivos originales modificados o faltantes. [Evidencia](copy-verification.json).

## Cambios implementados

- El botón azul **Finalizar e imprimir** usa el agente exclusivo de esta versión, `https://localhost:25443`. Solo finaliza con estado `accepted` y el identificador correcto; rechaza respuestas malformadas, estados inesperados y confirmaciones de otro ticket.
- Se conserva la consulta de la transacción confirmada al Backend. Imprimir no crea otra venta ni otro cobro. La factura usa el RUC y razón social confirmados; la boleta usa DNI y no arrastra datos de factura.
- La comunicación exige HTTPS, Host local exacto, origen autorizado, cabeceras y preflight limitados. El servidor se enlaza exclusivamente a 127.0.0.1, con TLS 1.2 mínimo. La configuración antigua no es compatible por accidente.
- La configuración y el adaptador exigen 203 × 203 DPI, cola/driver/USB confirmados e historial `data-v11_1_1` propio. El probe y las comprobaciones no crean trabajos.
- El formato es **57 × 100 mm nominales**, representado por **224 × 394 centésimas de pulgada**, es decir **56,896 × 100,076 mm**. Se corrigió el ancho heredado de 57,912 mm. Se mide, ajusta el texto y rechaza el exceso antes de enviar; no hay segunda página ni impresora alternativa.
- Se conserva la idempotencia por `receipt-ID`, persistencia antes del adaptador, bloqueo de doble clic, recuperación tras reinicio y reconciliación después de una respuesta perdida. Un resultado `unknown` nunca se reenvía automáticamente.
- **Finalizar y no imprimir** funciona sin contactar al agente ni crear registros financieros.
- El modo diagnóstico bloquea el acceso a trabajos y permite comprobar únicamente la comunicación. Hay scripts de inicio, diagnóstico y validación dentro de la copia.

## Pruebas nuevas satisfactorias

| Comprobación | Resultado |
|---|---:|
| FrontEnd_1 | 82/82 |
| FrontEnd_2 | 27/27 |
| PrintAgent: contrato, cola simulada, persistencia, TLS y diagnóstico | 40/40 |
| Backend unitario | 135/135 |
| Aislamiento del iniciador | 5/5 |
| Chrome: botones, factura, desconexiones y reconciliación | 9/9 |
| **Total de pruebas automáticas** | **298/298** |
| Diseño térmico GDI a 203 DPI | **4/4 casos** |
| Backend lint y compilación; compilación de ambos frontends | Correctos |

La suite `node tools/validate-v11_1_1.cjs` pasó completa; la prueba del iniciador se ejecutó también por separado tras su ajuste final. Los registros se guardan en esta carpeta. No se ejecutó la batería histórica E2E contra PostgreSQL; las pruebas de interfaz usan Backend/agente simulados y las comprobaciones de servicios reales usan solamente GET.

La boleta requiere aproximadamente **71,84 mm** de contenido y la factura **78,16 mm**, dentro de **97,08 mm** disponibles. Una boleta con ancho útil reducido a 48,05 mm también cabe. El caso de texto excesivo requiere **136,09 mm** y se rechaza. Se verificaron límites, una sola página, encabezado, total y agradecimiento. [Mediciones](layout-results.json) · [Boleta](layout/boleta-51_926.png) · [Factura](layout/factura-51_926.png) · [Captura de interfaz](ticket-factura.png).

## Ejecución real y aislamiento

Backend y las dos interfaces arrancaron correctamente. La salud respondió `database: up`; ambas interfaces entregan release `V11_1.1`, módulos nuevos y HTML/JS sin caché persistente. [Comprobación HTTP](running-services.json).

| Recurso | Nueva versión |
|---|---|
| Proyecto Compose | primax-v11-1-1 |
| Base PostgreSQL | primax_v11_1_1 |
| Volumen | primax-v11-1-1_postgres_data |
| FuelFlow / Prime | 26081 / 26082 |
| Backend / Mailpit | 26000 / 26025 |
| PrintAgent | 25443 |

Todos los puertos publicados se limitan a loopback. PostgreSQL y OCR no publican puertos. El iniciador rechaza puertos antiguos, otra base, un Backend externo y proveedores de pago/correo/OCR externos. Permite volver a iniciar la instancia propia sin confundir sus puertos con procesos ajenos.

Backend y frontends tienen imágenes construidas desde esta copia. Para OCR se reutilizó una imagen local cuyo contenido relevante coincide por SHA-256 con los ocho archivos de fuentes, requisitos y fixture de la copia; se añadió solamente una etiqueta nueva. No se cambiaron las etiquetas antiguas. La construcción completa inicial se interrumpió durante descargas y se completó la construcción necesaria de Backend, migrate y seed con caché. [Comparaciones de imágenes](base-image-comparison.json).

Solo se inicializó la base nueva y su esquema privado. No se eliminaron datos o volúmenes ni se ejecutaron resets, migraciones destructivas, pagos reales, impresiones físicas o `git push`. Los servicios y volúmenes de versiones anteriores no se modificaron. La nueva instancia web queda iniciada; PrintAgent de producción queda detenido.

## A6, certificado y validación pendiente

El probe real confirmó `PeriPage A6(1)`, driver `PeriPage A6`, `USB001`, estado Normal y 203 × 203 DPI. Para el formato final midió área útil **51,926 × 100,099 mm**, origen horizontal **5,005 mm**. [Probe](printer-probe.json).

Se prepararon `PrintAgent/config.local.json`, certificado localhost y clave privada nuevos. La carpeta privada tiene ACL exclusiva de la cuenta actual, SYSTEM y administradores y está excluida de Git. No se copiaron claves de otras versiones ni se sobrescribieron secretos.

La comprobación del servidor real en modo diagnóstico completó TLS con validación explícita de certificado y GET `/health`, con **cero solicitudes de trabajos y cero impresiones**. [Diagnóstico](print-diagnostic.json).

**Pendiente: autorización para confiar en el certificado público únicamente en el perfil actual de Windows (`Cert:\CurrentUser\Root`).** No se ha cambiado ese almacén. El certificado es `CN=FuelFlow V11_1.1 localhost`, caduca el **25/10/2027** y su huella SHA-256 es:

```text
77:0A:A0:AA:EF:FE:5D:E4:B9:8B:37:47:EC:8F:2F:9D:C8:72:F8:41:A0:96:4A:36:90:EE:FD:B0:76:5A:F7:DF
```

El script `tools/trust-print-certificate-v11_1_1.ps1` permite revisar ese certificado y verifica su huella. Su opción `-ConfirmCurrentUserTrust` requiere autorización específica antes de ejecutarse. No instala claves privadas ni toca LocalMachine. Hasta completar la confianza, el navegador puede rechazar la conexión de impresión aunque el diagnóstico con certificado explícito funcione.

**La validación física sigue pendiente.** No se imprimió ninguna hoja. La aceptación de Windows no confirma papel; deben comprobarse posteriormente legibilidad, ancho y avance real de 100 mm con una única prueba expresamente autorizada. No se certifica facturación SUNAT: los comprobantes conservan DEMO / Sin validez fiscal.

## Instrucciones y fuentes técnicas

El [README principal](../../README.md) contiene los comandos para iniciar Backend, FrontEnd_1, FrontEnd_2 y PrintAgent, detener la nueva instancia conservando datos y repetir las pruebas seguras.

La conversión de unidades sigue [PaperSize de Microsoft](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.printing.papersize.-ctor?view=windowsdesktop-9.0). La integración mantiene los permisos de acceso local del navegador documentados por [Chrome](https://developer.chrome.com/blog/local-network-access). PeriPage ofrece [variantes A6 de 203 y 304 DPI](https://www.peripageglobal.com/collections/a6); esta instalación se verificó a 203 DPI mediante el driver local.
