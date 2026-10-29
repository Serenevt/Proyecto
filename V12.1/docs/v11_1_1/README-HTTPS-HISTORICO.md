# V11_1.1 — ejecución local e impresión PeriPage A6

> Archivo histórico de V11_1_1. El iniciador `tools/start-v11_1_1.cjs` fue retirado de V12.1 porque apuntaba a un proyecto, una base y puertos antiguos. Para el arranque vigente usar `V12.1/README.md` y `V12.1/compose.yaml`; los comandos siguientes documentan únicamente la ejecución pasada.

Proyecto completo creado desde `C:\Users\HP\Desktop\Prueba\V11_1`. Todos los cambios pertenecen a `C:\Users\HP\Desktop\V11_1.1`. La copia inicial de 466 archivos se verificó por SHA-256. Se conservan Backend, FrontEnd_1, FrontEnd_2, PlateRecognition, PostgreSQL y PrintAgent.

## Iniciar Backend y ambas interfaces

Requisitos: Docker Desktop iniciado con contenedores Linux. Node.js 22 o 24 para los comandos auxiliares y PrintAgent en Windows.

```powershell
cd C:\Users\HP\Desktop\V11_1.1
node tools/start-v11_1_1.cjs --check
node tools/start-v11_1_1.cjs
```

El iniciador verifica primero proyecto, base, volumen y puertos. Rechaza variables heredadas que apunten a los puertos anteriores, otra base, otro Backend o proveedores externos. Después inicia los servicios y construye las imágenes que falten. La primera ejecución prepara únicamente la base DEMO privada de esta versión; puede tardar varios minutos. No necesita copiar `.env.example` ni secretos de otra versión. Después de editar fuentes, usa `node tools/start-v11_1_1.cjs --stop` y `node tools/start-v11_1_1.cjs --rebuild`.

| Componente | Dirección |
|---|---|
| FrontEnd_1 / FuelFlow | http://localhost:26081/src/index.html |
| FrontEnd_2 / Prime | http://localhost:26082/ |
| Backend / salud | http://localhost:26000/api/v1/health |
| Mailpit DEMO | http://localhost:26025/ |
| PrintAgent Windows | https://localhost:25443 |

Compose usa proyecto **primax-v11-1-1**, base **primax_v11_1_1** y volumen **primax-v11-1-1_postgres_data**. PostgreSQL y OCR no exponen puertos al host. Las aplicaciones se enlazan a 127.0.0.1. No conectes los overrides `compose.database-managed.yaml` o `compose.lan.yaml` para estas pruebas locales.

Estado y registros:

```powershell
docker compose --project-name primax-v11-1-1 --file compose.yaml ps
docker compose --project-name primax-v11-1-1 --file compose.yaml logs --tail 60 backend migrate seed
```

Para detener conservando los datos:

```powershell
node tools/start-v11_1_1.cjs --stop
```

Después vuelve a ejecutar el iniciador. No borres volúmenes ni historial de impresión. Si detecta un puerto ocupado, revisa el proceso y detén únicamente la instancia nueva cuando corresponda. No se detienen versiones anteriores automáticamente.

Las cuentas y claves predeterminadas de Compose son exclusivamente DEMO local. Prime: `demo@primaxprime.pe` / `Prime123`. Administración local: `admin-demo` / `LocalAdminV10!`. No son credenciales productivas. No se habilitaron cobros reales, SMTP externo ni validación SUNAT.

## PrintAgent y la A6 de 203 DPI

La configuración local se preparó para **PeriPage A6(1)**, driver **PeriPage A6**, **USB001**, origen exacto **http://localhost:26081**. El probe confirmó **203 × 203 DPI** y área útil del formato final de aproximadamente **51,926 × 100,099 mm**, con inicio horizontal a **5,005 mm**. El agente vuelve a comprobarlo antes de escuchar y antes de imprimir.

El formato solicitado es 57 × 100 mm nominales. Windows usa centésimas de pulgada: **224 × 394 = 56,896 × 100,076 mm**. Se mide el texto antes de enviar, se exige una sola página y se rechaza el exceso de contenido. Se conserva cuerpo de 7 pt, encabezado de 10 pt y total de 9 pt. La longitud física y la legibilidad en papel requieren una prueba posterior expresamente autorizada.

Se crearon un certificado localhost y una clave propios dentro de `PrintAgent/private`, con ACL limitada a la cuenta actual, SYSTEM y administradores. Están excluidos de Git. La clave nunca se copia al frontend ni debe compartirse. No se sobrescribieron certificados o credenciales anteriores. El certificado caduca el 25/10/2027.

**La confianza de Windows/navegador requiere aprobación específica.** El diagnóstico seguro verifica TLS usando el certificado explícito; eso no instala confianza en Windows. No ignores errores TLS ni desactives verificaciones. La huella y el estado constan en [print-diagnostic.json](docs/v11_1_1/print-diagnostic.json). Una vez aprobada y completada la confianza, reinicia el navegador si es necesario y autoriza el acceso local del sitio cuando lo solicite.

Iniciar el agente en una terminal aparte, únicamente cuando vayas a usar el sistema:

```powershell
cd C:\Users\HP\Desktop\V11_1.1
node PrintAgent/server.mjs PrintAgent/config.local.json
```

Detenerlo con Ctrl+C. El puerto anterior 24443 no se utiliza. Se conserva un historial propio `PrintAgent/data-v11_1_1`. No ejecutes dos agentes con ese historial ni lo borres para reintentar una impresión.

Diagnóstico autónomo que inicia un agente temporal, bloquea los trabajos, consulta solamente `/health` y lo detiene:

```powershell
node tools/diagnose-print-v11_1_1.cjs
```

Debe ejecutarse con el puerto 25443 libre. No modifica la cola, impresora predeterminada, driver ni certificados de confianza. Para otra instalación Windows, `tools/provision-print-local.ps1` prepara archivos nuevos y ejecuta el probe; se niega a sobrescribir secretos y no modifica la confianza. No lo vuelvas a ejecutar sobre la configuración ya preparada.

## Uso de los dos botones

**Finalizar e imprimir** consulta la transacción confirmada por Backend mediante GET, prepara la boleta o factura correcta, consulta el trabajo estable `receipt-ID` y solo lo envía si no existe o el agente confirmó un fallo seguro previo al envío. Bloquea ambos botones mientras espera. Únicamente cierra tras recibir `accepted` con el identificador esperado. No crea otra venta ni otro cobro al imprimir.

Ante error se conserva el ticket. Una respuesta perdida se reconcilia consultando el mismo identificador. `unknown` nunca se reenvía automáticamente: un operador debe revisar la cola y el papel. `accepted` indica aceptación por Windows; no confirma salida física.

**Finalizar y no imprimir** cierra la operación confirmada sin contactar al agente, crear ventas, descargar archivos ni abrir el diálogo de impresión. Las operaciones que requieren intervención permanecen bloqueadas por los controles existentes.

## Pruebas y resultados

```powershell
node tools/validate-v11_1_1.cjs
```

Requiere las dependencias locales ya instaladas en Backend y FrontEnd_2, Chrome y OpenSSL de Git para la prueba TLS. En una instalación limpia: `npm ci --prefix Backend`, `npm run prisma:generate --prefix Backend` y `npm ci --prefix FrontEnd_2`. El generador Prisma crea el cliente; no aplica migraciones.

La suite segura prueba lógica, HTTPS con impresora simulada, interfaz en Chrome y renderizado GDI fuera de pantalla. No imprime, no realiza pagos y no ejecuta migraciones. El informe actual está en [RESULTADOS.md](docs/v11_1_1/RESULTADOS.md); las vistas están en [layout](docs/v11_1_1/layout).

Las guías e informes V11_4 y V11_1 anteriores se conservan como historia. Sus rutas y puertos no son instrucciones de arranque para esta carpeta. El README original está en [README-V11_1-SOURCE.md](docs/v11_1_1/README-V11_1-SOURCE.md).
