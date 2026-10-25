# PeriPage A6 · agente local V11_3

## Compatibilidad y estado

La [documentación PeriPage A6](https://peripage.com.tw/a6/) publica conexión de escritorio por **USB con driver** y papel de 57 mm para la variante mostrada. No equivale a confirmar modelo, resolución o ancho imprimible de la unidad del usuario. No se presupone ESC/POS, Bluetooth web ni una impresora genérica Windows. Este adaptador usa exclusivamente la cola USB del **controlador oficial correspondiente a la etiqueta A6**, previamente comprobado. Si la unidad solo admite Bluetooth o no dispone de ese controlador compatible, este adaptador no está validado para ella.

En esta sesión `Get-Printer` devolvió EPSON82140F (L3160 Series), Microsoft Print to PDF y OneNote (Desktop), sin PeriPage. No se envió ningún trabajo a esas colas. No se ha confirmado ancho físico, resolución, longitud de avance ni salida de papel.

El agente utiliza [PrintDocument.Print](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.printing.printdocument.print?view=windowsdesktop-9.0) y [StandardPrintController](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.printing.standardprintcontroller?view=windowsdesktop-9.0) con nombre exacto de cola. Su retorno se trata como trabajo aceptado por el sistema de impresión, **no como papel físicamente confirmado**. Si el driver abre UI propia debe configurarse y verificarse en la instalación; no usarlo en compras hasta demostrar envío silencioso.

## Instalación y emparejamiento una sola vez

1. En el PC de la A6, instalar Node.js 22/24 y disponer de PowerShell 5.1, PrintManagement y System.Drawing. Conectar la A6 encendida con cable **USB de datos**. Identificar etiqueta, variante y resolución. Instalar su driver desde soporte oficial enlazado por PeriPage. No cambiar la impresora predeterminada.
2. Autorizar scripts locales mediante la política administrativa del equipo: firma o RemoteSigned de la cuenta cuando corresponda. El agente no usa ExecutionPolicy Bypass. Error real observado:

```text
No se puede cargar el archivo C:\Users\MATHIAS\Desktop\V11_3\PrintAgent\probe.ps1 porque la ejecución de scripts está deshabilitada en este sistema.
CategoryInfo: SecurityError: (:) [], ParentContainsErrorRecordException
FullyQualifiedErrorId: UnauthorizedAccess
```

3. Configurar papel continuo apropiado a la unidad, longitud personalizada y operación silenciosa. Hacer una prueba física de Windows durante instalación. Consultar la cola exacta:

```powershell
Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus
powershell.exe -NoProfile -NonInteractive -File .\PrintAgent\probe.ps1 -PrinterName 'NOMBRE EXACTO A6'
```

El probe **no imprime**. Registrar cola, driver, puerto USB, resolución, papel y `printableWidthMm`. El área útil viene de PrintableArea, convertida de centésimas de pulgada a mm. **No introducir 57 mm como ancho útil sin medirlo.** Contrastar el área con papel real. El adaptador rechaza papel mayor de 59 mm, áreas fuera de 35–58 mm y cambios mayores a 0,6 mm respecto de configuración. Compone texto negro Arial 9 pt, con ajuste de líneas y longitud continua calculada; el ancho final depende del driver confirmado.

4. Provisionar certificado HTTPS confiable con SAN localhost, por ejemplo con [mkcert oficial](https://github.com/FiloSottile/mkcert) o PKI del equipo. La CA debe ser confiable para el navegador del kiosco. No usar excepciones TLS durante ventas. Tras instalar mkcert:

```powershell
mkcert -install
mkcert -key-file localhost-key.pem -cert-file localhost.pem localhost 127.0.0.1
```

Guardar configuración, clave y datos fuera de las carpetas publicadas. Proteger con ACL de la cuenta del agente y administradores. Nunca copiar claves a frontends, imágenes web ni repositorio.

5. Crear previamente `C:\FuelFlowPrintV11_3` con ACL apropiadas. Emparejar después de verificar etiqueta A6, driver y área. `--confirm-a6` representa esa comprobación del instalador; no certifica automáticamente papel. El comando consulta la cola, rechaza puertos incompatibles y no sobrescribe configuraciones existentes:

```powershell
node .\PrintAgent\configure.mjs --printer 'NOMBRE EXACTO A6' --origin http://localhost:23081 --key 'C:\FuelFlowPrintV11_3\localhost-key.pem' --cert 'C:\FuelFlowPrintV11_3\localhost.pem' --out 'C:\FuelFlowPrintV11_3\config.local.json' --confirm-a6
node .\PrintAgent\server.mjs 'C:\FuelFlowPrintV11_3\config.local.json'
```

También puede completarse manualmente `PrintAgent/config.example.json`: cola/driver exactos, ancho confirmado y `widthConfirmed:true`. No requiere paquetes npm externos.

6. Para web desplegada, añadir su **origen HTTPS exacto** con otro `--origin https://DOMINIO-REAL` al configurar, o editar `origins` y reiniciar. El agente permanece en el PC de la A6. Cliente fijo `https://localhost:23443`; no publicar puerto LAN ni túneles. La CSP remota debe permitir `connect-src https://localhost:23443`. En Chrome, [Local Network Access](https://developer.chrome.com/blog/local-network-access) requiere permiso del sitio para conectar a loopback desde web pública; concederlo **durante instalación**, en el perfil del kiosco. Probar TLS/origen/permiso antes de atender. No se ha probado aquí un dominio remoto real ni se ha publicado la aplicación.

7. Para inicio automático, crear tarea al iniciar sesión de esa cuenta: programa con ruta absoluta de node.exe, argumentos absolutos de server.mjs y configuración, directorio PrintAgent. Ejecutar sin ventana; un lanzador puede usar `Start-Process -WindowStyle Hidden`. No iniciar dos agentes ni compartir almacén o puerto con V11_2. No se instaló una tarea en esta sesión.

## Flujo, autorización e idempotencia

Escucha solo `127.0.0.1:23443`, exige Host localhost:23443, origen exacto autorizado, JSON y cabecera X-FuelFlow-Print. No admite comodines ni cookies. Preflight restringido a GET/POST/OPTIONS y cabeceras previstas. CORS protege frente a otras webs; los procesos locales y el origen aprobado son la frontera de confianza. Configuración y claves permanecen en el PC.

El cliente consulta GET `/jobs/receipt-<transaction.id>` antes de enviar. Solo 404 o `retryable` permite POST con **el mismo ID**. Ambos botones se bloquean durante envío. El almacén guarda con escritura atómica y fsync identificador, hash y estado antes del adaptador. Rechaza contenido distinto para el mismo ID, agrupa llamadas concurrentes y conserva estado al reiniciar.

- `accepted`: terminó envío al sistema de impresión; finaliza atención, con `physicalConfirmed:false`.
- `retryable`: fallo comprobado antes del envío; permite reintentar el mismo trabajo.
- `unknown`: pudo alcanzar la cola o hubo interrupción. Consulta de nuevo, **sin reenvío automático**. Operador debe revisar cola y papel; también permite finalizar sin imprimir.

Respuesta perdida conserva ticket; reintentar consulta primero y no crea otro trabajo si ya fue aceptado. No eliminar `data-v11_3` para reintentar: contiene idempotencia y datos del comprobante. Conservarlo mientras exista posibilidad de recuperación. No hay reimpresión automática ni botón que borre el registro.

El texto proviene del comprobante existente: operación, fecha Lima, estación, surtidor 03 del simulador, placa, boleta/factura, DNI/RUC/razón social, combustible, galones, precio, descuentos, total y estado financiero, con saldo pendiente cuando existe. Tickets locales indican DEMO y sin validez fiscal. No se imprimen controles de interfaz.

## Acta física pendiente

Registrar modelo/serie/resolución, driver/versión, cola/puerto, papel y área útil; obtener foto del ticket completo. Verificar legibilidad/ajuste, alimentación, un clic sin UI, un trabajo por comprobante, finalizar sin impresión, desconexión/reintento, respuesta perdida, reinicio y permiso del navegador desde el dominio HTTPS final. Separar aceptación de cola y confirmación visual de papel. Las pruebas automáticas usan adaptadores/respuestas simuladas y **no sustituyen esta acta**.
