# Seguridad y compatibilidad de HTTP local

La instalación de V11_1.1 se limita a un PC: FuelFlow se abre en `http://localhost:26081` o `http://127.0.0.1:26081`; PrintAgent recibe en `http://127.0.0.1:25443`. No se implementa una degradación automática desde HTTPS. La selección de HTTP es explícita y las configuraciones anteriores son rechazadas por el servidor nuevo.

## Diferencias de seguridad

| Aspecto | HTTP por loopback implementado | HTTPS con certificado válido y confiable |
|---|---|---|
| Cifrado e integridad criptográfica | No; transporte en claro dentro del PC | Sí, mediante TLS |
| Identidad criptográfica del servidor | No | Sí, sujeta a la validación del certificado |
| Acceso desde LAN/Internet | Imposible mediante este listener, enlazado solo a 127.0.0.1 | También depende del enlace de red, no solamente de TLS |
| Otros sitios web | Origin/Host exactos, preflight y encabezados obligatorios | Esos controles siguen siendo necesarios |
| Procesos locales maliciosos | Fuera del alcance: pueden falsificar encabezados y disputar puertos | TLS protege la identidad si la clave y la confianza no están comprometidas; no sustituye la seguridad del equipo |
| Certificados de Windows | No se usan ni modifican | Requiere una cadena reconocida por el navegador |

No hay contraseña o token secreto en el JavaScript. `X-FuelFlow-Print: 1` es un marcador que obliga al navegador a usar el protocolo previsto y preflight; no es autenticación de procesos nativos. CORS impide a sitios no autorizados leer respuestas y los controles del servidor rechazan sus solicitudes antes de acceder a trabajos. El límite de confianza incluye el código del frontend autorizado y el equipo local.

Se rechazan Host alternativos, Origin ausente, `null`, comodines, orígenes no emparejados, rutas ajenas, encabezados protegidos duplicados, métodos no previstos, navegación/formularios y cuerpos mayores de 16 KiB. El POST de trabajos exige el marcador y JSON UTF-8; el GET de trabajos exige el marcador. GET `/health` es de solo lectura y no exige encabezados de un cuerpo inexistente, pero mantiene Origin, Host y loopback obligatorios. Se acepta únicamente un comprobante estructurado validado, sin elegir otra impresora o varias copias desde el cliente. El diseño térmico y la idempotencia no cambian con el transporte.

## Restricciones del navegador

W3C considera los orígenes de loopback potencialmente confiables para funciones de contexto seguro, aunque HTTP no aporta cifrado o autenticación TLS. Esto no convierte una dirección de LAN en loopback. [Secure Contexts, §3.1](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy).

Chrome aplica restricciones Local Network Access a solicitudes desde redes menos privadas hacia destinos locales/loopback. Los permisos, cuando corresponden, pertenecen al navegador y deben respetarse. Una página ya servida en loopback tiene un contexto distinto al de una web pública. [Chrome LNA](https://developer.chrome.com/blog/local-network-access), [guía de Edge](https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access).

Las pruebas consultan `isSecureContext` y los permisos disponibles, y comprueban conexiones reales sin interceptación de red. No conceden permisos, no usan `--disable-web-security`, no ignoran certificados y no desactivan LNA. El encabezado `Access-Control-Allow-Private-Network` se devuelve solo ante la solicitud PNA compatible; no reemplaza los permisos modernos de LNA.

El estado `prompt` en la API de permisos no implica que toda solicitud requiera mostrar un diálogo: las conexiones entre orígenes de loopback pueden funcionar sin pedirlo. Una política empresarial o un cambio de navegador puede bloquear el acceso; la aplicación falla conservando el ticket. El detalle observado y las versiones probadas constan en [las evidencias](docs/v11_1_1/http-local).

## Límites y alternativa

Esta implementación rechaza explícitamente páginas de LAN y sitios HTTPS remotos. No se debe abrir CORS o enlazar a `0.0.0.0` para hacerlos funcionar. Si se necesita una web remota con identidad fuerte del agente sin instalar raíces, una alternativa a diseñar sería una extensión con [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), validación del origen e IPC del proceso Windows. Ese sería otro modo de despliegue; no se instaló ninguna extensión ni se modificó la seguridad del equipo.

Los archivos TLS creados en la etapa previa se conservan protegidos pero no se leen. El comando antiguo para importar certificados se ha convertido en una negativa explícita. No es necesario instalar, aceptar o renovar un certificado para utilizar el modo HTTP local.
