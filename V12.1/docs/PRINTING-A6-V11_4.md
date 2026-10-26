# PeriPage A6 USB · V11_4

## Alcance y condiciones comprobadas

El agente utiliza el **driver oficial PeriPage A6 por USB** mediante PrintDocument/System.Drawing en Windows. No usa ESC/POS, Bluetooth web, window.print, vista previa de venta, descarga ni impresora predeterminada. [PeriPage](https://peripage.com.tw/a6/) documenta USB con controlador para escritorio; la variante exacta se verifica en la instalación.

Cola `PeriPage A6(1)`, driver `PeriPage A6`, puerto `USB001`, Normal, 203 DPI y página de prueba Windows son **antecedentes aportados por el usuario**, no nuevas pruebas de esta entrega. En esta sesión Get-Printer enumera solo EPSON82140F, PDF y OneNote. No se envió ningún trabajo físico a ninguna cola.

`PrintAgent/config.local.json` y claves TLS no existían en la base copiada. No se inventó una configuración activa ni se copiaron secretos de otra versión. El ejemplo falla de forma segura hasta medir el equipo real. El frontend espera `https://localhost:24443`.

## Formato final y diferencia de anchos

PaperSize usa [centésimas de pulgada](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.printing.papersize.-ctor?view=windowsdesktop-9.0). El formato está fijado a **228 × 394**, aproximadamente **57,912 × 100,076 mm**. El rollo físico nominal es de 57 mm; las diferencias nominales y el avance real deben verificarse sobre papel. Ya no se calcula una longitud automática ni se confunde el mínimo 100 con 100 mm.

`probe.ps1` consulta primero el formato predeterminado y después aplica el formato personalizado de 100 mm. Guarda por separado ambas medidas. La configuración y las comprobaciones comparan **solo el área del formato final**, incluidos ancho, alto y origen X/Y. Por eso un ancho predeterminado de 48,05 mm no invalida automáticamente el área de 52,93 mm observada con el formato personalizado. Esos números no se fijan como medición de este equipo ausente.

[PrintableArea](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.printing.pagesettings.printablearea?view=windowsdesktop-9.0) y [HardMarginX](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.printing.pagesettings.hardmarginx?view=windowsdesktop-9.0) también vienen en centésimas de pulgada. El motor convierte a mm, intersecta el área con el papel y reserva 1 mm lateral/superior y 2 mm finales. Corrige el origen físico al dibujar; no suma dos veces el margen izquierdo de 5 mm. Se toleran diferencias de 0,6 mm del área configurada, pero se rechazan cambios de papel, cola, controlador o puerto.

Se usa [CreateMeasurementGraphics(PageSettings)](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.printing.printersettings.createmeasurementgraphics?view=windowsdesktop-9.0) con **la página personalizada**, antes de Print(), sin crear trabajos. La medición y el dibujo comparten ThermalLayout.cs. Fuentes: Arial 10 pt negrita para encabezado centrado, documento 8 pt, cuerpo 7 pt, TOTAL 9 pt negrita e importes a la derecha. Agradecimiento centrado. El espacio sobrante puede distribuirse como interlineado, hasta 35%, sin disminuir fuentes. Nombres e identificadores largos se parten por medición de glifos, sin perder caracteres.

Si el contenido mínimo supera el área de 100 mm, se devuelve `retryable` con altura requerida/disponible y **no se llama a Print()**. No se recorta información, no se reduce letra, no hay segunda página y no existe formato alternativo habilitado. El evento PrintPage repite comprobaciones con sus gráficos reales; un fallo después de iniciar Print() es `unknown` y requiere revisión, nunca reenvío automático. Un driver que ignore físicamente el tamaño solo puede descubrirse con una prueba real autorizada.

## Instalación única en el PC conectado

1. Verificar etiqueta/modelo A6, driver oficial, USB de datos y cola exacta. No cambiar la predeterminada. Revisar configuración de papel y operación silenciosa del driver. Usar Node 22/24, PowerShell 5.1, System.Drawing, System.Web.Extensions y PrintManagement. Instalar copiando **PrintAgent completo**, incluido ThermalLayout.cs, contract.mjs y config.mjs.
2. La cuenta debe poder ejecutar los scripts conforme a la política del equipo (firma o RemoteSigned autorizado por su administrador). No usar Bypass ni desactivar protecciones. Error real en esta sesión:

```text
No se puede cargar el archivo C:\Users\MATHIAS\Desktop\V11_4\PrintAgent\probe.ps1 porque la ejecución de scripts está deshabilitada en este sistema.
FullyQualifiedErrorId: UnauthorizedAccess
```

3. Ejecutar el probe **sin impresión** en el equipo físico y guardar su salida:

```powershell
powershell.exe -NoProfile -NonInteractive -File .\PrintAgent\probe.ps1 -PrinterName 'PeriPage A6(1)'
```

Registrar defaultPrintableWidthMm y las medidas finales paperWidth/Height, printableWidth/Height/Left/Top, hard margins y DPI. El probe solo confirma lo que reporta el driver, no el avance físico. Si rechaza el tamaño, detener la instalación; no pasar a 210/297 mm silenciosamente.

4. Reutilizar certificado/clave TLS existentes si siguen siendo válidos para localhost y confiables bajo el perfil del kiosco. No regenerarlos sin necesidad. Si faltan, el instalador debe provisionar un certificado local gestionado con SAN localhost, o usar [mkcert oficial](https://github.com/FiloSottile/mkcert). No copiar la CA privada, clave TLS ni configuración sensible al frontend, repositorio o paquete de entrega. No desactivar validación TLS ni pedir excepciones en cada venta.
5. Guardar la configuración y datos en una carpeta exclusiva, por ejemplo `C:\FuelFlowPrintV11_4`, con ACL para la cuenta del agente y administración. Crear esa carpeta antes de configurar. Emparejar una vez con las rutas reales de certificados existentes:

```powershell
node .\PrintAgent\configure.mjs --printer 'PeriPage A6(1)' --origin http://localhost:24081 --key 'RUTA_REAL\localhost-key.pem' --cert 'RUTA_REAL\localhost.pem' --out 'C:\FuelFlowPrintV11_4\config.local.json' --confirm-a6
node .\PrintAgent\server.mjs 'C:\FuelFlowPrintV11_4\config.local.json'
```

El configurador no imprime ni sobrescribe archivos existentes: obtiene el área final del probe y valida driver/USB/formato. `formatConfirmed:true` significa **configuración lógica comprobada**, no precisión física certificada. No copiar la configuración anterior de 48,05 mm sin repetir el probe final. Si ya existe una configuración, compararla y modificar únicamente los campos necesarios, conservando claves e historial.

El agente escucha solo `127.0.0.1:24443`, Host localhost:24443. Requiere origen exacto autorizado, JSON y X-FuelFlow-Print. Permite GET/POST/OPTIONS previstos, sin cookies ni comodines. No abrir el puerto en LAN, proxy ni túnel. Una tarea opcional de inicio de sesión puede ejecutar node con rutas absolutas, bajo la misma cuenta y sin ventana; usar `Start-Process -WindowStyle Hidden` en su lanzador. No se instaló una tarea en esta sesión.

## Web remota

La web puede alojarse remotamente; el agente debe permanecer en el PC de la A6. Añadir el **origen HTTPS real y exacto** a origins al instalar. La CSP debe permitir `connect-src https://localhost:24443`. [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access) puede exigir permiso del sitio para acceder a loopback; concederlo durante instalación en el perfil del kiosco, antes de atender ventas. Comprobar confianza TLS, permisos y conectividad entonces. No se realizó despliegue ni validación con un dominio remoto real durante esta tarea.

## Contrato, estado e idempotencia

El POST admite únicamente el contrato estructurado v2: datos de la transacción, identidad correspondiente, cantidades/importes decimales, fecha ISO, tipo, modo, método y estado. La impresora, fuentes, tamaños, copias y número de páginas no se aceptan desde la web. Se rechazan campos extra, caracteres de control, tipos inválidos, importes no canónicos, identidad cruzada y saldo pendiente etiquetado como pagado. Se conserva DEMO y la advertencia fiscal en el motor, fuera del control de quien envía.

Los antiguos POST `{id,text}` se rechazan: no se adivina el documento ni se imprime texto libre. La compatibilidad segura es la consulta de trabajos históricos: accepted y unknown siguen consultables y no se reenvían. Los archivos del almacén no se borran para migrar. Las versiones usan puertos y bases diferentes; no reutilizar data de V11_3 como almacén de pruebas de V11_4.

ID estable `receipt-<transaction.id>`. GET previo a POST, bloqueo de ambos botones durante envío y fsync/escritura atómica antes del adaptador. Un hash distinto con el mismo ID se rechaza. Un estado financiero actualizado puede cambiar el contenido: si ya existía un trabajo, nunca se fuerza un segundo comprobante ni se borra su historial para imprimir de nuevo. GET devuelve estado, error y metadatos de layout, sin datos personales del ticket ni hash.

- **accepted:** la API Windows terminó el envío. Finaliza interfaz; `physicalConfirmed:false`. No confirma papel.
- **retryable:** fallo comprobado antes del envío. Reintento con el mismo ID y contenido.
- **unknown:** posible envío o respuesta perdida. Consultar estado; no reenviar automáticamente. Revisar cola/papel con operador o finalizar sin imprimir.

La impresión no llama al endpoint que registra ventas. Antes del envío, GET `/transactions/:id` obtiene la venta confirmada y se verifican bloqueos e identidad antes y después del GET. Un fallo backend o cambio en otra pestaña conserva la operación. Finalizar sin imprimir solo limpia la operación local permitida; no borra datos PostgreSQL.

## Prueba física controlada, aún no realizada

Esta entrega **no autoriza ni ejecuta impresión física automática de prueba**. Cuando exista autorización específica:

1. Preparar una única venta DEMO confirmada o recuperar una existente; anotar ID, boleta/factura y estado real. No efectuar cobros reales.
2. Confirmar cola/driver/USB y medidas del probe. Guardar referencia de la cola y usar el mismo perfil de navegador autorizado. No probar con EPSON/PDF/OneNote.
3. Pulsar una sola vez Finalizar e imprimir. Anotar ID estable y aceptación del agente/cola por separado de la observación del papel.
4. Medir con regla ancho del rollo y avance de comienzo a fin: objetivo aproximadamente 57 × 100 mm. Verificar legibilidad, todas las líneas, RUC/DNI correctos, márgenes y que no haya otra página o diálogo.
5. Hacer el caso equivalente de factura y boleta solo bajo el alcance autorizado. Registrar foto y medidas. Si la factura no cabe, el resultado correcto es rechazo sin trabajo, no recorte.
6. Si la respuesta se pierde, consultar el ID existente. No borrar historial ni reenviar unknown. Si el driver alimenta 210/297 mm pese al formato solicitado, detener uso y consultar soporte/driver: no se habilitó una alternativa automática. Cualquier formato mayor requiere decisión y configuración explícitas posteriores.

La página Windows previa informada por el usuario no certifica la longitud física del nuevo formato. Los PNG de diagnóstico son renderizados offscreen; no sustituyen ni simulan una foto de una impresión real.
