# Auditoría de conformidad de V9 con el documento académico oficial

**Actualización 19/10/2026 — registro y multicanal:** §I añade evidencia de esta fase; solo RF-16, RN-12 y RNF-14 fueron reevaluados. Los dictámenes transaccionales de §H se conservan.

**Actualización 19/10/2026 — validación integrada:** el dictamen vigente de los 19 requisitos solicitados y los resultados reales están en §H. Las limitaciones de servicios detenidos de las secciones anteriores son históricas. No se repitió la auditoría ni se alteraron los demás requisitos.

**Actualización 17/10/2026 — fase de corrección crítica:** las 19 matrices solicitadas reflejan la nueva evidencia y §G documenta el resultado vigente. Los hallazgos E y el resumen F conservan el corte histórico del 16/10; sus conteos y afirmaciones de ausencia de cambios no describen esta fase. No se modificó el PDF ni V8.

Fecha de auditoría: **16 de octubre de 2026, America/Lima** (algunos artefactos usan UTC del 17 de octubre). Base de código: commit `ea1e54c`, con los archivos locales inspeccionados. Alcance: V9 exclusivamente. No se modificó V8 ni el PDF. No se implementaron correcciones funcionales ni integraciones.

Fuente de verdad: [Proyecto Software (1).pdf](docs/Proyecto%20Software%20%281%29.pdf), **51 páginas**, leídas íntegramente mediante extracción de texto y revisión visual de las seis figuras de las páginas 10, 11, 38, 42, 45 y 47. SHA-256: `0FAF3FD369EDFE4627403F0627DECF2CB22A2B1B930E2167F0849DE1FB8AB93E`.

## Método, alcance y criterio de dictamen

Se contrastaron las tablas 7–11, casos de uso, clases, estados, actividades y arquitectura con controllers, services, repositorios, DTO, guards, esquema y migraciones Prisma, interfaces, Nginx, Dockerfiles, Compose, OCR, Capacitor/Android y cuerpos de tests. Las rutas HTTP de Nest llevan prefijo `/api/v1`, comprobado en `Backend/src/setup-app.ts`.

Estados empleados exclusivamente: **CUMPLE**, **CUMPLE PARCIALMENTE**, **NO CUMPLE**, **NO IMPLEMENTADO**, **NO VERIFICABLE AÚN**. CUMPLE indica evidencia suficiente para la obligación concreta en el piloto software; no certifica producción, hardware, legalidad ni requisitos vecinos. NO CUMPLE identifica comportamiento contrario demostrado; NO IMPLEMENTADO, ausencia del mecanismo. Lo parcial conserva explícitas las partes presentes y faltantes. Los límites de ejecución se consignan incluso en requisitos verificables por código.

La prioridad individual RF procede **exclusivamente de §3.6, pp. 29–30**: 16 MUST, 4 SHOULD, 2 COULD. RNF y RN no tienen clasificación individual MoSCoW en esa tabla; se indica «No asignada individualmente» y se conservan las relaciones T-01…T-14, sin convertirlas en prioridades inventadas. «Faltante» en el resumen significa cualquier RF distinto de CUMPLE, incluso si está parcialmente construido.

La evidencia de `VALIDATION.md` (12/10/2026) es histórica y declarativa, contrastada con código de pruebas y `tools/evidence/v9-flow.json`; **no se presenta como una ejecución nueva**. Docker Desktop no respondió en esta sesión, tampoco fuera del sandbox; por ello no se reejecutaron E2E PostgreSQL, OCR en contenedor ni integración completa. No se alteraron saldos ni se reiniciaron bases. Las pruebas nuevas de servicios usan dependencias aisladas, claramente identificadas.

## Lectura de los capítulos y trazabilidad académica

- **I, pp. 3–6:** objetivo de software autónomo, guiado y seguro; piloto de una estación; asistente con voz/comprensión básica; pagos y comprobantes; restricciones de conectividad, compatibilidad y estación piloto. Fabricación de módulos e instalación de infraestructura física están excluidas. No se exige construir hardware para aprobar esta auditoría.
- **II, pp. 6–15:** AS-IS concentra atención, despacho y cobro en el despachador. TO-BE redistribuye esas acciones al software, conserva apoyo humano y exige registro. El piloto actual representa gran parte del flujo visual, pero el temporizador de ayuda no reproduce la responsabilidad humana y el pago simulado no es integración comercial.
- **III, pp. 16–35:** línea base académica, sin entrevistas reales a responsables de Primax. Se encontraron exactamente **22 RF, 14 RNF y 16 RN**. Las metas RNF son objetivos iniciales de diseño, no SLA acordados.
- **IV, pp. 35–47:** se revisaron CU-01…CU-15, tabla de clases, estados y actividades. No se exige copiar literalmente cada clase a una tabla; sí conservar sus responsabilidades. Faltan Surtidor lógico, Incidente y servicio/ciclo de Comprobante. Los estados distribuidos entre navegador, FuelAuthorization y Transaction no cubren Intervención/Cancelada ni resultados externos. CU-04 exige aprobación antes de habilitar; CU-08 exige registro antes del comprobante y reintento controlado.
- **V, pp. 47–50:** sigue en **DISEÑO y CONSTRUCCIÓN**. Pruebas técnicas preliminares; pruebas formales no cerradas; despliegue formal pendiente; mantenimiento no iniciado. Backend común, Prisma, PostgreSQL, Docker y Capacitor ya aparecen en este capítulo: no son por sí mismos novedades ajenas al documento.

| Traza oficial | Prioridad textual §3.7 | Resultado de contraste (detalle en matrices) |
|---|---|---|
| T-01: RF-01/03/04/05; RN-01/02 | Must | Selección/resumen presentes; condiciones y habilitación por estación/surtidor incompletas. |
| T-02: RF-07/09/10; RN-03/04/06 | Must | Prepago inicia sin aprobación Backend. |
| T-03: RF-08/09/13; RN-05/06 | Must | Liquidación interna presente; total no ligado obligatoriamente al avance. |
| T-04: RF-11/12/13; RN-10 | Must | Visualización y stop simulado; persistencia desigual entre modalidades. |
| T-05: RF-14/15/22; RN-08 | Must | Compra antes de TXT; emisión y auditoría incompletas. |
| T-06: RF-02/19; RN-15/16 | Should/Must | Guía guionada, sin derivación humana real. |
| T-07: RF-09/15/22; RN-06/07 | Must | UUID y atomicidad; sin ciclo de fallos de pasarela. |
| T-08: RF-05/15; RN-09 | Must | Precio visible, pero no congelado desde confirmación. |
| T-09: RF-16; RN-12 | Could | Miembros preexistentes; no alta/vinculación autorizada. |
| T-10: RF-17; RN-13 | Could | OCR software con umbral y fallback. |
| T-11: RF-18/20; RN-14 | Should | No registro operativo de incidentes. |
| T-12: RF-21/22; RN-11 | Should | No administración protegida ni auditoría de cambios. |
| T-13: RF-16/17/20/21; RN-11/12 | Must/Should | JWT de socios; no roles administrativos ni finalidad/consentimiento integral. |
| T-14: RF-12/19/22; RN-16 | Must | Sin intervención real; error de recuperación reproducido. |

T-12 agrupa RF-22 bajo Should, mientras §3.6 lo define MUST; T-13 mezcla prioridades. Se conserva la prioridad individual de §3.6 y se documenta la agrupación de §3.7, sin reclasificar RF-16/17 como MUST.

## A. REQUISITOS FUNCIONALES

Descripción fiel normalizada de §3.3, tabla 7, pp. 20–24; no sustituida por las funcionalidades nuevas.

### RF-01 — Iniciar atención

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-01 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Permitir al cliente iniciar una nueva sesión de autoservicio y mostrar las condiciones básicas de uso. |
| Prioridad MoSCoW | MUST |
| Componente responsable | FuelFlow |
| Implementación actual | Botón INICIAR, contexto local con operationId, carga de catálogo y reconciliación de compra pendiente. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/index.html (pantalla-inicio); FrontEnd_1/src/js/script.js (iniciar, limpiarEstadoOperacion); FrontEnd_1/src/js/transactionsService.js (begin). GET /api/v1/fuels y /stations. |
| Prueba o evidencia | Inspección del flujo y medición de inicio en navegador; tests transactions/recovery de FuelFlow ejecutados. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Existe inicio coherente, pero no se encontraron condiciones básicas de uso explícitas. Bienvenida, publicidad y «Operativo 24/7» no sustituyen condiciones. La recuperación tiene el defecto E-02. |
| Acción pendiente | Mostrar condiciones del piloto y corregir recuperación sin perder operaciones. |

### RF-02 — Guiar al usuario

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-02 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Presentar instrucciones paso a paso y permitir solicitar ayuda al asistente virtual durante la atención. |
| Prioridad MoSCoW | SHOULD |
| Componente responsable | FuelFlow / asistencia |
| Implementación actual | Pasos visuales, frases contextuales predefinidas, mascota y speechSynthesis; tocar la mascota repite la última frase. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (hablar, repetirFraseMascota, mostrarPantalla); FrontEnd_1/src/index.html (voice-line, controles de voz). Sin endpoint de asistente. |
| Prueba o evidencia | Inspección de funciones, textos y listeners; FrontEnd_1/tests/terminology.test.js ejecutado, con alcance estático. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Hay asistencia guionada y síntesis de voz; no comprensión de instrucciones ni conversación/consulta de ayuda contextual. No es asistente IA integrado. Cap. I también contempla comprensión básica en español. |
| Acción pendiente | Definir y demostrar consultas contextuales, aunque sean simuladas; conservar validaciones fuera del asistente. |

### RF-03 — Seleccionar combustible

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-03 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Mostrar los combustibles habilitados en la estación y permitir seleccionar uno. |
| Prioridad MoSCoW | MUST |
| Componente responsable | Catálogo Backend / FuelFlow |
| Implementación actual | GET filtra Fuel.active; selección rechaza productos no activos; UI deshabilita tarjetas estáticas sin coincidencia. |
| Archivo/clase/endpoint relacionado | Backend/src/fuels/fuels.repository.ts (list); Backend/src/transactions/transactions.service.ts (create); FrontEnd_1/src/js/script.js (iniciar, seleccionarCombustible). GET /api/v1/fuels. |
| Prueba o evidencia | Código de filtros y validación; unitario que rechaza combustible inactivo ejecutado. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Catálogo activo global: no asociación combustible–estación–surtidor. Tarjetas no habilitadas permanecen visibles deshabilitadas. La estación de la UI es PRIMAX-SUR. |
| Acción pendiente | Modelar habilitación por estación/surtidor y renderizar catálogo efectivo. |

### RF-04 — Indicar cantidad

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-04 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Permitir indicar el monto o la cantidad a abastecer, según la modalidad habilitada. |
| Prioridad MoSCoW | MUST |
| Componente responsable | FuelFlow / DTO Backend |
| Implementación actual | Ingreso por monto en soles; postpago admite monto o tanque lleno simulado. No se exige implementar simultáneamente monto y litros/galones. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (validarYConfirmarMonto, confirmarMontoPostpago, elegirTanqueLleno); Backend/src/transactions/create-authorization.dto.ts; Backend/src/rewards/points-policy.service.ts. |
| Prueba o evidencia | Inspección de teclado, rango y Decimal; unitarios de política de importes ejecutados. |
| Estado | **CUMPLE** |
| Observación | Cumplimiento del ingreso según modalidad, no del cobro ni medición física. Los límites del teclado y máximo Backend no constituyen configuración administrativa. |
| Acción pendiente | Sin brecha específica de ingreso; alinear los límites cuando se implemente RF-21. |

### RF-05 — Confirmar solicitud

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-05 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Mostrar un resumen de combustible, cantidad/monto y precio antes de la autorización. |
| Prioridad MoSCoW | MUST |
| Componente responsable | FuelFlow |
| Implementación actual | La pantalla de datos presenta combustible con precio por galón y monto; continuar sucede antes de reservar o pasar al pago. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (irADatos, continuarDatosOnce); FrontEnd_1/src/index.html (prep-mini-fuel, prep-mini-monto, botón continuar). |
| Prueba o evidencia | Secuencia de llamadas y actualización de elementos inspeccionadas; tools/v9-flow.spec.cjs inspeccionado como evidencia histórica del recorrido. |
| Estado | **CUMPLE** |
| Observación | Para tanque lleno muestra la modalidad; el límite técnico usa capacidad simulada. Mostrar precio no garantiza conservarlo: RN-09 falla por separado. |
| Acción pendiente | Mantener este resumen y vincular su precio a la autorización para resolver RN-09. |

### RF-06 — Seleccionar modalidad de pago

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-06 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Integrar pasarelas de pago para tarjetas de crédito, débito y billeteras digitales (Yape, Plin, etc.). |
| Prioridad MoSCoW | MUST |
| Componente responsable | FuelFlow / PaymentsService |
| Implementación actual | Selección TARJETA, YAPE, PLIN y EFECTIVO; QR decorativo y NFC simulado. POSTPAGO usa SALDO_PRIME interno. |
| Archivo/clase/endpoint relacionado | Backend/src/payments/payments.service.ts (authorize); FrontEnd_1/src/js/script.js (pintarQR, confirmarPagoQR, confirmarPagoNFC); Backend/src/wallet/wallet.service.ts. POST /api/v1/transactions; POST /api/v1/memberships/me/recharges. |
| Prueba o evidencia | Unitarios payments ejecutados: todos los medios válidos devuelven provider DEMO; no cliente de pasarela, webhook ni credenciales de adquirente en el flujo. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | La descripción oficial pide integración, no solo selector. TARJETA no distingue integración crédito/débito. Wallet tiene contabilidad persistente, pero su recarga no cobra dinero real. |
| Acción pendiente | Definir adaptador y simulador con estados; integración comercial requiere proveedor. No declarar pago real. |

### RF-07 — Procesar prepago

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-07 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Validar el pago antes de autorizar el abastecimiento y limitarlo al importe aprobado. |
| Prioridad MoSCoW | MUST |
| Componente responsable | FuelFlow / motor de pagos |
| Implementación actual | Prepago crea Payment DEMO en una transacción previa; otra transacción relee CAPTURED, valida reglas y crea FuelAuthorization. El navegador espera la respuesta y revalida incluso una aprobación cacheada. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (procesarPago, simularDespacho, mostrarResumen); Backend/src/payments/payments.service.ts; Backend/src/transactions/transactions.service.ts. POST /api/v1/transactions. |
| Prueba o evidencia | E2E prepago persistido, PENDING/REJECTED con reintentos y compra real Nginx; 100 unitarias y 84 E2E Backend. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Sin bloqueo integrado para esta obligacion en el piloto. Se conservan los limites externos descritos en H. |

### RF-08 — Procesar pospago

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-08 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Calcular el consumo final y solicitar el cobro correspondiente al utilizar pospago. |
| Prioridad MoSCoW | MUST |
| Componente responsable | TransactionsService / saldo Prime |
| Implementación actual | Pospago liquida únicamente importe y galones iguales al avance validado, con precio congelado; mantiene devolución de reserva, saldo y deuda existentes. |
| Archivo/clase/endpoint relacionado | Backend/src/transactions/transactions.service.ts (create, settleReservation); Backend/src/rewards/points-policy.service.ts (assertMatchesDispatch); Backend/src/wallet/debt.ts. POST /api/v1/authorizations y /transactions. |
| Prueba o evidencia | 84 E2E: saldo, deuda, consumo registrado, FIFO, recarga y concurrencia con PostgreSQL real. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Sin bloqueo integrado para esta obligacion en el piloto. Se conservan los limites externos descritos en H. |

### RF-09 — Validar pago

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-09 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Recibir y registrar el resultado de la pasarela de pagos antes de continuar con el cierre de la transacción. |
| Prioridad MoSCoW | MUST |
| Componente responsable | PaymentsService / Transaction / Payment |
| Implementación actual | Payment puede preceder a Transaction; prepago exige CAPTURED persistido. Se conservan PENDING/PARTIAL y se añaden REJECTED/ERROR al modelo, probados con dobles del proveedor. |
| Archivo/clase/endpoint relacionado | Backend/src/payments/payments.service.ts; Backend/src/transactions/transactions.service.ts; Backend/prisma/schema.prisma (PaymentStatus). POST /api/v1/transactions. |
| Prueba o evidencia | PENDING/REJECTED persistidos rechazan autorizacion por HTTP; CAPTURED habilita. Solo proveedor DEMO. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Proveedor externo y reconciliacion financiera siguen pendientes; proveedor ejecutable DEMO. |

### RF-10 — Autorizar abastecimiento

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-10 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Habilitar abastecimiento únicamente cuando se cumplan las reglas de autorización definidas. |
| Prioridad MoSCoW | MUST |
| Componente responsable | AuthorizationsService / FuelFlow |
| Implementación actual | Ambas modalidades requieren FuelAuthorization; prepago verifica pago persistido y referencias, pospago conserva membresía/saldo/crédito. La autorización vincula vehículo exacto y snapshot de precio. |
| Archivo/clase/endpoint relacionado | Backend/src/transactions/authorizations.service.ts (create); Backend/src/auth/access.guard.ts; FrontEnd_1/src/js/script.js (ejecutarReserva, procesarPago). POST /api/v1/authorizations. |
| Prueba o evidencia | E2E de autorizacion, limites, membresia, referencias e idempotencia; compra real por navegador. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Reglas por estacion/surtidor de RN-01 incompletas; autorizacion y concurrencia ya verificadas en PostgreSQL. |

### RF-11 — Monitorear abastecimiento

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-11 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Mostrar al cliente avance del abastecimiento e importe acumulado disponible durante la operación. |
| Prioridad MoSCoW | MUST |
| Componente responsable | FuelFlow / avance Backend |
| Implementación actual | Contadores galones/soles, barra porcentual y estado de operación; postpago envía avance agrupado. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (simularDespacho, pintarDespacho, reportarAvance); Backend/src/transactions/authorizations.service.ts (progress). POST /api/v1/authorizations/:id/progress. |
| Prueba o evidencia | Código de cálculo, presentación y persistencia inspeccionado; unitarios de progreso ejecutados. |
| Estado | **CUMPLE** |
| Observación | Cumple visualización para piloto software: avance generado por setInterval, no telemetría física. Este estado no acredita exactitud metrológica ni conservación ante todas las fallas. |
| Acción pendiente | Validación con telemetría solo si se habilita equipo real; corregir tolerancia a fallas en RN-16. |

### RF-12 — Detener abastecimiento

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-12 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Permitir detener la operación mediante controles habilitados y registrar el motivo cuando corresponda. |
| Prioridad MoSCoW | MUST |
| Componente responsable | FuelFlow / autorización |
| Implementación actual | Detener espera persistir el último avance antes del cierre; los fallos de avance detienen la simulación y conservan la operación. El motivo AUTO/MANUAL se guarda en ambas modalidades. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (detenerDespacho); Backend/src/transactions/transactions.service.ts (settleReservation); Backend/src/transactions/authorizations.service.ts (release). POST /api/v1/authorizations/:id/release; POST /api/v1/transactions. |
| Prueba o evidencia | E2E intervention persiste avance y bloquea progress/release/cierre; unitarias FuelFlow detienen timer. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | No se ejecuto corte fisico del stack durante despacho; cancelacion/reembolso prepago sin consumo exige revision. |

### RF-13 — Finalizar abastecimiento

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-13 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Cerrar el abastecimiento, calcular total definitivo y bloquear nuevas cargas dentro de la misma transacción. |
| Prioridad MoSCoW | MUST |
| Componente responsable | FuelFlow / TransactionsService |
| Implementación actual | El cierre exige avance y galones registrados, valida precio y límite, persiste SETTLED y bloquea nuevos avances. No acepta un total final arbitrario. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (detenerDespacho, mostrarResumen); Backend/src/transactions/transactions.service.ts; Backend/src/transactions/authorizations.service.ts; Backend/prisma/schema.prisma. |
| Prueba o evidencia | E2E critico pendiente aprobado: seis manipulaciones rechazadas, cierre validado y snapshot conservado. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Sin bloqueo integrado para esta obligacion en el piloto. Se conservan los limites externos descritos en H. |

### RF-14 — Generar comprobante

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-14 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Solicitar la generación del comprobante y ofrecer su entrega o visualización por el canal definido. |
| Prioridad MoSCoW | MUST |
| Componente responsable | FuelFlow / snapshots de Transaction |
| Implementación actual | Boleta/factura visual y descarga TXT con referencia de transacción; snapshots DNI/RUC/razón social en servidor. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (generarComprobante, descargarTxt, pintarResumen); Backend/src/transactions/transactions.service.ts; Backend/src/memberships/profile.dto.ts. POST /api/v1/transactions; GET /api/v1/transactions/:id. |
| Prueba o evidencia | Inspección del generador y persistencia; casos E2E de snapshot inspeccionados; evidencia histórica tools/evidence/v9-flow.json. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | No servicio de emisión/confirmación ni estados de reintento del comprobante de CU-08. No integración SUNAT. TXT usa algunos valores de state, no exclusivamente snapshot Backend. FACTURA permite datos fiscales ausentes en servidor. |
| Acción pendiente | Distinguir documento DEMO y registro pendiente; generar desde snapshot autoritativo. Proveedor fiscal real requiere integración externa. |

### RF-15 — Registrar transacción

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-15 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Almacenar registro con fecha, estación, surtidor, producto, cantidad, importe, estado de pago y eventos relevantes. |
| Prioridad MoSCoW | MUST |
| Componente responsable | Prisma / PostgreSQL / TransactionsRepository |
| Implementación actual | Transacción vincula autorización para ambas modalidades, cantidad, snapshot de precio, importe y estado financiero. La autorización conserva intervención y último avance. |
| Archivo/clase/endpoint relacionado | Backend/prisma/schema.prisma (Transaction, FuelAuthorization, Payment); Backend/prisma/migrations; Backend/src/transactions/transactions.repository.ts; Backend/src/prisma/prisma.service.ts. POST /api/v1/transactions. |
| Prueba o evidencia | Migracion aplicada, 84 E2E PostgreSQL y compra real con una Transaction/Payment/RewardMovement. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Surtidor logico y registro integral de eventos siguen pendientes. |

### RF-16 — Gestionar membresía

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-16 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Registrar e identificar clientes miembros y asociar vehículos o preferencias cuando el usuario otorgue la autorización requerida. |
| Prioridad MoSCoW | COULD |
| Componente responsable | Auth / Memberships / Vehicles / Prime |
| Implementación actual | Registro publico validado con JWT inmediato, User y Membership ACTIVE atomicos, perfil fiscal y POST /vehicles autenticado. Numero PRIME generado por Backend; ningun vehiculo obligatorio al crear cuenta. |
| Archivo/clase/endpoint relacionado | Backend/src/auth/register.dto.ts, auth.controller.ts, auth.service.ts; users.repository.ts; vehicles.controller.ts, vehicles.repository.ts; FrontEnd_2/js/register.js y app.js. |
| Prueba o evidencia | 20 E2E nuevos con PostgreSQL, registro/errores en tres viewports y flujo real registro -> login -> vehiculo -> compra FuelFlow -> historial Prime. Reinicio de cinco contenedores conserva datos y login. Ver seccion I. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Alta y vinculo funcionales demostrados el 19/10/2026. Sigue parcial por el mecanismo organizacional y evidencia formal de autorizacion del titular; la solicitud JWT no acredita propiedad del vehiculo. |
| Acción pendiente | Formalizar politica de autorizacion y consentimiento auditable; no falta ya el endpoint ni la pantalla de registro. |

### RF-17 — Capturar y reconocer placa

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-17 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Capturar o recibir placa del vehículo y consultar el componente de reconocimiento cuando la función esté habilitada. |
| Prioridad MoSCoW | COULD |
| Componente responsable | Cámara FuelFlow / Nest / PlateRecognition |
| Implementación actual | getUserMedia, captura canvas, archivo fixture, OCR OpenCV/Tesseract, normalización, confianza y consulta Vehicle→Membership. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/plateCamera.js; Backend/src/vehicles/recognition.service.ts; Backend/src/vehicles/recognition.controller.ts; PlateRecognition/app.py. POST /api/v1/plate-recognition → POST /recognize (servicio interno). |
| Prueba o evidencia | 9 casos unitarios gateway ejecutados; implementación OCR y 7 tests Python inspeccionados; fixture histórico y tools/v9-ui.spec.cjs contrastados con código. |
| Estado | **CUMPLE** |
| Observación | Cumple capacidad software de recibir/capturar y consultar OCR. Tesseract LSTM preentrenado, no PaddleOCR/EasyOCR ni modelo entrenado por el equipo. Webcam física y OCR vivo en esta sesión: NO VERIFICABLE AÚN. |
| Acción pendiente | Ejecutar validación física con placa impresa; medir precisión sobre muestra real separada del fixture. |

### RF-18 — Registrar incidentes

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-18 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Registrar incidencias de pago, abastecimiento o identificación y vincularlas con la transacción correspondiente. |
| Prioridad MoSCoW | SHOULD |
| Componente responsable | Subsistema de incidentes ausente |
| Implementación actual | No modelo Incidente, repositorio, servicio ni endpoint. Logs y deuda no constituyen incidente. |
| Archivo/clase/endpoint relacionado | Backend/prisma/schema.prisma; Backend/src/app.module.ts; inventario de Backend/src/*/*.controller.ts; FrontEnd_1/src/js/script.js (ALERTAS_EJEMPLO). Sin endpoint de incidentes. |
| Prueba o evidencia | Búsqueda e inspección de modelos, módulos, rutas y alertas; HttpErrorFilter solo maneja errores técnicos. |
| Estado | **NO IMPLEMENTADO** |
| Observación | No se conserva tipo, descripción, evidencia, responsable ni ciclo de atención de incidentes. |
| Acción pendiente | Diseñar registro vinculado a transacción/estación/fecha/evidencia, como SHOULD. |

### RF-19 — Brindar asistencia humana

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-19 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Ofrecer mecanismo para solicitar apoyo del personal ante dudas, fallos o condiciones excepcionales. |
| Prioridad MoSCoW | MUST |
| Componente responsable | Interfaces de ayuda |
| Implementación actual | FuelFlow muestra solicitud, operador asignado y llegada después de 6 s; Prime tiene formulario explícitamente demo. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (abrirAsistencia, asistenciaHaLlegado, HELP_DURACION_MS); FrontEnd_2/js/app.js (data-assistance, support-form); FrontEnd_2/js/views.js (ayuda). Sin endpoint de derivación. |
| Prueba o evidencia | Inspección de callbacks y temporizador; ninguna llamada de asignación/notificación/persistencia de solicitud. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Existe interfaz de solicitud, pero no llegada real, cola, operador ni registro operativo consultable. FuelFlow anuncia un hecho inexistente; formulario local de Prime no satisface la derivación. |
| Acción pendiente | Primero etiquetar simulación; posteriormente implementar solicitud persistente y recepción por personal. |

### RF-20 — Consultar operación

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-20 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Panel administrativo para usuarios autorizados que permita consultar transacciones, estados e incidencias mediante filtros básicos. |
| Prioridad MoSCoW | SHOULD |
| Componente responsable | Dashboard local FuelFlow |
| Implementación actual | Panel existe con tabla local, ventas base simuladas y alertas de ejemplo. Se abre sin validación de credenciales. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (loginAdmin, refrescarAdmin, leerTransacciones); FrontEnd_1/src/index.html (pantalla-admin). No endpoint administrativo; GET /api/v1/memberships/me/transactions es historial personal. |
| Prueba o evidencia | Inspección de fuentes de datos, login y controles. E-04 evidencia que historial local marca Pagado con deuda. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | No consulta operacional Backend con filtros/incidentes/roles. Métricas fijas + sesión no equivalen a registros PostgreSQL. |
| Acción pendiente | Implementar después un panel protegido con consulta Backend; retirar afirmaciones de panel operativo. |

### RF-21 — Gestionar configuración

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-21 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Permitir a administradores autorizados configurar combustibles habilitados, límites operativos, medios de pago y parámetros no sensibles definidos por negocio. |
| Prioridad MoSCoW | SHOULD |
| Componente responsable | Administración ausente |
| Implementación actual | Combustibles de seed, límites en código/env y catálogos de solo lectura. |
| Archivo/clase/endpoint relacionado | Backend/src/fuels/fuels.controller.ts; Backend/src/stations/stations.controller.ts; Backend/src/config/environment.ts; Backend/prisma/seed.ts; compose.yaml. Sin endpoint de configuración administrativa. |
| Prueba o evidencia | Inventario de controllers, modelo User sin rol administrativo, inspección de panel. |
| Estado | **NO IMPLEMENTADO** |
| Observación | Editar .env/seed/Prisma manualmente no satisface administración autorizada del producto. |
| Acción pendiente | Definir permisos, validaciones, edición y evento auditable por cambio. |

### RF-22 — Auditar eventos

| Campo | Dictamen y evidencia |
|---|---|
| ID | RF-22 |
| Tipo | Requisito funcional |
| Descripción fiel al documento | Registrar eventos críticos de autenticación, autorización, pagos, cambios de configuración e incidencias para trazabilidad. |
| Prioridad MoSCoW | MUST |
| Componente responsable | Ledger / transacciones / logs |
| Implementación actual | Fechas, operationId, requestHash, Payment, autorización y movimientos monetarios; logger de errores/reintentos. |
| Archivo/clase/endpoint relacionado | Backend/src/auth/auth.service.ts; Backend/src/transactions/authorizations.service.ts; Backend/src/wallet/debt.ts; Backend/src/common/http-error.filter.ts; Backend/prisma/schema.prisma. |
| Prueba o evidencia | Inspección de escrituras de negocio y ausencia de almacenamiento de eventos de login/configuración/incidentes; unitarios financieros ejecutados. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Existe trazabilidad financiera parcial. No auditoría transversal con actor/acción/resultado ni historial de todos los cambios de estado. Logger no la sustituye. |
| Acción pendiente | Registrar eventos de negocio consultables y relacionados; incorporar fallos y actor sin almacenar secretos. |

## B. REQUISITOS NO FUNCIONALES

Descripción fiel normalizada de §3.4, tabla 8, pp. 24–27. Sin prioridad individual MoSCoW asignada por el PDF.

### RNF-01 — Usabilidad

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-01 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | El flujo principal deberá poder completarse con instrucciones claras, consistentes y visibles, minimizando la necesidad de asistencia externa. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | FuelFlow / Prime |
| Implementación actual | Pasos, resúmenes, errores, etiquetas, voz y FAQ; pruebas de navegación. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/index.html; FrontEnd_1/src/js/script.js; FrontEnd_2/js/views.js; FrontEnd_2/tests/mobile.spec.cjs. |
| Prueba o evidencia | 24 pruebas móviles ejecutadas con API fixture; inspección de mensajes y controles. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Pendiente vs COBRADO/Pagado es inconsistente; llegada humana simulada se anuncia como real. No prueba de usabilidad con usuarios representativos. |
| Acción pendiente | Corregir mensajes y ejecutar protocolo de tareas, errores y comprensión con usuarios. |

### RNF-02 — Rendimiento

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-02 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Las pantallas locales del flujo principal deberían responder en hasta 2 segundos bajo condiciones normales, excluyendo demoras de servicios externos. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | Interfaces / Backend |
| Implementación actual | Medición aislada de dos transiciones de FuelFlow con catálogo interceptado. |
| Archivo/clase/endpoint relacionado | docs/audit-v9/performance.cjs; docs/audit-v9/performance-results.json; FrontEnd_1/src/js/script.js (seleccionarCombustible). |
| Prueba o evidencia | Windows, Node 24.19.0, Chrome 155, 1280×800, 1 usuario, 1 calentamiento excluido, 10 repeticiones: máximo inicio→catálogo 18.1 ms; selección→modalidad 919.7 ms. Método: performance.now, click DOM y espera de pantalla activa más frame. |
| Estado | **NO VERIFICABLE AÚN** |
| Observación | Resultado favorable solo para esas dos pantallas; no mide Backend/PostgreSQL ni todas las pantallas. Incluye pausa programada de 900 ms; los timers de pago 2000/2200 ms tampoco son mediciones. Docker no disponible. |
| Acción pendiente | Medir flujo completo con servicios locales activos, percentiles y condiciones definidas, separando latencia externa. No usar duración de tests como SLA. |

### RNF-03 — Disponibilidad

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-03 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Diseñar servicio para operar durante el horario de atención de la estación y contemplar recuperación ante fallos. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | Docker / Backend / PostgreSQL |
| Implementación actual | Healthchecks en cinco servicios, restart unless-stopped, dependencias de inicio, volumen persistente; health Backend consulta SELECT 1. |
| Archivo/clase/endpoint relacionado | compose.yaml; FrontEnd_1/Dockerfile; FrontEnd_2/Dockerfile; PlateRecognition/Dockerfile; Backend/src/health/health.service.ts. GET /api/v1/health y /healthz. |
| Prueba o evidencia | Compose local/LAN config --quiet ejecutados; Docker ps falló por daemon ausente. Historial de servicios healthy en VALIDATION.md, no observado hoy. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Diseño básico demo; healthcheck no garantiza reinicio por estar unhealthy ni continuidad productiva. No ensayo de recuperación/backup restaurado ni disponibilidad medida. Texto 24/7 no es evidencia. |
| Acción pendiente | Ensayar caída y arranque con preservación de operaciones, definir horario y objetivo; validar backup/restore. |

### RNF-04 — Seguridad

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-04 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Toda comunicación con servicios externos deberá utilizar canales cifrados; accesos administrativos requerirán autenticación y control por roles. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | Guard / Nginx / despliegue |
| Implementación actual | JWT de 1 h, bcrypt, validación DTO, throttling, Helmet, filtros proxy y secretos de 32+ caracteres. KIOSK_SECRET se traduce a KIOSK_API_KEY. |
| Archivo/clase/endpoint relacionado | Backend/src/auth/access.guard.ts; Backend/src/auth/auth.service.ts; Backend/src/setup-app.ts; Backend/src/config/environment.ts; FrontEnd_1/nginx/default.conf; compose.lan.yaml; FrontEnd_2/android/app/src/debug/AndroidManifest.xml. |
| Prueba o evidencia | Inspección de guards/proxy y metadatos locales de secretos sin revelar valores; .env ignorados por Git; unitarios auth y controles de acceso inspeccionados. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Local/LAN HTTP, sin terminación TLS incluida. Roles existentes son member/kiosk, no administrador. Panel demo entra sin autenticación. Proxy de kiosco accesible en LAN inyecta credencial: ocultar secreto no autentica al visitante; Sec-Fetch-Site no reemplaza control de red/terminal. |
| Acción pendiente | Antes de Internet: HTTPS confiable, acceso restringido a kiosco, roles administrativos y retirar credenciales demo del build. No afirmar seguridad productiva. |

### RNF-05 — Privacidad

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-05 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Tratar datos personales y vehiculares únicamente para finalidades autorizadas y conforme a políticas y normas aplicables. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | Auth / perfil / vehículos / almacenamiento |
| Implementación actual | Consultas del socio limitadas por usuario; perfil fiscal propio; OCR usa temporales; imágenes no se conservan permanentemente. |
| Archivo/clase/endpoint relacionado | Backend/src/vehicles/vehicles.service.ts; Backend/src/memberships/memberships.service.ts; Backend/src/transactions/transactions.service.ts; PlateRecognition/app.py; FrontEnd_1/src/js/transactionsService.js. |
| Prueba o evidencia | Inspección de filtrado de propiedad, DTO y temporales; no política/registro de autorización integral encontrado. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Lookup kiosk por placa expone nombre, membresía, DNI/RUC/razón social y saldos. LocalStorage de operación puede contener datos fiscales y quedar tras fallo; JWT se conserva en cliente. No evidencia de política, retención, supresión ni consentimiento de vinculación. No se dictamina cumplimiento legal. |
| Acción pendiente | Minimizar lookup, definir finalidad/consentimiento/retención y limpieza del terminal; evaluar despliegue y políticas antes de datos reales. |

### RNF-06 — Trazabilidad

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-06 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Operaciones críticas dejarán registros consultables con fecha, usuario/sistema, acción y resultado. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | Backend / ledger |
| Implementación actual | UUID, fechas, relaciones de membresía, movimientos y estados financieros; historial personal y reservas consultables. |
| Archivo/clase/endpoint relacionado | Backend/prisma/schema.prisma; Backend/src/wallet/wallet.repository.ts; Backend/src/memberships/memberships.repository.ts; Backend/src/transactions/authorizations.controller.ts. |
| Prueba o evidencia | Esquema y escrituras inspeccionados; pruebas unitarias y E2E históricos contrastados. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | No actor/acción/resultado transversal para login, cambios, fallos e incidentes. El estado actualizado no conserva cada transición. Kiosk no tiene identidad individual de terminal. |
| Acción pendiente | Implementar eventos críticos y consulta autorizada, correlacionados por operación y terminal. |

### RNF-07 — Confiabilidad

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-07 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Una falla de pago o de servicio externo no provocará duplicidad de cobros ni dejará la transacción en estado ambiguo. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | Servicios financieros / recuperación UI |
| Implementación actual | UUID estable, single flight de autorización y relectura del pago persistido evitan autorizar por timers o duplicar el pago DEMO. Fallos conservan la operación. |
| Archivo/clase/endpoint relacionado | Backend/src/prisma/prisma.service.ts; Backend/prisma/schema.prisma; Backend/src/transactions/transactions.service.ts; FrontEnd_1/src/js/transactionsService.js. |
| Prueba o evidencia | Concurrencia real de autorizacion, compra, deuda y recarga; replay HTTP sin duplicados. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Fallo y reconciliacion de proveedor comercial no verificados; idempotencia local y PostgreSQL aprobadas. |

### RNF-08 — Accesibilidad

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-08 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Interfaz con tipografía legible, contraste suficiente, controles de tamaño adecuado y lenguaje comprensible para usuarios no técnicos. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | HTML/CSS / voz |
| Implementación actual | Etiquetas, aria-label, roles de estado, foco y controles grandes en partes del flujo; responsive Prime; voz opcional. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/index.html; FrontEnd_1/src/styles/styles.css; FrontEnd_2/styles/app.css; FrontEnd_2/styles/login.css; FrontEnd_2/tests/mobile.spec.cjs. |
| Prueba o evidencia | 24 casos navegador a 360×800, 390×844 y 412×915; inspección CSS con textos secundarios de 9–12 px y controles de 44/48 px en Prime. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Sin medición sistemática de contraste, lector de pantalla, teclado, zoom ni evaluación cognitiva. Prueba de no desbordamiento no certifica accesibilidad. No se impone ni se declara una norma no exigida. |
| Acción pendiente | Auditar contraste y tareas con teclado/zoom/lector; revisar textos pequeños y terminología. |

### RNF-09 — Compatibilidad

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-09 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Integraciones mediante interfaces definidas y desacopladas para facilitar cambio de proveedor. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | API / servicios / OCR |
| Implementación actual | DTO REST, clientes frontend separados, OCR en servicio HTTP con URL configurable. PaymentsService encapsula demo. |
| Archivo/clase/endpoint relacionado | Backend/src/vehicles/recognition.service.ts; Backend/src/payments/payments.service.ts; FrontEnd_1/src/js/apiClient.js; FrontEnd_2/js/services/apiClient.js. |
| Prueba o evidencia | Inspección de límites HTTP, configuración, DTO y llamadas. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | OCR desacoplado; no contrato de proveedor de pagos/comprobantes ni adaptador de surtidor. Encapsular autorización siempre favorable no demuestra sustitución completa de proveedor. |
| Acción pendiente | Definir contratos de estados, errores y callbacks para integraciones pendientes. |

### RNF-10 — Escalabilidad

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-10 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Permitir nuevas estaciones, surtidores y funciones sin rediseñar el núcleo transaccional. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | Modelo de dominio / módulos Nest |
| Implementación actual | Station/Fuel identificados por UUID; módulos separados y relaciones con Transaction. |
| Archivo/clase/endpoint relacionado | Backend/prisma/schema.prisma; Backend/src/app.module.ts; FrontEnd_1/src/js/script.js (iniciar fija PRIMAX-SUR). |
| Prueba o evidencia | Inspección de modelos, índices y selección de estación. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Nuevas estaciones/funciones viables, pero no existe entidad Surtidor ni oferta por estación. UI está fijada a una estación y tarjetas. No se ha probado escalado horizontal. |
| Acción pendiente | Incorporar surtidor lógico y configuración de estación/terminal sin constantes de interfaz. |

### RNF-11 — Mantenibilidad

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-11 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Organizar software en componentes claramente separados, con registros de errores y documentación técnica mínima. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | V9 completo |
| Implementación actual | Dos frontends, módulos Nest con servicios/repositorios/DTO, Prisma, OCR separado, Dockerfiles y documentación técnica. |
| Archivo/clase/endpoint relacionado | Backend/src/app.module.ts; Backend/src/common/http-error.filter.ts; Backend/src/prisma/prisma.service.ts; FrontEnd_2/js/services; PlateRecognition/app.py; README.md; compose.yaml. |
| Prueba o evidencia | Inspección estructural y funcional; 80 unitarios Backend, 45 frontends, build Prime y 24 pruebas móviles ejecutados. |
| Estado | **CUMPLE** |
| Observación | Cumple separación y documentación mínima. script.js monolítico y documentación heredada son deuda técnica, no ausencia total de este requisito. No implica que documentación sea exacta en cada afirmación. |
| Acción pendiente | Corregir comentarios/afirmaciones señaladas; refactorizar gradualmente sin alterar alcance académico. |

### RNF-12 — Recuperación

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-12 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Ante interrupción determinar último estado válido de transacción y ejecutar recuperación segura o solicitar intervención. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | FuelFlow / AuthorizationsService |
| Implementación actual | 404 de consulta se distingue de 401/403, 5xx y timeout/red. Estos últimos bloquean sin descartar; el replay fallido de una reserva SETTLED tampoco descarta. Se conserva operationId. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/transactionsService.js (reconcile); FrontEnd_1/src/js/script.js (iniciar, ejecutarReserva); Backend/src/transactions/authorizations.controller.ts. GET /api/v1/authorizations/:id y /authorizations?olderThanMinutes=30. |
| Prueba o evidencia | 49 pruebas FuelFlow; navegador con errores de transporte inyectados sobre compra persistida y recuperacion contra API viva. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Faltan corte real durante despacho y resolucion operativa de intervencion; transporte se prueba mediante inyeccion en navegador. |

### RNF-13 — Integridad de datos

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-13 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Importes, cantidades y estados de pago no podrán alterarse desde la interfaz del cliente sin pasar por validaciones del sistema. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | Backend / restricciones SQL |
| Implementación actual | Backend valida cierre contra importe/galones persistidos y precio congelado. Omisión de gallons, reducción bajo avance, aumento no registrado y precio adulterado se rechazan. |
| Archivo/clase/endpoint relacionado | Backend/src/rewards/points-policy.service.ts; Backend/src/transactions/create-transaction.dto.ts; Backend/src/transactions/transactions.service.ts; Backend/prisma/migrations/202610120002_v9_credit_constraints/migration.sql. |
| Prueba o evidencia | Migracion aplicada y E2E critico aprobado: amount/gallons/unitPrice adulterados rechazados por HTTP. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Sin bloqueo integrado para esta obligacion en el piloto. Se conservan los limites externos descritos en H. |

### RNF-14 — Experiencia multicanal

| Campo | Dictamen y evidencia |
|---|---|
| ID | RNF-14 |
| Tipo | Requisito no funcional |
| Descripción fiel al documento | Cuando exista app móvil y módulo físico, ambos mantendrán reglas y estados consistentes para una misma transacción. |
| Prioridad MoSCoW | No asignada individualmente en §3.6. |
| Componente responsable | FuelFlow / Prime web-Android / Backend común |
| Implementación actual | Registro, membresia, vehiculo y operaciones usan un Backend/PostgreSQL compartido. Prime web usa proxy relativo; APK incorpora PRIME_API_BASE_URL absoluta configurable para LAN o HTTPS futuro. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/nginx/default.conf; FrontEnd_2/nginx/default.conf; FrontEnd_2/tools/build.cjs; FrontEnd_2/tools/android-sync.cjs; FrontEnd_2/js/views.js; FrontEnd_1/src/js/script.js. |
| Prueba o evidencia | Flujo nuevo completo entre Prime a 390x844 y FuelFlow, verificado con Prisma; 33 mobile fixture; APK debug compilada y escaneada; HTTP LAN del host verificado y persistencia tras reinicio real. Ver seccion I. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observacion | Canales web y empaquetado Android verificados. No se ejecuto la APK en telefono/emulador ni se verifico conectividad desde un segundo dispositivo; no se declara validacion nativa por tener un APK. |
| Accion pendiente | Instalar APK debug y repetir el recorrido desde un celular conectado al mismo servidor LAN; comprobar red/firewall. Validacion fisica pendiente. |

## C. REGLAS DE NEGOCIO

Descripción fiel normalizada de §3.5, tabla 9, pp. 27–28. Las referencias a prioridad son de trazas, no una priorización individual inventada.

### RN-01 — Combustibles habilitados

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-01 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Solo ofrecer combustibles habilitados para la estación y surtidor seleccionados. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; relación T-01 (Must). |
| Componente responsable | Catálogo / esquema |
| Implementación actual | Filtro active global y validación de estación activa independientes. |
| Archivo/clase/endpoint relacionado | Backend/src/fuels/fuels.repository.ts; Backend/src/transactions/transactions.service.ts; Backend/prisma/schema.prisma. GET /api/v1/fuels. |
| Prueba o evidencia | Filtro y ausencia de relación Station–Fuel–Surtidor inspeccionados. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | No existe habilitación por surtidor/estación. Estar ambos activos no demuestra compatibilidad entre ellos. |
| Acción pendiente | Agregar configuración relacional del punto lógico de despacho. |

### RN-02 — Resumen previo

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-02 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Antes de autorizar abastecimiento mostrar al cliente un resumen de su selección para confirmación. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-01 (Must). |
| Componente responsable | FuelFlow |
| Implementación actual | Resumen combustible/precio/monto antes de continuar datos y reservar o elegir medio de pago. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (irADatos, continuarDatosOnce); FrontEnd_1/src/index.html (summary-mini). |
| Prueba o evidencia | Inspección secuencial del flujo real de eventos. |
| Estado | **CUMPLE** |
| Observación | Cumplimiento de presentación/confirmación, independiente de la conservación del precio. |
| Acción pendiente | Mantenerlo y vincular selección confirmada al estado servidor. |

### RN-03 — Aprobación antes de prepago

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-03 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | En prepago no autorizar abastecimiento si el pago no ha sido aprobado. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-02 (Must). |
| Componente responsable | FuelFlow / pagos |
| Implementación actual | El único camino de autorización prepago relee un Payment CAPTURED ya persistido; el frontend no autoriza por temporizador ni por respuesta local cacheada. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (procesarPago); Backend/src/payments/payments.service.ts; docs/audit-v9/probes.cjs. |
| Prueba o evidencia | E2E PENDING y REJECTED sin autorizacion; CAPTURED persistido con una autorizacion concurrente. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Sin bloqueo integrado para esta obligacion en el piloto. Se conservan los limites externos descritos en H. |

### RN-04 — Tope prepago

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-04 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | En prepago importe abastecido no superará monto previamente aprobado. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-02 (Must). |
| Componente responsable | FuelFlow / Backend |
| Implementación actual | El avance y el cierre no pueden superar authorizedAmount, tomado del pago aprobado; el cierre tampoco puede superar el avance registrado. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (topeImporte, simularDespacho); Backend/src/transactions/create-transaction.dto.ts. |
| Prueba o evidencia | E2E critico rechaza cierre 101 sobre pago 100 y 90 sobre avance 80; limites de progreso unitarios. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Sin bloqueo integrado para esta obligacion en el piloto. Se conservan los limites externos descritos en H. |

### RN-05 — Cobro por consumo real registrado

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-05 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | En pospago total a cobrar será valor calculado a partir del abastecimiento efectivamente registrado. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-03 (Must). |
| Componente responsable | TransactionsService |
| Implementación actual | El consumo cobrado en pospago coincide exactamente con el avance registrado y sus galones; utiliza el precio de la autorización. |
| Archivo/clase/endpoint relacionado | Backend/src/rewards/points-policy.service.ts (assertMatchesDispatch); Backend/src/transactions/transactions.service.ts (settleReservation). |
| Prueba o evidencia | E2E de liquidacion POSTPAGO y avance registrado; manipulaciones y precio probado ademas en unitarias. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Sin bloqueo integrado para esta obligacion en el piloto. Se conservan los limites externos descritos en H. |

### RN-06 — No presentar pendiente como éxito

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-06 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Transacción no podrá cerrarse como exitosa si pago requerido está pendiente, rechazado o desconocido. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-02/03/07 (Must). |
| Componente responsable | Backend financiero / FuelFlow / Prime |
| Implementación actual | PAYMENT_PENDING/PARTIAL y deuda nunca se presentan Pagado/COBRADO. El historial viejo sin estado verificable se muestra por verificar; no se transforma la deuda en un pago. |
| Archivo/clase/endpoint relacionado | Backend/src/transactions/transactions.service.ts; Backend/src/wallet/debt.ts (settleDebts); FrontEnd_1/src/js/script.js (mostrarResumen, pintarResumen); FrontEnd_2/js/views.js (movements). |
| Prueba o evidencia | PAYMENT_PENDING/PARTIAL persistidos en E2E; proyecciones de ambos frontends y mobile distinguen pendiente de pagado. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Sin bloqueo integrado para esta obligacion en el piloto. Se conservan los limites externos descritos en H. |

### RN-07 — Reintento de pago fallido

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-07 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Si pago falla, permitir reintento controlado o derivación a asistencia, evitando cobros duplicados. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-07 (Must). |
| Componente responsable | Cliente transaccional / Backend |
| Implementación actual | Reintentos controlados conservan UUID y cuerpo; el prepago relee Payment y no ejecuta otra aprobación al cerrar. Errores de recuperación no eliminan evidencia local. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/transactionsService.js; Backend/src/transactions/transactions.service.ts; Backend/src/prisma/prisma.service.ts. |
| Prueba o evidencia | Reintentos concurrentes en PostgreSQL y replay del navegador conservan una compra y un pago. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Reconciliacion con proveedor externo y resolucion humana completa pendientes. |

### RN-08 — Persistencia antes de comprobante

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-08 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Toda transacción finalizada quedará registrada antes de emitir o confirmar comprobante. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-05 (Must). |
| Componente responsable | TransactionsService / FuelFlow |
| Implementación actual | await submit recibe resultado posterior a la transacción atómica; luego pinta resumen y permite TXT. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (mostrarResumen, generarComprobante); FrontEnd_1/src/js/transactionsService.js (submit); Backend/src/transactions/transactions.repository.ts; Backend/src/prisma/prisma.service.ts. |
| Prueba o evidencia | Orden de operaciones inspeccionado; tests de respuesta perdida/idempotencia ejecutados; generación usa referencia Backend. |
| Estado | **CUMPLE** |
| Observación | Cumple precedencia para comprobante DEMO implementado; no implica cumplimiento fiscal ni emisión por servicio externo. |
| Acción pendiente | Mantener precedencia cuando se agregue proveedor; gestionar emisión pendiente de reintento. |

### RN-09 — Conservar precio aplicado

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-09 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Conservar precio aplicado durante una transacción para evitar inconsistencias si tarifario cambia en curso. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-08 (Must). |
| Componente responsable | Autorización / Transaction |
| Implementación actual | FuelAuthorization.unitPrice y Payment.unitPrice congelan el precio. Backend rechaza discrepancia con precio confirmado antes de autorizar y usa el snapshot después. |
| Archivo/clase/endpoint relacionado | Backend/src/transactions/transactions.service.ts (fuel, assertMatchesDispatch, unitPrice); Backend/prisma/schema.prisma (FuelAuthorization); FrontEnd_1/src/js/script.js (seleccionarCombustible). |
| Prueba o evidencia | E2E autoriza con X, cambia catalogo a Y, cierra conservando X; unitarias para ambas modalidades. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Sin bloqueo integrado para esta obligacion en el piloto. Se conservan los limites externos descritos en H. |

### RN-10 — Conservar estado en interrupción

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-10 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Interrupción o detención dejará registro del estado alcanzado y del importe asociado. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-04 (Must). |
| Componente responsable | Authorizations / FuelFlow |
| Implementación actual | El último avance se guarda en ambas modalidades; un fallo detiene el timer y conserva avance/estado. Intervención no libera fondos ni habilita nuevos avances. |
| Archivo/clase/endpoint relacionado | Backend/src/transactions/authorizations.service.ts (progress); FrontEnd_1/src/js/script.js (reportarAvance, detenerDespacho); Backend/prisma/schema.prisma. |
| Prueba o evidencia | E2E intervention conserva 40.00 y galones, reserva de saldo y bloqueo de cierre; sin liberar fondos. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | Intervencion persistida conserva importe y galones; queda corte real durante despacho y reconexion completa. |

### RN-11 — Administración por roles

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-11 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Funciones administrativas disponibles únicamente para perfiles autorizados según rol. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-12 (Should), T-13 (Must/Should). |
| Componente responsable | Panel FuelFlow / seguridad |
| Implementación actual | loginAdmin establece adminAutenticado=true sin verificar credenciales; Backend solo reconoce member/kiosk. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (loginAdmin); Backend/src/auth/access.ts; Backend/prisma/schema.prisma (User). |
| Prueba o evidencia | Cuerpo de login inspeccionado; sin rol o guard administrativo. No endpoint administrativo real. |
| Estado | **NO CUMPLE** |
| Observación | El panel es demo de datos locales y no da control de DB, pero no cumple restricción de acceso. Evitar presentar member/kiosk como RBAC administrativo. |
| Acción pendiente | Etiquetar/restringir demo; al construir administración agregar roles y guard server-side. |

### RN-12 — Vinculación autorizada

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-12 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Datos de membresía y vehículo solo se vincularán al cliente conforme al mecanismo de autorización definido por la organización. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-09 (Could), T-13 (Must/Should). |
| Componente responsable | Membership / Vehicle / seed |
| Implementación actual | POST /vehicles deriva membershipId del JWT, valida membresia activa, impide seleccionar otro titular y rechaza placas vinculadas a otra cuenta; concurrencia e idempotencia en PostgreSQL. |
| Archivo/clase/endpoint relacionado | Backend/src/vehicles/{create-vehicle.dto,vehicles.controller,vehicles.service,vehicles.repository}.ts; FrontEnd_2/js/app.js; POST /api/v1/vehicles. |
| Prueba o evidencia | registration.e2e-spec.ts: vinculo concurrente unico, rechazo de otro titular, membershipId inyectado y peticion sin JWT. registration.spec.cjs: vinculo desde cuenta nueva y consumo compartido. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observación | Mejora real de autorizacion tecnica. Saber una placa libre y confirmar el formulario no verifica titularidad legal ni constituye un mecanismo organizacional formalizado; no se permiten transferencias de placas ya vinculadas. |
| Acción pendiente | Definir verificacion de titularidad y evidencia formal de consentimiento con la organizacion. Mantener separados OCR, autenticacion y autorizacion. |

### RN-13 — OCR como apoyo

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-13 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Reconocimiento de placa será apoyo; si no alcanza confianza requerida solicitar validación adicional. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-10 (Could). |
| Componente responsable | OCR / gateway / cámara |
| Implementación actual | Umbral por defecto 0.75; valida rango/confianza/formato; bajo umbral no busca membresía; permite recaptura y entrada manual. Alta confianza también pide verificar placa. |
| Archivo/clase/endpoint relacionado | Backend/src/vehicles/recognition.service.ts; FrontEnd_1/src/js/plateCamera.js; Backend/src/vehicles/plate.dto.ts. |
| Prueba o evidencia | 9 casos gateway ejecutados, incluidos baja confianza, normalización y error; callback UI solo se ejecuta si recognized. Test UI de baja confianza inspeccionado. |
| Estado | **CUMPLE** |
| Observación | Cumple regla software. Confianza OCR no es probabilidad calibrada ni identidad de persona. Webcam física y precisión de campo no verificadas. |
| Acción pendiente | Validar tasa de error física; mantener confirmación y autorización independiente del OCR. |

### RN-14 — Incidente de abastecimiento no pagado

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-14 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Incidentes de abastecimiento no pagado asociados a transacción, estación, fecha y evidencia disponible. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-11 (Should). |
| Componente responsable | Incidentes ausentes |
| Implementación actual | MembershipDebt referencia transacción; transacción tiene estación/fecha, pero no existe incidente ni evidencia asociada. |
| Archivo/clase/endpoint relacionado | Backend/prisma/schema.prisma (MembershipDebt, Transaction); Backend/src/wallet/debt.ts; inventario de controllers. |
| Prueba o evidencia | Inspección del modelo de deuda y ausencia de entidad/flujo de incidente. |
| Estado | **NO IMPLEMENTADO** |
| Observación | Deuda consentida es dato financiero, no denuncia, incidente, fotografía ni gestión de impago. No se debe convertir toda deuda automáticamente en incidente. |
| Acción pendiente | Diseñar cuándo se genera incidente, su evidencia y consulta autorizada. |

### RN-15 — Límites de asistencia IA

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-15 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Funciones de asistencia con IA no podrán omitir ni modificar reglas de autorización, pago o seguridad. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-06 (Should/Must). |
| Componente responsable | Asistencia guionada / Backend |
| Implementación actual | Voz y repetición solo presentan frases; no hay agente con herramientas de pago ni modificación de reglas. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (hablar, repetirFraseMascota); Backend/src/transactions/authorizations.service.ts; Backend/src/auth/access.guard.ts. |
| Prueba o evidencia | Inspección de callbacks de voz y ausencia de API/herramientas de IA; autorización postpago en servicio separado. |
| Estado | **CUMPLE** |
| Observación | Dictamen restringido a asistencia disponible: no altera reglas. No acredita asistente IA completo ni corrige la autorización local de prepago, que es otro flujo. |
| Acción pendiente | Mantener esta separación si se incorpora IA; probar intentos de instrucciones que eludan reglas. |

### RN-16 — Condición crítica e intervención

| Campo | Dictamen y evidencia |
|---|---|
| ID | RN-16 |
| Tipo | Regla de negocio |
| Descripción fiel al documento | Ante riesgo o fallo crítico detener flujo automático y habilitar intervención del personal de estación. |
| Prioridad MoSCoW | No asignada individualmente en §3.6; T-06 (Should/Must), T-14 (Must). |
| Componente responsable | FuelFlow / contingencias |
| Implementación actual | INTERVENTION_REQUIRED persiste en FuelAuthorization mediante endpoint protegido de kiosco. Frontend detiene automatización, conserva snapshot y bloquea despacho/cierre; asistencia crítica no anuncia llegada ficticia. |
| Archivo/clase/endpoint relacionado | FrontEnd_1/src/js/script.js (reportarAvance, abrirAsistencia, asistenciaHaLlegado); Backend/prisma/schema.prisma. |
| Prueba o evidencia | E2E intervention idempotente en PostgreSQL; progress/release/cierre rechazados; timer detenido en prueba FuelFlow. Evidencia 19/10/2026: seccion H y docs/audit-v9/integrated-*.log. |
| Estado | **CUMPLE PARCIALMENTE** |
| Observacion | Reevaluado el 19/10/2026 con servicios reales disponibles. Alcance: piloto software, proveedor DEMO y avance simulado; no certifica hardware ni pasarela comercial. |
| Accion pendiente | No se implementaron asignacion, notificacion, panel ni resolucion humana completa. |

## D. FUNCIONALIDADES ADICIONALES DE V9

Son extensiones o concreciones tecnológicas; no se agregan IDs oficiales ni cambian prioridades. «Compatibilidad» expresa análisis, no aprobación del negocio.

| Funcionalidad y objetivo | Complementa / amplía | Impacto y compatibilidad | Evidencia |
|---|---|---|---|
| Saldo Primax Prime / wallet: fondo disponible por membresía | RF-08/16; amplía financiación de pospago | Evolución válida como libro interno de demo; reserva previa y liquidación posterior. No equivale a pasarela externa de RF-06. | Backend/src/wallet/wallet.service.ts, wallet.repository.ts; Membership.balance |
| Recargas DEMO persistentes | RF-08/16; flujo nuevo | Acreditación sin cobro bancario; puede usarse para demostrar saldo, no como dinero respaldado. | POST /api/v1/memberships/me/recharges; WalletMovement.RECHARGE |
| Deuda/saldo pendiente y consentimiento allowDebt | RF-08/09; amplía RN-05/06 | Permite consumo no cubierto; válido solo distinguiendo cierre de despacho y deuda pendiente. Backend lo distingue; UI lo contradice en puntos concretos. Requiere validación de política de negocio, no cambiar silenciosamente RN-06. | TransactionsService, AuthorizationsService; MembershipDebt |
| PRIME_DEBT_LIMIT y crédito comprometido | RF-10; nueva política de crédito | Cuenta deuda más reservas abiertas, default 200, configurable a 0. El PDF no define crédito ni este límite; no es MUST oficial. | Backend/src/wallet/debt.ts (creditCapacity, debtLimit) |
| Liquidación FIFO | RF-08/09/15; extensión financiera | Recarga aplica por createdAt e id; ledger por deuda. PAID solo cuando pendiente llega a cero. Compatible conceptualmente; demo sin dinero externo. | Backend/src/wallet/debt.ts (settleDebts); migración 202610120002 |
| DNI, RUC, razón social y perfil fiscal | RF-14/16 | DNI ya aparece en clase Cliente del cap. IV, p.40: no es totalmente nuevo. Perfil fiscal editable, RUC y snapshots concretan/amplían el comprobante; formato no valida identidad fiscal. | ProfileDto, ReceiptProfileDto; PATCH /api/v1/memberships/me/profile |
| Snapshots de comprobantes | RF-14/15; apoyo RN-08 | Evitan que cambiar perfil reescriba datos históricos; no servicio de emisión. Renderizar desde state conserva riesgo de divergencia. | Transaction.receiptDni/receiptRuc/receiptBusinessName; tests v9.e2e |
| Login JWT | RF-16; control transversal | Identificación ya prevista; JWT es decisión técnica. No existe registro público adicional ni alta de miembros por endpoint. No atribuir una función de registro inexistente. | AuthController.login, AuthService, AccessGuard |
| Puntos, beneficios y canjes | Concreción de fidelización de Prime ya mencionada en cap. V | No RF independiente ni regla oficial de puntos por sol. Otorga puntos aun con deuda; no se encontró prohibición en el PDF, por lo que no se inventa incumplimiento. Beneficios/cupones demostrativos. | RewardsService, PointsPolicyService, RewardMovement, Benefit, Redemption |
| Preferencia local de vehículo, alias y promociones | RF-16, experiencia Prime | Se guarda por dispositivo/usuario; no representa vinculación nueva ni notificación push implementada. | FrontEnd_2/js/services/store.js; FrontEnd_2/js/views.js |
| OCR local OpenCV/Tesseract | Implementación de RF-17 y RN-13 | RF-17 ya es COULD oficial; elegir motor local es diferencia técnica compatible, no nueva obligación. No videovigilancia continua ni evidencia de incidentes. | PlateRecognition/app.py, requirements.txt, Dockerfile |
| Docker LAN / puertos alternativos | RNF-03/14 | Docker ya figura en cap. V. Override LAN es concreción adicional; expone interfaces y API por HTTP, conserva DB loopback y OCR interno. No demuestra acceso desde segundo equipo. | compose.lan.yaml, tools/check-lan.cjs |
| Capacitor / Android configurable | RNF-14 | Android ya figura en cap. V p.49; V9 lo concreta, no amplía por sí solo la línea base. Build existente no equivale a instalación. | FrontEnd_2/capacitor.config.json; tools/android-sync.cjs; android/app |
| Inglés/quechua y voz guionada | RF-02, RNF-01/08 | Mejora de interfaz; no se certificó calidad lingüística ni comprensión de voz. | Diccionario y speechSynthesis en FrontEnd_1/src/js/script.js |
| Swagger, Nginx, migraciones y tests | RNF-09/11 | Infraestructura técnica ya prevista o compatible con cap. V; no reemplaza funciones faltantes. | Backend/src/setup-app.ts; Dockerfiles; Backend/prisma/migrations |

### Deuda frente a RN-06: estados que deben distinguirse

| Momento | Autorización | Transaction | Payment | MembershipDebt | Interpretación |
|---|---|---|---|---|---|
| Reserva, antes de confirmar consumo | RESERVED / DISPENSING | Todavía no creada en este flujo | Todavía no creado | Todavía no creada | Compromiso, no pago final. |
| Consumo 12.60 con aporte 5.00 | SETTLED | PAYMENT_PENDING | PARTIAL | PENDING por 7.60 | Despacho registrado; pago incompleto. PENDING de deuda significa que aún no se ha abonado esa deuda. |
| Consumo sin aporte | SETTLED | PAYMENT_PENDING | PENDING | PENDING | Nada cobrado al fondo para ese consumo. |
| Recarga menor que deuda | SETTLED | PAYMENT_PENDING | PARTIAL | PARTIAL | Abono, sigue pendiente. |
| Recarga liquida todo | SETTLED | PAID | CAPTURED | SETTLED | Pago interno completado, siempre DEMO. |

`settleDebts` cambia Transaction a PAID únicamente al llegar a pendiente cero. No se encontró conversión automática de deuda pendiente en PAID en esa rama Backend. Pero **RN-06 no cumple a nivel de producto**: `mostrarResumen` y recuperación ponen COBRADO; `pintarResumen` guarda Pagado en historial local. El ticket principal y Prime sí pueden mostrar pendiente. No basta revisar solo esas dos últimas pantallas.

La deuda puede permanecer como evolución válida **si se corrigen todas las proyecciones de estado y se valida la política académica/negocio**. Autorizar crédito no constituye incidente automático ni elimina RF-19. No se propone reemplazar RN-06 por «cerrar siempre con éxito».

### Pagos, comprobantes, OCR y plataformas: qué existe realmente

| Área | Evidencia actual | Límite |
|---|---|---|
| Tarjeta, Yape, Plin, efectivo | Simulación UI + Payment.provider=DEMO | Sin banco, adquirente, terminal NFC real, QR cobrable, webhook ni conciliación externa. |
| Wallet Prime | Ledger, reservas y liquidación persistibles en PostgreSQL | Recarga DEMO; no dinero externo acreditado por proveedor. |
| Boleta/factura | Tipo, datos fiscales, snapshot, referencia y TXT | No emisión SUNAT/proveedor, firma, respuesta fiscal ni ciclo de reintento del servicio. El PDF exige servicio de comprobantes, no una tecnología fiscal específica; no se agrega un RF «SUNAT». |
| OCR real de software | OpenCV transforma imagen; subprocess ejecuta Tesseract LSTM eng; HTTP enlaza resultado con Vehicle/Membership | Gateway unitario probado hoy con fetch simulado. OCR Tesseract de fixture reportado el 12/10, no reejecutado hoy por Docker ausente. |
| Cámara | getUserMedia, canvas, permisos, cancelación y tracks detenidos | Test histórico usa canvas.captureStream; webcam física: **NO VERIFICABLE AÚN**. En HTTP LAN no se acredita acceso a cámara. |
| APK | Proyecto Gradle/Capacitor y app-debug.apk existente; build histórico reportado | No se reconstruyó APK hoy ni se instaló en equipo/emulador: **NO VERIFICABLE AÚN** para instalación/ejecución física. |
| Android API | PRIME_API_BASE_URL en build; android-sync exige URL absoluta; debug permite HTTP | Debe apuntar a la misma instancia Backend para compartir persistencia. No promesa de sincronización entre bases distintas. |
| Windows Docker Desktop | Dockerfiles y Compose inspeccionados; sintaxis local/LAN validada hoy; ejecución saludable histórica | Daemon no disponible hoy; no uptime ni health actuales demostrados. |
| Debian 13 | Rutas relativas y contenedores Linux, procedimiento compatible documentado | Host Debian no probado físicamente: **NO VERIFICABLE AÚN**. Debian bookworm de imágenes no equivale a prueba de host Debian 13. |
| LAN | Override 0.0.0.0 para interfaces/API; DB 127.0.0.1 y OCR sin publicación; configuración válida | Validación histórica solo en host; segundo dispositivo/firewall/red real: **NO VERIFICABLE AÚN**. |

No se recomienda instalar hardware para resolver las omisiones de dominio: se puede modelar un surtidor **lógico** y una fuente de avance simulada en servidor sin construir ni instalar surtidores.

## E. HALLAZGOS ORIGINALES Y RECOMENDACIONES (16/10; correcciones en G)

### Hallazgos demostrables y reproducción

Los probes ejecutan **código fuente actual** con repositorios/DOM aislados; no conectan PostgreSQL ni proveedores. Sirven para demostrar ramas de lógica, no constraints SQL, guards HTTP ni hardware. Los DTO y restricciones se inspeccionaron separadamente: gallons es opcional, el precio no está en FuelAuthorization y no hay constraint que impida reducir progreso al liquidar.

Ejecutar desde V9:

```powershell
node docs/audit-v9/probes.cjs
node docs/audit-v9/performance.cjs
```

Resultados originales: [probes-results.json](docs/audit-v9/probes-results.json) y [performance-results.json](docs/audit-v9/performance-results.json). Los probes describen el comportamiento actual; que sus aserciones pasen significa que el defecto se reprodujo, **no conformidad**.

| Evidencia | Procedimiento / resultado observado | Requisitos afectados |
|---|---|---|
| E-01 | Ejecutar procesarPago con temporizador y modal controlados, sin red disponible: pagoAutorizado=true e inicio de despacho. En código real el timer es 2000 ms. | RF-07/10, RN-03/04 |
| E-02 | Inyectar error 503 o 401 en consulta de autorización: reconcile devuelve discard y «La reserva de saldo ya no existe». iniciar ejecuta discard ante esa respuesta. | RNF-12, RNF-07 |
| E-03 | Reserva DISPENSING con avance 80.00 y galones 3.404; crear cierre por 1.00 omitiendo gallons: servicio acepta y produce PAID. Mismo miembro pero distinto vehicleId también aceptado. | RF-08/13, RN-05, RNF-13 |
| E-04 | Pasar PAYMENT_PENDING/deuda 7.60 a pintarResumen real: ticket «Pendiente S/ 7.60» y registro local «Pagado». Además se inspeccionaron llamadas incondicionales a COBRADO. | RN-06, RNF-01/14 |
| E-05 | Precio seleccionado 23.50, tarifario consultado al cerrar 24.00; 1 galón y 23.50 son rechazados. No snapshot de precio en autorización. | RN-09 |
| E-06 | Inspección de inventario de modelos/rutas: no Incidente, rol administrativo, edición de catálogo ni auditoría transversal. | RF-18/20/21/22, RN-11/14 |
| E-07 | UI de ayuda anuncia operador/llegada solo por HELP_DURACION_MS=6000; reportarAvance silencia errores; no estado Intervención. | RF-19, RN-16 |

**Importante sobre E-03:** no se afirma que todas las operaciones permitan cualquier monto: hay límites positivos, validación opcional importe×galones y máximo autorizado. El defecto demostrado es que no se exige volumen y no se confronta el cierre con el consumo ya registrado. Cambiar ambos valores de forma coherente tampoco acredita consumo físico. Se requiere una fuente de consumo confiable dentro del piloto y luego un adaptador si se integra hardware.

### CRÍTICOS / MUST

Prioridad oficial de los RF relacionados; las reglas y RNF transversales se relacionan sin asignarles MoSCoW individual. Dificultad estimada de ingeniería, no presupuesto ni compromiso de fecha.

| Gap / ID | Qué falta y por qué se identifica | Impacto | Dificultad | Dependencias externas | ¿Simulable académicamente? / ¿servicio real? |
|---|---|---|---|---|---|
| G-01 RF-07/09/10; RN-03/04 | Aprobación prepago persistida antes de despacho y límite autorizado Backend; hoy timer UI | Despacho sin aprobación demostrable | ALTA | Proveedor solo para cobro comercial | Sí, simulador server-side con estados; dinero real requiere pasarela |
| G-02 RF-06/09 | Integración/resultados de pasarela, rechazo/error/pendiente y reconciliación; provider siempre DEMO | No satisface integración oficial | ALTA | Contrato, sandbox y credenciales de proveedor | Sí para protocolo demo; servicio real para integración financiera |
| G-03 RF-08/13; RN-05/09; RNF-13 | Cantidad obligatoria, consistencia con avance, precio congelado y mismo vehículo; E-03/E-05 | Cobro por importe inconsistente o compra bloqueada al variar tarifa | MEDIA | Ninguna para núcleo; telemetría para campo | Sí con fuente simulada autoritativa; no exige pasarela |
| G-04 RN-06; RF-08/09; RNF-14 | Todos los mensajes y registro local deben respetar PAYMENT_PENDING; E-04 | Deuda presentada como cobrada | BAJA | Ninguna | Sí, casos de deuda parcial y liquidada |
| G-05 RNF-12; RF-12/13 | Recuperación sin descarte por red/401/503; persistir reserva desde inicio | Pérdida de contexto, reservas huérfanas, intervención imposible | MEDIA | Ninguna | Sí mediante corte/reanudación controlados |
| G-06 RF-01 | Condiciones básicas de uso del piloto visibles | Inicio incompleto frente al texto oficial | BAJA | Validación del texto por equipo | Sí; no requiere servicio |
| G-07 RF-03/15; RN-01 | Surtidor lógico y oferta por estación/surtidor; hoy catálogo global | Registro incompleto y combustible no contextualizado | MEDIA | Catálogo de negocio; sin hardware obligatorio | Sí |
| G-08 RF-12/13/15; RN-10 | Estado, motivo y avance persistentes de ambos modos, incluido consumo cero | Detención/interrupción sin evidencia completa | MEDIA | Ninguna en piloto | Sí; equipo real solo para corte físico |
| G-09 RF-14 | Generación/confirmación como servicio con estado de emisión/reintento; usar snapshot al renderizar | TXT sin ciclo de comprobante y posible divergencia visual | MEDIA para demo; ALTA comercial | Proveedor fiscal para emisión real | Sí demo explícita; real requiere proveedor/SUNAT según solución elegida |
| G-10 RF-19; RN-16 | Solicitud de ayuda persistida y recepción/intervención; hoy temporizador | Cliente cree que llegará ayuda inexistente | MEDIA | Personal/receptor del piloto; sin IA necesaria | Sí con consola y operador simulado explícito; atención real requiere personal |
| G-11 RF-22; RNF-06 | Auditoría actor/acción/fecha/resultado de login, autorización, pagos, cambios e incidentes | No se puede reconstruir toda operación crítica | MEDIA | Ninguna en piloto | Sí; no exige cloud |
| G-12 RNF-04/05/07/08/02/03 | Validación transversal pendiente: privacidad, TLS/terminal, fallos, accesibilidad, rendimiento completo y recuperación de servicios | No se acredita uso externo confiable | MEDIA/ALTA según despliegue | Entorno de validación, usuarios, dominio/certificado si se publica | Pruebas locales sí; cumplimiento productivo exige entorno/políticas reales |

G-12 no reclasifica RNF como MUST oficial: se incluye como condición transversal para demostrar los RF MUST y decidir exposición externa. Corregir las brechas de mayor impacto primero no cambia MoSCoW.

### IMPORTANTES / SHOULD

| Gap / ID | Qué falta y por qué | Impacto | Dificultad | Dependencias externas | ¿Simulable académicamente? / ¿servicio real? |
|---|---|---|---|---|---|
| G-13 RF-02 | Ayuda contextual consultable/comprensión básica; hay frases y síntesis, no asistente de consultas | Guía incompleta | MEDIA para guion; ALTA IA integral | Modelo/proveedor solo si se elige IA externa | Sí con asistente explícitamente simulado; IA comercial no obligatoria para prototipo |
| G-14 RF-18; RN-14 | Incidentes vinculados a compra/estación/fecha/evidencia; no modelo ni endpoint | No gestión de excepciones/impagos | MEDIA | Definición de incidentes y política de evidencia | Sí, evidencia sintética; real requiere procedimiento y datos autorizados |
| G-15 RF-20; RN-11 | Panel Backend con filtros, estados/incidentes y roles; hoy tabla local | Supervisión y permisos inexistentes | ALTA | Requisitos de roles/usuarios del piloto | Sí con datos sintéticos y autenticación real local |
| G-16 RF-21; RN-11 | Configuración autorizada de productos/límites/medios y registro de cambios | Parámetros solo se editan técnicamente | MEDIA | Validación de parámetros de negocio | Sí; no servicio externo obligatorio |

### OPCIONALES / COULD

| Gap / ID | Qué falta y por qué | Impacto | Dificultad | Dependencias externas | ¿Simulable académicamente? / ¿servicio real? |
|---|---|---|---|---|---|
| G-17 RF-16; RN-12 | Registro de miembro y vínculo autorizado de vehículo; solo seed/consulta | Gestión de cliente recurrente incompleta | MEDIA | Política de autorización | Sí; verificación de identidad real depende del mecanismo elegido |
| G-18 RF-17, validación física adicional | Webcam/placa real, muestra de OCR y precisión fuera del fixture | Falta evidencia de campo, no ausencia del componente | MEDIA | Cámara, iluminación y placas autorizadas | Fixture ya disponible; prueba física requiere cámara, no pasarela |

RF-17 figura CUMPLE para obligación software, por lo que G-18 no se cuenta como COULD incumplido: es ampliación de verificación de campo.

### FUERA DEL ALCANCE ACTUAL

| Tema | Base del documento / razón | Impacto y dificultad | Dependencia | Simulación / servicio real |
|---|---|---|---|---|
| Fabricación de módulo e instalación de infraestructura de surtidores | Excluidas en §1.5 pp.5–6 | No se exige realizarlas para piloto software; ALTA | Fabricante/estación, seguridad y metrología | Simulador permitido; integración física posterior exige equipo compatible |
| Integraciones comerciales adicionales no definidas | WON'T por ahora en §3.6 p.30 | No contarlas como RF faltantes; ALTA variable | Negocio y proveedores | Simulación opcional, no prioridad actual |
| Producción cloud y operación mantenida | Cap. V: despliegue formal pendiente, mantenimiento no iniciado | No declarar fases completadas; ALTA | Infraestructura, operación y políticas | Docker local no demuestra producción |
| Certificación y operación real de pagos/facturación/hardware | Limitaciones de §1.5; no ejecutadas aquí | Necesarias para uso real según solución; ALTA | Proveedores y entorno autorizado | Demo no certifica uso real |
| Instalación APK, segundo dispositivo LAN y Debian físico | Verificación de las plataformas disponibles, no nuevos RF oficiales | Evidencia pendiente; BAJA/MEDIA | Dispositivo/host/red | Navegador o build no sustituyen ejecución física |

**Pagos y comprobantes no se retiran del alcance funcional:** RF-06 y RF-14 continúan MUST y parcialmente cumplidos. Lo futuro/externo es su operación comercial y certificación; la falta de proveedor no justifica declarar cumplida la integración.

### Documento versus V9: clasificación de diferencias

Estas letras clasifican diferencias; no son estados de conformidad adicionales.

| Clase solicitada | Diferencia concreta | Conclusión |
|---|---|---|
| A. INCUMPLIMIENTO REAL | Prepago autorizado por timer; consumo final puede rebajarse; precio no congelado; deuda etiquetada Pagado; recuperación descarta por 503/401 | E-01…E-05. No se justifica como evolución técnica. |
| A. INCUMPLIMIENTO REAL | Incidentes/configuración inexistentes; ayuda y panel operativos solo simulados; auditoría incompleta | E-06/E-07. Las prioridades originales se mantienen; algunas son SHOULD. |
| B. EVOLUCIÓN VÁLIDA | Ledger de saldo, reservas de crédito, FIFO y snapshots | Complementan el dominio; deuda válida condicionalmente a no simular pago completado y validar su política. |
| B. EVOLUCIÓN VÁLIDA | Perfil fiscal y preferencias adicionales | Amplían la captura con trazabilidad; no acreditan identidad ni emisión fiscal. DNI no es totalmente nuevo en el PDF. |
| C. DOCUMENTACIÓN DESACTUALIZADA | Comentarios de schema afirman que postpago usa solo saldo; comentarios de pintarResumen dicen que ambos modos quedan pagados | No reflejan deuda V9. Proponer corrección técnica posterior, sin tocar PDF. |
| C. DOCUMENTACIÓN DESACTUALIZADA | README «No se usa localStorage como base de datos fiscal» requiere matiz; operación guardada sí contiene DNI/RUC/razón social | PostgreSQL es fuente central, pero existe copia local transitoria y posible retención tras fallos. |
| C. DOCUMENTACIÓN DESACTUALIZADA | Mensajes «Pago integrado», «Operativo 24/7» y ayuda «operador asignado/ha llegado» | Presentan capacidades/condiciones no verificadas; aclarar demo antes de exposición. |
| C. DOCUMENTACIÓN DESACTUALIZADA | Tabla tecnológica del PDF no enumera PlateRecognition ni deuda/ledger/snapshots actuales | Inventario académico incompleto respecto a evolución; no invalida RF-17 ni autoriza modificar PDF. |
| D. DIFERENCIA TÉCNICA SIN IMPACTO FUNCIONAL | PDF/Compose por defecto 8081/8082/3000/5433; .env local 9081/9082/3100/5434 | Parametrización para evitar colisiones. No incumplimiento mientras URLs configuradas coincidan. |
| D. DIFERENCIA TÉCNICA SIN IMPACTO FUNCIONAL | KIOSK_SECRET en .env Compose se inyecta como KIOSK_API_KEY | Alias explícito, no guard faltante por nombre distinto. |
| D. DIFERENCIA TÉCNICA SIN IMPACTO FUNCIONAL | OCR local Tesseract/OpenCV detrás de HTTP | El PDF no impone PaddleOCR/EasyOCR; motor local es compatible. |
| D. DIFERENCIA TÉCNICA SIN IMPACTO FUNCIONAL | Separar autorización/reserva/finanzas en varios modelos | Permitido si conserva reglas y trazabilidad; los defectos de precio, recuperación e intervención siguen siendo clase A. |
| D. DIFERENCIA TÉCNICA SIN IMPACTO FUNCIONAL | NestJS/Prisma/PostgreSQL/Nginx/Docker/Capacitor | Ya descritos en cap. V; no contradicción de arquitectura ni prueba de fase productiva. |

El informe histórico `VALIDATION.md` no se considera falso porque Docker esté apagado hoy: describe otra fecha. Sí es insuficiente para probar el estado de ejecución actual o ausencia de los defectos encontrados.

Se encontró además un test Android heredado desactualizado: `FrontEnd_2/android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` espera el paquete `com.getcapacitor.app`, mientras `android/app/build.gradle` define `com.primax.prime`. No se ejecutó instrumentación Android ni se corrigió el test en esta auditoría. Debe actualizarse antes de usarlo como evidencia física; la prueba JVM de ejemplo no demuestra el flujo de negocio.

### Pruebas, metodología y limitaciones de evidencia

| Ejecución en esta auditoría | Resultado | Qué demuestra / qué no |
|---|---|---|
| Backend: npm.cmd test | 9 suites, **80/80** | Servicios con mocks, límites, replay, reglas de saldo, gateway OCR, auth y propiedad; no PostgreSQL vivo ni proveedor |
| FrontEnd_1: npm.cmd test | **32/32** | Servicio de operación/recovery con dobles; varios tests de terminología inspeccionan regex de código, no flujo navegador |
| FrontEnd_2: npm.cmd test | **13/13** | Servicios con API simulada, sesión, recarga, historial, errores |
| FrontEnd_2: npm.cmd run build | Exit 0, sin credenciales demo en este build | Artefacto web generado; no reconstruye APK ya existente |
| FrontEnd_2: npm.cmd run test:mobile | **24/24**, 28.8 s | Chrome con viewports 360×800, 390×844, 412×915; API interceptada por tests/api-fixture.cjs; no Android físico |
| Probes fuente aislada | **6/6 escenarios reproducidos** | Incluyen 2 errores de recuperación, estado deuda, prepago sin servidor, cierre menor al avance y cambio de precio. No se suman como pruebas de aceptación aprobadas |
| Medición UI local | 10 muestras × 2 transiciones, 1 calentamiento excluido | Dos transiciones <2 s con catálogo fixture; RNF-02 completo sigue NO VERIFICABLE AÚN |
| Compose config --quiet, local y LAN | Exit 0 ambos | Resolución/sintaxis de Compose; no levanta ni mide servicios |
| Docker compose ps | Exit 1; named pipe de Docker Desktop ausente, también fuera de sandbox | Impide verificar stack activo; no se presentan servicios healthy actuales |
| Inspección .env / Git ignore | JWT y KIOSK_SECRET presentes, ≥32 caracteres, sin marcador REPLACE_; ignorados por Git | No se imprimieron valores; longitud no acredita entropía, rotación ni seguridad productiva |
| PDF | 51 páginas y 6 diagramas leídos; hash registrado | Fuente oficial sin edición |

**Total de pruebas existentes reejecutadas: 149 = 80 + 32 + 13 + 24.** Las seis reproducciones negativas y la medición son evidencia adicional, no «cumplimientos» ni casos que se sumen a los 247 históricos. El primer intento `npm test` tropezó con la política de scripts de PowerShell; se usó `npm.cmd` sin modificar la política del sistema.

Se inspeccionaron los cuerpos de `Backend/test/api.e2e-spec.ts`, `Backend/test/v9.e2e-spec.ts`, `tools/integration.spec.cjs`, `tools/v9-flow.spec.cjs`, `tools/v9-ui.spec.cjs`, `PlateRecognition/test_ocr.py` y las pruebas móviles. Los E2E de deuda hacen compras sin gallons: esa cobertura no acredita RN-05. El test de recuperación 404 no cubre la distinción con 503/401. El test integral comprueba `#t-estado`, no que el pie y panel local no digan pagado. Estos vacíos explican por qué suites verdes coexisten con incumplimientos.

Evidencia histórica disponible del 12/10: 80 E2E Backend, 7 OCR Python, 8 UI FuelFlow V9, 1 flujo integral y 2 integraciones heredadas, además de otras suites repetidas hoy. No se atribuyen nuevos resultados de esas pruebas ni se accedió a los esquemas conservados. El archivo `tools/evidence/v9-flow.json` guarda referencia de la compra histórica; no es un log íntegro firmado ni prueba independiente de la base actual. Además, el test integral tiene una rama de repetición que solo verifica la compra ya liquidada: esa rama no vuelve a recorrer todo el flujo.

**Rendimiento:** muestra secuencial con un usuario, sin throttling ni carga concurrente; cronómetro desde click DOM a pantalla activa + un frame. Inicio→catálogo: mediana 15.3 ms, p95/máximo 18.1 ms. Selección→modalidad: mediana 914.75 ms, p95/máximo 919.7 ms. No se midieron arranque frío, render completo perceptual, interacción humana, API real ni todas las pantallas. El percentil usa rango más próximo; con 10 muestras p95 coincide con máximo. No extrapolar a producción.

**Infraestructura:** `postgres_data` mantiene datos; redes app/data separan frontends de DB; backend está en ambas; OCR solo en data. Postgres 17.6 y migraciones aditivas existen. Algunas constraints V9 son NOT VALID: verifican nuevas escrituras pero no acreditan retrospectivamente todas las filas históricas. El ledger se usa como append-only desde servicios, pero no se halló una prohibición SQL general de UPDATE/DELETE que certifique inmutabilidad frente a acceso directo. Migrate/seed son tareas de una ejecución, no servicios permanentes. Backend health verifica DB, no todas las dependencias; restart no garantiza recuperación de una compra.

**Seguridad y privacidad:** no certificación jurídica ni evaluación de cumplimiento legal; se describen controles y carencias. No se probaron datos personales reales. No se publicaron secretos. El proxy kiosco inyecta la clave en rutas permitidas: al publicar FuelFlow en LAN/Internet hace falta controlar quién puede usar esas rutas; ocultar la clave en Nginx no autentica al usuario final. Android debug permite HTTP y la configuración actual admite mixed content; el despliegue productivo externo cifrado permanece pendiente.

## F. RESUMEN EJECUTIVO HISTÓRICO (16/10; resumen vigente en G)

V9 tiene una base técnica amplia y comprobable, pero **no cumple íntegramente la línea base académica**. El mayor avance está en la interfaz de autoservicio, contabilidad interna, persistencia, idempotencia, OCR software y separación de componentes. Las extensiones de fidelización/deuda no compensan los MUST pendientes de pago previo, soporte humano, registro completo y auditoría.

| Tipo | Total | CUMPLE | CUMPLE PARCIALMENTE | NO CUMPLE | NO IMPLEMENTADO | NO VERIFICABLE AÚN |
|---|---:|---:|---:|---:|---:|---:|
| RF | 22 | 4 | 15 | 1 | 2 | 0 |
| RNF | 14 | 1 | 10 | 2 | 0 | 1 |
| RN | 16 | 4 | 5 | 6 | 1 | 0 |
| **Total** | **52** | **9** | **30** | **9** | **3** | **1** |

| Prioridad oficial RF | Total | CUMPLE | Pendientes de cumplimiento completo | Desglose pendiente |
|---|---:|---:|---:|---|
| MUST | 16 | 3: RF-04, RF-05, RF-11 | 13 | 12 parciales + RF-07 NO CUMPLE |
| SHOULD | 4 | 0 | 4 | RF-02/20 parciales; RF-18/21 NO IMPLEMENTADO |
| COULD | 2 | 1: RF-17 | 1 | RF-16 parcial |
| WON'T por ahora | Sin IDs RF individuales | No se contabiliza | Integraciones comerciales adicionales no definidas en alcance | No incluye silenciosamente pagos/comprobantes ya MUST |

RF completos: RF-04, RF-05, RF-11, RF-17. RNF completo: RNF-11. RN completas: RN-02, RN-08, RN-13, RN-15. Los dictámenes de RF-11/17 y RN-15 están expresamente acotados a capacidades software del piloto y asistencia disponible; no a equipos físicos ni IA general.

### Decisión recomendada antes de exposición, publicación o merge

1. **Antes de exposición:** corregir primero deuda presentada como Pagado/COBRADO, descarte de recuperación por fallos transitorios, cierre inferior al avance/volumen omitido y precio no congelado. Mostrar claramente pagos, comprobantes, panel y asistencia como demo; quitar anuncios de llegada humana inexistente y disponibilidad no acreditada. Explicar RF-07 como incumplimiento hasta que exista aprobación Backend anterior al despacho.
2. **Siguiente incremento técnico:** autorización prepago y simulador de resultados, ciclo de operación coherente, eventos auditables y solicitud humana persistente. Definir criterios negativos verificables antes de programar. No hace falta integrar dinero real ni hardware para demostrar correctamente estas reglas en software.
3. **Recomendable después:** incidentes, roles/panel/filtros/configuración, política de datos, pruebas completas de rendimiento/usabilidad/accesibilidad y recuperación de servicios. Conservar las prioridades SHOULD de administración y los COULD de membresía/OCR.
4. **Trabajo futuro condicionado:** proveedor de pagos y comprobantes, piloto físico, pruebas Android/segundo equipo/Debian, despliegue HTTPS y operación productiva. El documento permanece en DISEÑO/CONSTRUCCIÓN; no declarar pruebas formales cerradas, despliegue productivo completado ni mantenimiento iniciado.
5. **No aceptar como conformidad total** este corte para Internet o merge de «cumplimiento completo». Si se integra como avance académico, incluir explícitamente los estados y gaps de esta auditoría, sin alterar el PDF para acomodar la implementación.

### Entregables y control de cambios

Se crearon exclusivamente estos entregables de auditoría:

- `REQUIREMENTS-COMPLIANCE.md`.
- `docs/audit-v9/probes.cjs` y `docs/audit-v9/probes-results.json`.
- `docs/audit-v9/performance.cjs` y `docs/audit-v9/performance-results.json`.

No se modificaron fuentes funcionales, tests existentes, migraciones, configuración versionada, PDF ni V8. La ejecución del build/test regeneró artefactos ignorados de Prime (`www` y resultados de tests). Se utilizaron dependencias temporales para leer/renderizar el PDF; se eliminaron únicamente esos artefactos temporales propios al terminar.

Git inicial: `?? ../V8/` y `?? docs/` ya estaban presentes. Git final observado: `?? ../V8/`, `?? REQUIREMENTS-COMPLIANCE.md` y `?? docs/`. El detalle de docs contiene el PDF preexistente y los cuatro artefactos nuevos de auditoría. `git diff --stat`: vacío, porque no hay cambios en archivos con seguimiento. `git diff --check`: exit 0, sin errores; los cinco archivos nuevos también pasaron revisión explícita de whitespace. Se validaron los 52 IDs únicos, sus estados y los 11 campos de cada matriz. SHA-256 final del PDF idéntico al registrado al leerlo. No se ejecutaron add, commit, push, merge ni operaciones destructivas sobre datos.





## G. FASE DE CORRECCIÓN CRÍTICA — 17/10/2026

Alcance: exclusivamente las seis prioridades transaccionales solicitadas. Se contrastaron nuevamente las tablas RF/RNF/RN y MoSCoW del PDF, pp. 20–29. SHA-256 final del PDF: `0FAF3FD369EDFE4627403F0627DECF2CB22A2B1B930E2167F0849DE1FB8AB93E`, idéntico al inicial. No hay pasarela comercial, SUNAT, administración completa, sistema humano completo, cloud ni despliegue. No se hicieron add, commit ni push.

### Causas y correcciones verificables

| Problema original | Causa raíz | Corrección |
|---|---|---|
| E-01 prepago antes de servidor | `procesarPago` marcaba pago autorizado tras 2 s; Payment se creaba al cerrar | Pago DEMO persistido primero, relectura CAPTURED, validación de reglas y autorización posterior. Sin respuesta Backend no empieza el simulador. Un resultado local cacheado también se revalida. |
| E-05 deuda mostrada Pagado | Etiquetas y estado COBRADO incondicionales; estados derivados incompletos | Proyección financiera en ambos frontends, ticket/TXT/pie/historial/panel/detalle. Historial legado sin evidencia pasa a por verificar. No se cambió FIFO ni distribución de deuda. |
| E-03 cierre S/1 frente a S/80 | Galones opcionales; cierre nunca se comparaba con avance; faltaba vehículo exacto | Cierre exige gallons y autorización para ambos modos; importe y volumen deben coincidir con el registro; valida identidad, límite, estado y precio. Nuevas cargas tras SETTLED se rechazan. |
| E-04 cambio de precio | Se consultaba el catálogo al liquidar | Snapshot `unitPrice` al autorizar; validación del precio confirmado y uso exclusivo del snapshot al avanzar/cerrar. Registros viejos sin precio requieren revisión. |
| E-02 descarte 401/503 | `catch` indiscriminado asumía 404; otro camino descartaba también tras replay fallido | Clasificación explícita 404, autenticación, indisponibilidad, timeout/red; estado bloqueado recuperable, UUID/cuerpo conservados y reintento idempotente. |
| RN-16 continuación tras fallo | Errores de progress se ignoraban y no existía intervención persistida | Se detiene timer, conserva snapshot y solicita `INTERVENTION_REQUIRED`. Backend bloquea avance/cierre/liberación. Reservas de saldo/crédito en intervención siguen comprometidas; prepagos no cuentan como crédito Prime. |

### Evidencia de pruebas

| Ejecución | Resultado | Alcance |
|---|---|---|
| Backend `npm.cmd test` | **100/100**, 10 suites | 80 existentes adaptadas al protocolo + 20 nuevas de integridad. Repositorios aislados; el doble clic usa serialización del doble, no prueba aislamiento PostgreSQL. |
| FuelFlow `npm.cmd test` | **49/49** | 32 existentes + 17 nuevas. Reproducción del timer sin respuesta, deuda en ticket/historial, recuperación 401/403/404/503/timeout, caché y detención crítica. |
| Prime `npm.cmd test` | **21/21** | 13 existentes + 8 nuevas de proyección financiera, incluyendo pago desconocido. |
| Prime `npm.cmd run test:mobile` | **24/24** | Chrome, tres viewports, API fixture; deuda pendiente pasa a Pagado solo después de recarga confirmada. No es Android físico. |
| Backend build, `tsc --noEmit`, lint; builds de ambos frontends | **Exit 0** | Compilación incluye fuentes y pruebas E2E; no acredita migración ejecutada. |
| Backend E2E existentes, dentro y fuera del sandbox | **80 casos fallan en setup**, P1001 localhost:5434 | PostgreSQL detenido; ninguno se cuenta como aprobado ni como reproducción funcional de esta versión. |
| E2E crítica nueva en `v9.e2e-spec.ts` | Escrita y compilada; **pendiente de ejecución funcional** | Pago previo, concurrencia, seis manipulaciones y price lock por HTTP/Prisma. |
| Stack V9 UI/flujo integral | **9 fallan**, servicios locales inaccesibles | No demuestra flujo con Backend; no se suman como aprobados. |
| OCR local | Importación falla por `ModuleNotFoundError: cv2` | Los 7 casos OCR no se ejecutaron funcionalmente. No se instalaron runtimes ajenos al núcleo corregido. |

**Total aprobado: 194 = 100 + 49 + 21 + 24. Casos nuevos: 46 = 20 Backend + 17 FuelFlow + 8 Prime + 1 E2E; 45 aprobados y el E2E pendiente.** Las suites PostgreSQL y stack detenidas no se ocultan en el total verde. Logs y resumen de comandos: `docs/audit-v9/critical-*.log`, `critical-checks.json`. Las seis reproducciones del informe original se reemplazan como evidencia vigente por las pruebas negativas de esta fase; `probes-results.json` se conserva como evidencia histórica, sin reescribir sus hallazgos.

### Reevaluación y MUST restantes

Se actualizaron individualmente RF-07/08/09/10/12/13/15, RNF-07/12/13/14 y RN-03/04/05/06/07/09/10/16 en sus matrices. Mejoran sus controles y evidencia, pero permanecen **CUMPLE PARCIALMENTE**: ninguna corrección nueva se elevó a CUMPLE con integración/migración pendientes. RF-09, RF-15, RNF-07 y RN-16 además conservan brechas de proveedor, eventos o intervención humana fuera de esta fase.

| Tipo | Total | CUMPLE | CUMPLE PARCIALMENTE | NO CUMPLE | NO IMPLEMENTADO | NO VERIFICABLE AÚN |
|---|---:|---:|---:|---:|---:|---:|
| RF | 22 | 4 | 16 | 0 | 2 | 0 |
| RNF | 14 | 1 | 12 | 0 | 0 | 1 |
| RN | 16 | 4 | 10 | 1 | 1 | 0 |

**MUST todavía sin cumplimiento completo: 13/16** — RF-01, RF-03, RF-06, RF-07, RF-08, RF-09, RF-10, RF-12, RF-13, RF-14, RF-15, RF-19 y RF-22. Los tres MUST ya completos de la auditoría son RF-04, RF-05 y RF-11. Este recuento conserva la prioridad oficial, no convierte RN/RNF en nuevas prioridades MoSCoW.

### Pendientes reales y límites de la corrección

- Ejecutar la migración `20261017000000_critical_transaction_integrity` y los E2E en PostgreSQL local disponible; revisar concurrencia, constraints y recorridos de ambos frontends. No se aplicó migración a una base existente ni se alteraron saldos reales.
- Recuperación con conexión caída: el navegador detiene y conserva; no puede garantizar escritura remota de intervención durante la caída. Al volver a iniciar intenta persistirla si conoce la autorización. Si se perdió la respuesta inicial y no se conoce el id, la operación queda conservada para revisión por operationId.
- No se implementó resolución humana ni devolución bancaria de excedente prepago; un prepago detenido sin consumo requiere intervención. Payment conserva el monto aprobado; Transaction conserva el consumo final. No son reembolsos reales.
- El proveedor sigue siendo DEMO determinista. Los estados negativos se inyectan en pruebas de servicio; no son integración Yape/Plin, webhooks ni pasarela comercial.
- El avance procede del simulador kiosco y pasa validaciones de precio/límite/monotonía. Esta fase impide manipular el **cierre** respecto del registro; no acredita medición física independiente ni seguridad productiva del proxy kiosco expuesto.
- Condiciones iniciales, habilitación por surtidor, comprobante fiscal, auditoría completa, asistencia operativa, privacidad/roles y demás brechas no transaccionales conservan su dictamen original. No se implementaron para inflar cumplimiento.

### Archivos del cambio

Backend: `prisma/schema.prisma`, migración `20261017000000_critical_transaction_integrity/migration.sql`; `src/transactions/{authorizations.controller,authorizations.repository,authorizations.service,create-authorization.dto,create-transaction.dto,transactions.service}.ts`; `src/wallet/{debt,wallet.repository}.ts` (solo inclusión de intervención y separación de prepago en reservas); unitarias `authorizations.service.spec.ts`, `transactions.service.spec.ts`, nueva `critical-integrity.spec.ts`; `test/{api.e2e-spec,v9.e2e-spec,recorded-purchase}.ts`.

FuelFlow: `src/js/{apiClient,script,transactionsService,paymentState}.js`; `tests/{recovery,terminology,critical}.test.js`. Prime: `js/app.js`, `js/views.js`, `js/services/{index,paymentState}.js`, `tests/payment-state.test.js`, `tests/v9.spec.cjs`. Documentación: este informe y nueva evidencia `docs/audit-v9/critical-*`. El PDF y los cuatro artefactos de auditoría anteriores permanecen intactos. Los scripts auxiliares de edición y el lector temporal PDF se retiraron al terminar.

Control final: ejecutar y revisar `git status`, `git diff --stat` y `git diff --check`; conservar los archivos sin staging. La carpeta V8 ya aparecía como untracked antes de comenzar y no fue modificada.

## H. Cierre de validación integrada — 19/10/2026

### Entorno comprobado

Docker Desktop estaba disponible: los cinco servicios V9 ya estaban saludables, pero sus imágenes precedían las correcciones críticas. Se reconstruyeron backend, migrate, tests, frontend1, frontend2 y plate-recognition. Se activaron con `up -d --no-deps --wait` los cuatro servicios de aplicación; PostgreSQL conservó su contenedor y volumen `primax-v9_postgres_data`. No se ejecutó seed sobre public ni se borraron volúmenes, esquemas o datos existentes.

`prisma migrate deploy` aplicó únicamente `20261017000000_critical_transaction_integrity`; `prisma migrate status` confirmó las ocho migraciones al día. Backend → Prisma → PostgreSQL comprobado por HTTP 200 `{"status":"ok","database":"up"}`. Frontend1, frontend2, backend, postgres y plate-recognition quedaron healthy. HTTP 200: FuelFlow `http://localhost:9081`, Prime `http://localhost:9082`, health `http://localhost:3100/api/v1/health` y Swagger `http://localhost:3100/api/docs`.

OpenCV ya estaba declarado reproduciblemente como `opencv-python-headless==4.12.0.88`; el Dockerfile instala requirements. `import cv2` devolvió 4.12.0 y los siete tests OCR pasaron con Tesseract/OpenCV dentro del contenedor. No hizo falta cambiar requirements ni instalar paquetes manualmente en Windows. El Python del host no es el entorno acreditado.

### Pruebas finales y conteo

| Grupo | Aprobados | Fallidos | Omitidos | Total |
|---|---:|---:|---:|---:|
| Backend unitarias | 100 | 0 | 0 | 100 |
| FuelFlow unitarias | 49 | 0 | 0 | 49 |
| Prime unitarias | 21 | 0 | 0 | 21 |
| Mobile navegador | 24 | 0 | 0 | 24 |
| OCR contenedor | 7 | 0 | 0 | 7 |
| Backend E2E PostgreSQL | 84 | 0 | 0 | 84 |
| Docker/integración navegador | 11 | 0 | 0 | 11 |
| **Total final** | **296** | **0** | **0** | **296** |

No se suman reejecuciones. Mobile son ocho escenarios por tres viewports; si se agrupan también esas configuraciones, son **280 escenarios**. Docker/integración son nueve casos V9 y dos heredados ampliados. El caso `v9-flow` reconsultó la transacción histórica `99792f33-098b-45b8-92c8-dcf417606270`: verificó PAID/CAPTURED/deuda cero, **no repitió el ciclo histórico de deuda por navegador**. Los ocho UI restantes se ejecutaron; uno utiliza OCR real, otros inyectan fixtures. Backend sí ejecutó nuevamente deuda, FIFO y recarga con PostgreSQL real. Mobile usa API fixture, no Android físico.

El E2E crítico originalmente pendiente aprobó. Se añadieron tres casos: PENDING persistido, REJECTED persistido e intervención persistida. Los 46 casos de la fase crítica anterior quedan aprobados; los tres nuevos se cuentan una sola vez. Backend lint/build y builds de ambos frontends aprobaron. Construcción de imágenes y comprobaciones Docker/HTTP/secretos aprobaron y no se suman como tests adicionales.

Logs locales: `docs/audit-v9/integrated-{migration,backend-final,fuelflow,prime,mobile,ocr,stack-v9,browser-final,docker,tests-build}.log`. Los logs están ignorados por Git; este informe y `integrated-results.json` conservan el resumen revisable. Esquemas finales preservados: `e2e_580a4a409acb4a3aa0a109520c1c6338` y `e2e_v9_a4b5365b145d43d48a581d097b3e0b48`.

### Escenarios críticos realmente ejecutados

- **A / Prepago:** fixtures de resultados DEMO PENDING y REJECTED persistidos en PostgreSQL rechazan dos intentos HTTP sin crear autorización ni duplicar Payment. CAPTURED persistido permite una sola autorización ante solicitudes concurrentes. No son respuestas de una pasarela comercial.
- **B / Cierre:** seis manipulaciones de amount/gallons/unitPrice rechazadas por HTTP. El cierre válido usa el avance registrado.
- **C / Precio:** autorización con X, cambio de catálogo a Y en esquema E2E y cierre conservando X; catálogo restaurado al terminar. También hay cobertura unitaria de ambas modalidades.
- **D / Recuperación:** 401, 403, 404, 503 y timeout inyectados en transporte Playwright alrededor de una compra real. 401/403 bloquean por autenticación/permisos; 404 produce una decisión de descarte diferenciada; 503 bloquea por indisponibilidad y timeout por tiempo agotado. El estado almacenado permanece idéntico durante reconcile. El timeout utiliza el AbortSignal real de 15 segundos. Después se retira la inyección y se recupera contra la API activa. No se apagó físicamente Backend durante un despacho.
- **E / Deuda:** PostgreSQL comprueba PAYMENT_PENDING/PARTIAL y liquidación; tests de proyección de ambos frontends y navegador móvil muestran pendiente hasta confirmación. No se declara un nuevo ciclo completo de deuda entre ambos navegadores reales.
- **F / Intervención:** endpoint idempotente persiste INTERVENTION_REQUIRED, importe 40.00 y galones; progress/release/cierre devuelven 409, saldo reservado conservado y ninguna Transaction. El test FuelFlow comprueba detención del timer y snapshot. Resolución humana fuera de alcance.
- **Concurrencia:** doble clic, solicitudes concurrentes, reintentos y operationId verifican una autorización/pago/compra/deuda/recarga en los casos correspondientes. Compra real final `dd81795a-ae42-48c4-87bd-90aa8f713825`, operationId `644f404c-c899-473d-bd94-c6c2bb984169`: un Payment y un RewardMovement, historial Prime visible, replay HTTP sin nueva compra.

Las ejecuciones del navegador agregaron compras y puntos DEMO normales; no reinicializaron saldos ni borraron datos para hacer pasar pruebas. La última compra aumentó puntos de 322 a 422. Los esquemas E2E son independientes y permanecen como evidencia.

### Reevaluación limitada

**De PARCIAL a CUMPLE (9):** RF-07, RF-08, RF-13; RNF-13; RN-03, RN-04, RN-05, RN-06 y RN-09. Cumplimiento de sus obligaciones concretas dentro del piloto software DEMO, no de producción ni requisitos vecinos.

**Siguen PARCIALES (10 del alcance):** RF-09, RF-10, RF-12, RF-15; RNF-07, RNF-12, RNF-14; RN-07, RN-10 y RN-16. Sus matrices detallan las brechas. Los demás requisitos conservan su dictamen.

**MUST pendientes: 10/16:** RF-01, RF-03, RF-06, RF-09, RF-10, RF-12, RF-14, RF-15, RF-19 y RF-22. No se reclasifica RN/RNF como MUST. Totales derivados de las matrices: RF 7 cumplen / 13 parciales / 2 no implementados; RNF 2 cumplen / 11 parciales / 1 no verificable aún; RN 9 cumplen / 5 parciales / 1 no cumple / 1 no implementado.

### Fallos y límites restantes

No quedan tests fallidos en las suites finales. Una ejecución inicial de integración falló porque el test no aceptaba el diálogo existente «Compra recuperada» antes de leer el ticket; se corrigió únicamente el test. Los dos fixtures negativos añadidos inicialmente omitían el default `receiptType` del DTO en el hash y fueron corregidos usando la transformación real del DTO. La repetición final completa Backend aprobó 100 + 84. El ERROR Prisma del log heredado corresponde al caso intencional de error controlado, no a un fallo de salud.

Pendientes manuales/externos, no aprobados: corte real durante despacho y recuperación completa, resolución humana operativa, proveedor comercial/reconciliación/reembolsos, nuevo recorrido deuda→recarga entre ambos navegadores sin reutilizar evidencia histórica, APK en teléfono/emulador, cámara física y validaciones LAN/Debian externas si se requieren. No se añadieron esas funcionalidades ni se hizo cloud/deploy.

Cambios de esta sesión: `Backend/test/v9.e2e-spec.ts` (tres casos integrados), `tools/integration.spec.cjs` (diálogo y fallos de recuperación), este documento y evidencia `docs/audit-v9/integrated-*`. Ningún archivo funcional ni requirements fue modificado en esta sesión. Se conservaron todas las correcciones críticas anteriores.

V8: 226 archivos verificados por SHA-256 contra `tools/v8-sha256.json`, intactos. `git status`, `git diff --stat` y `git diff --check` revisados; sin errores de whitespace, con avisos de conversión LF/CRLF. El working tree conserva cambios anteriores y nuevos, sin staging. V8 sigue como `?? ../V8/`, estado preexistente. No se ejecutó add, commit, push, merge, reset ni limpieza destructiva.

## I. Registro real y multicanal - 19/10/2026

Registro publico, Membership automatica atomica y vinculo de vehiculo autenticado implementados. PostgreSQL conserva User/Membership/perfil/Vehicle/Transaction tras reiniciar los cinco contenedores; login nuevo y JWT verificados. Flujo completo nuevo Prime -> FuelFlow -> Prime contra la misma base, con historial y 100 puntos. No se reutilizo una compra historica para acreditar este flujo.

**330/330 casos aprobados**, cero fallidos y omitidos: 296 previos + 34 nuevos. Desglose, comandos y limites: [REGISTRATION-VALIDATION.md](docs/audit-v9/REGISTRATION-VALIDATION.md). Mobile: navegador con fixtures en tres resoluciones; APK debug compilada y escaneada, sin instalacion fisica. LAN levantada y comprobada por HTTP del host; PostgreSQL loopback/OCR interno; modo local restaurado.

RF-16 y RN-12 mejoran con registro, titular derivado del JWT, rechazo de otro propietario, idempotencia y persistencia. Permanecen parciales por politica organizacional y evidencia formal de consentimiento/titularidad. RNF-14 mejora con nueva compra multicanal, URL APK configurable y build Android; permanece parcial por ejecucion nativa y segundo dispositivo pendientes. No se promovieron requisitos sin esa evidencia ni se modificaron otros requisitos.

Sin migraciones nuevas, sin reset de datos, sin cambios a V8, sin commit/push ni despliegue. Validacion anterior preservada.
