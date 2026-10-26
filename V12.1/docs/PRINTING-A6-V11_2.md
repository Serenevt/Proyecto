# Impresión local PeriPage A6 — V11_2

Estado a 2026-10-24: integración de software implementada y probada con adaptador simulado. **No se certifica impresión física A6**, controlador, ancho efectivo ni confianza TLS/permisos en el equipo final. La consulta `Get-Printer` de esta sesión devuelve acceso denegado. No se instaló software, certificados ni tareas en Windows. No hay alternativa con diálogo, descarga o selección de otra impresora.

## Compatibilidad comprobada y alcance

La [página de PeriPage A6](https://peripage.com.tw/a6/) documenta impresión de escritorio por USB con controlador y rollos de 57 mm para la variante publicada. Esto respalda una integración con el driver de Windows; **57 mm es ancho de papel, no ancho imprimible**. Hay distintas variantes A6/resoluciones. No se infiere que todas compartan driver, puerto, área o protocolo. Para el equipo final se debe usar el controlador oficial correspondiente a su etiqueta/modelo, accesible desde el enlace de descarga de esa página o desde el soporte del fabricante/proveedor.

No se usa ESC/POS, Bluetooth web ni protocolos privados. La ruta implementada requiere Windows, A6 por **USB de datos**, su cola/controlador oficial y spooler operativo. Android/APK, macOS y conexión exclusivamente Bluetooth quedan fuera de este adaptador. Si el equipo final difiere, hace falta otro adaptador validado para esa plataforma; no se presenta éste como compatible con ella.

El agente usa [PrintDocument.Print](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.printing.printdocument.print?view=windowsdesktop-9.0), con cola explícita y [StandardPrintController](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.printing.standardprintcontroller?view=windowsdesktop-9.0), sin UI de impresión. El driver recibe gráficos/texto GDI; el navegador no imprime. La aceptación de Windows no equivale a papel impreso. Un driver que muestre UI propia requiere configuración silenciosa del fabricante y validación física antes de usarlo en atención.

## Instalación única en el equipo conectado

1. Instalar Node.js 22 o 24 y disponer de Windows PowerShell 5.1, .NET Framework/System.Drawing y módulo PrintManagement. Ejecutar bajo una cuenta con permisos para consultar esa cola y enviar trabajos, sin necesidad de dar administración a la aplicación web.
   Revisar `Get-ExecutionPolicy -List`: los scripts locales deben estar autorizados por la política del equipo (por ejemplo RemoteSigned del usuario o firma corporativa). No se omite la política con Bypass. En esta sesión `-File print.ps1` fue bloqueado porque la ejecución de scripts está deshabilitada; el administrador debe resolver ese requisito en el equipo final.
2. Conectar la A6 encendida por USB de datos; instalar su driver oficial. No cambiar la impresora predeterminada del sistema. Configurar papel continuo de la anchura correspondiente a la unidad, sin ajuste a A4, etiquetas ni escalado. Comprobar en las propiedades del driver que admite largo personalizado continuo. Ajustar el avance final según las instrucciones incluidas con ese controlador.
3. Identificar el nombre exacto de la cola y del driver, y su puerto USB. Hacer una prueba de Windows con esa cola para verificar conexión. No elegir impresora durante las compras.

Desde V11_2:

```powershell
Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus
powershell.exe -NoProfile -File .\PrintAgent\probe.ps1 -PrinterName 'NOMBRE EXACTO A6'
Copy-Item .\PrintAgent\config.example.json .\PrintAgent\config.local.json
```

`probe.ps1` no imprime: obtiene ancho de papel, área imprimible, resolución y cola del driver. [PrintableArea](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.printing.pagesettings.printablearea?view=windowsdesktop-9.0) se expresa en centésimas de pulgada; el script convierte a mm. Anotar su salida y la etiqueta/resolución de la unidad en el acta de validación física. Una consulta fallida no confirma un ancho.

4. Editar `PrintAgent/config.local.json`: `printerName`, `driverName`, `printableWidthMm` con el resultado **de esa unidad y driver**, `widthConfirmed: true` tras contrastar la configuración, y `origins` con el origen exacto de FuelFlow (esquema, host y puerto, sin barra final). Para local: `http://localhost:22081`; para remoto: su origen **HTTPS real**. No usar `*`, `null` ni orígenes de terceros. El agente rechaza una anchura sin confirmar y cualquier papel mayor que 59 mm en el adaptador.

5. Provisionar TLS local. Puede usarse [mkcert oficial](https://github.com/FiloSottile/mkcert), instalado por el administrador desde su distribución oficial:

```powershell
Set-Location 'C:\Users\MATHIAS\Desktop\V11_2\PrintAgent'
mkcert -install
mkcert -key-file localhost-key.pem -cert-file localhost.pem localhost 127.0.0.1
```

La CA debe ser confiable para el navegador y la cuenta del kiosco. Proteger la clave privada y la CA local; nunca copiarlas al frontend, contenedor web ni repositorio. No compartir la clave raíz de mkcert. También se puede usar un certificado local gestionado con SAN `localhost` y clave PEM. Renovar antes de caducar. No desactivar validación TLS ni pedir excepciones durante una compra.

6. Proteger la carpeta del agente/configuración/claves y `data` con ACL del usuario de ejecución; guardar los datos fuera de cualquier raíz publicada por el servidor web. Por ejemplo, crear `data` y quitar herencia, concediendo acceso al usuario de ejecución y al administrador que lo mantiene. Los trabajos incluyen datos del comprobante; son registros de idempotencia y no deben borrarse mientras el comprobante pueda reintentarse. `.gitignore` excluye configuración local, claves y datos.

## Arranque y conexión desde la web

```powershell
Set-Location 'C:\Users\MATHIAS\Desktop\V11_2'
node .\PrintAgent\server.mjs .\PrintAgent\config.local.json
```

No requiere `npm install`: utiliza módulos de Node y Windows. Se inicia en **el PC de la A6**, aunque FuelFlow esté alojado remotamente. Escucha sólo IPv4 loopback `127.0.0.1:22443`, URL de cliente fija `https://localhost:22443`. No publicar puerto, proxy, túnel ni regla de acceso LAN. En el equipo final verificar que `localhost` resuelve a IPv4; la integración no abre escucha IPv6 ni interfaces de red.

Al arrancar ejecuta el probe sin imprimir y rechaza la instalación si PowerShell está bloqueado, faltan permisos de cola o no coinciden driver/puerto/área. No crea trabajos para un agente que no consigue arrancar.

Para arranque automático, crear una tarea del Programador de tareas al iniciar sesión de la cuenta del kiosco: programa la ruta absoluta de `node.exe`, argumentos con rutas absolutas a `server.mjs` y `config.local.json`, directorio de inicio `PrintAgent`, sin ventana (`Start-Process ... -WindowStyle Hidden` si se utiliza un lanzador). Esa cuenta debe tener acceso a la cola, certificados y archivos. No crear dos instancias ni compartir `data` entre agentes. El puerto impide una segunda instancia activa en ese equipo. No se creó una tarea en esta sesión.

La página remota debe usar HTTPS; su CSP debe permitir `connect-src https://localhost:22443` además de su API. El agente aplica origen exacto, Host exacto, cabecera personalizada y JSON; no usa cookies, claves de impresora ni credenciales en el frontend. CORS impide solicitudes de otros sitios desde navegadores; el equipo y los procesos locales se consideran confiables. No es un servicio público ni una API de impresión accesible por LAN.

Chrome/Edge pueden exigir permiso inicial de acceso a red/local loopback. Debe concederse **durante instalación** para el origen de FuelFlow y el perfil definitivo del kiosco, o administrarse por una política permitida en esa versión. Ver [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access) y [Edge Local Network Access](https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access). Cambiar origen, perfil o revocar permisos puede exigir nueva configuración. CORS/PNA preflight no sustituye el permiso del navegador. No se promete ausencia de avisos de permisos sin completar ese paso inicial; una vez provisionado, la aplicación no abre selector, vista previa, diálogo ni confirmación de impresión por operación.

## Ticket y estados

`thermalReceipt.js` construye texto a partir de la transacción confirmada: identificador, fecha Lima, estación, surtidor 03 (el único surtidor del simulador actual), placa, boleta/DNI o factura/RUC/razón social, combustible, galones, precio por galón, subtotal, descuento, total, modalidad, método y estado financiero real, deuda cuando existe y leyendas DEMO/SUNAT. No inicia cobros ni crea otro comprobante.

`print.ps1` consulta el área del driver y exige coincidencia con el ancho configurado (tolerancia 0,6 mm). Usa Arial de 9 pt, negro, margen interior de 0,508 mm por lado, fondo blanco y ajuste GDI de texto, incluso identificadores y nombres largos. Calcula largo personalizado para el contenido y pagina si hace falta. No imprime controles, colores ni separadores anchos. La geometría real, largo admitido/avance y legibilidad requieren la prueba física; no se fija falsamente un ancho de 48/49/57/58 mm para todas las A6.

Cada trabajo usa `receipt-<transaction.id>` y un hash del contenido. Se guarda en disco antes de invocar el adaptador; envíos simultáneos comparten promesa. No se crea un segundo registro financiero. Estados:

| Estado | Significado | Reintento |
|---|---|---|
| `accepted` | `PrintDocument.Print()` terminó sin error; la cola aceptó el documento | Consulta y devuelve el mismo resultado; no imprime otra vez |
| `retryable` | Falló antes de llamar a `Print()` (cola, puerto, permisos, conexión o formato) | Permite un nuevo intento con el mismo ID y contenido |
| `unknown` | En curso, caída del proceso, timeout o error desde el inicio de `Print()` | Sólo consulta; nunca reenvía automáticamente |

`physicalConfirmed` permanece `false`: este adaptador no obtiene una confirmación fiable de papel desde la A6. Windows puede aceptar un trabajo y mantenerlo en cola mientras USB está desconectado; reconectar puede imprimirlo sin reenviar desde FuelFlow. El estado no se transforma en “impreso físicamente”.

Ante resultado desconocido, el operador revisa la cola por `DocumentName = receipt-<id>` y la salida real. No borrar registros ni cambiar IDs para forzar reimpresión. No se proporciona reimpresión automática para ese estado. Puede consultar otra vez o finalizar sin imprimir; esto no cancela un trabajo que ya haya llegado a Windows. La finalización sin imprimir no envía **nuevos** trabajos, no repite cobros y no revierte abastecimiento. Con agente totalmente inaccesible, ni siquiera se intenta POST hasta poder consultar el ID.

## Pruebas automáticas y validación física

Desde V11_2:

```powershell
npm.cmd --prefix PrintAgent test
npm.cmd --prefix FrontEnd_1 test
npm.cmd --prefix FrontEnd_2 test
node FrontEnd_2/node_modules/@playwright/test/cli.js test -c tools/playwright.print.cjs
```

Las pruebas de almacenamiento y API usan adaptador simulado; el servidor HTTP de prueba comprueba el mismo controlador de rutas (TLS no se ejercita ahí). Las cinco pruebas de navegador sirven los archivos actuales en el puerto temporal 22381 e interceptan agente/API: no usan impresora, certificado real, permiso LNA real ni cobran. Comprueban textos, bloqueo durante envío, aceptación, finalizar sin imprimir, agente inaccesible, fallo recuperable y estado desconocido, conservación del ticket y cero POST financieros. Ver [VALIDATION-PRINT-A6-V11_2.md](VALIDATION-PRINT-A6-V11_2.md).

Antes de habilitar atención en el equipo final:

- Registrar unidad/variante A6, driver/versión, puerto USB, ancho de papel y área del probe; verificar impresora física correcta. Si el driver no ofrece la cola USB/área/largo esperados, detener instalación y resolverlo con el proveedor; no seleccionar otra impresora.
- Provisionar certificado, origen y permiso local. Arrancar el agente con la cuenta final y comprobar reinicio automático. Revisar que un origen ajeno falla con 403.
- Imprimir una boleta y factura DEMO con nombre largo, UUID, descuentos y deuda. Medir ancho efectivo, legibilidad, ausencia de cortes y espacio final; guardar muestra/foto. Verificar ausencia de diálogos del driver y navegador.
- Hacer doble clic, simular pérdida de respuesta y recargar la página: una sola salida por ID. Desconectar USB antes/durante el trabajo y detener agente: el ticket se conserva, no se repite cobro y un resultado incierto no se reenvía. Revisar cola antes de reconectar para evitar interpretar un trabajo pendiente como perdido.
- Probar “Finalizar y no imprimir”: ningún trabajo nuevo. La tarjeta Prime debe mostrar un solo total pendiente del backend y su acceso Yape/Plin; regularizarlo y comprobar actualización sin tocar saldo disponible.

Faltan actualmente: acceso a la cola del equipo final, driver/variante exactos, resultado del probe y ancho verificado, configuración TLS/origen/permisos del navegador, y prueba física USB A6 sin diálogos. Ninguna prueba simulada sustituye esos datos.
