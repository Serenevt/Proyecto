# Especificación consolidada de Primax V12.1

## Propósito y alcance

Primax V12.1 es un MVP académico de autoservicio de combustible. Permite preparar una terminal de estación, identificar la placa, elegir combustible y modalidad, autorizar una venta demostrativa, registrar abastecimiento y consultar un comprobante académico. Los pagos y recargas son simulados; no hay cobro comercial, facturación electrónica ni control de un surtidor físico. Esta especificación se reconstruyó del código, schema, pruebas y documentación actuales; no afirma que existiera desde versiones anteriores.

## Actores y componentes

| Actor humano | Responsabilidad |
|---|---|
| Cliente | Realiza la compra en FuelFlow y consulta su cuenta en Prime. |
| Supervisor de estación | Opera turno y terminales de sus estaciones; no recibe por ello permisos de Control. |
| ENCARGADO | Administración limitada por grants y estaciones asignadas. |
| ADMIN | Administración según grants y alcance concedidos. |
| SUPER_ADMIN | Administración global y aprobación/provisión de accesos autorizados. |

Terminal, Kiosk y gateway son **identidades técnicas**, no personas ni roles humanos.

| Componente | Límite de responsabilidad |
|---|---|
| FuelFlow (`FrontEnd_1`) | Interfaz de autoservicio y recuperación visual de la operación. |
| FuelFlow BFF | Frontera de rutas, sesión y firma hacia Backend. |
| Primax Prime (`FrontEnd_2`) | Cuenta del cliente, membresía, saldo, puntos e historial. |
| Primax Control (`FrontEnd_3`) | Panel administrativo con proxy de mismo origen. |
| Backend NestJS + Prisma | Reglas de identidad, operación, pagos DEMO, inventario y persistencia. |
| PostgreSQL | Estado durable, relaciones, restricciones y ledger. |
| Redis | Sesión Kiosk y límites técnicos; la venta durable reside en PostgreSQL. |
| PlateRecognition | OCR de placas del MVP, opcional en runtime y sin facultad de autorizar. |
| PrintAgent | Impresión física local de estación; no es servicio cloud público. |

## Contrato del sistema

- **SYS-001:** una venta nueva de FuelFlow requiere terminal preparada y vinculación técnica verificable; la cuenta humana Supervisor no sustituye esa identidad.
- **SYS-002:** Backend conserva el estado financiero y físico autoritativo; un resultado visual, OCR, QR o comprobante no cambia por sí solo la autorización.
- **SYS-003:** la ausencia temporal de OCR, PrintAgent o SMTP no debe detener los flujos centrales que no dependen de ellos. Las funciones de correo que sí requieren entrega informan indisponibilidad explícita.
- **SYS-004:** cada ámbito humano y técnico tiene rutas y permisos propios; no se infieren permisos administrativos por tener una membresía o un turno.

## Relación SDD y evidencia

Las specs `01`–`08` expresan reglas y aceptación; [09-traceability.md](09-traceability.md) vincula cada ID con módulos y validación. La fuente actual incluye `Backend/prisma/schema.prisma`, `README.md`, `Backend/test/phase1a.e2e-spec.ts`, `FrontEnd_1/tools/financial-e2e-local.mjs` y `docs/STAGING-ARCHITECTURE.md`. La relación con IDs académicos `RF`, `RN` y `RNF` se registra en la matriz; no se altera el dictamen histórico de esos documentos.
