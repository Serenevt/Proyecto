# FuelFlow — autoservicio

## Propósito, alcance y actores

FuelFlow permite al **Cliente** completar una venta académica en una terminal preparada sin aprobación humana por cada operación. El Supervisor prepara la terminal, pero no participa como cliente ni aporta su JWT a la venta. La interfaz no cobra dinero real ni controla hardware de despacho.

## Precondiciones

Turno abierto y terminal habilitada, emparejada y asignada a estación/surtidor; sesión Kiosk y credencial técnica válidas; catálogo de estación y combustible disponible. La venta nueva conserva un `operationId` UUID asociado a una `TerminalOperation` activa. Véase [02-supervisor-terminal.md](02-supervisor-terminal.md).

## Flujo principal actual

1. El cliente pulsa **INICIAR**. FuelFlow inicia o recupera `TerminalOperation` y catálogo. En la UI actual se elige **combustible antes de la placa**.
2. Elige modalidad, monto o tanque lleno según el camino; ingresa placa y, cuando aplica, código Prime y datos del comprobante. OCR puede sugerir la placa, siempre sujeta a confirmación.
3. **POSTPAGO:** Backend comprueba placa vinculada a membresía activa y saldo disponible, reserva el importe antes del despacho y autoriza. **PREPAGO:** el cliente elige efectivo, tarjeta/NFC DEMO o Yape/Plin DEMO; la confirmación persistida del pago precede a la autorización.
4. Se informa avance de abastecimiento dentro del tope autorizado; el cliente puede detenerlo. Backend registra transacción, pago/estado y movimiento de inventario según la modalidad.
5. FuelFlow muestra resumen y comprobante académico a partir de la operación persistida. Puede imprimirse en navegador; PrintAgent local es opcional. Al finalizar se cierra la `TerminalOperation`.

## Flujos alternativos y reglas

- **FF-001:** `operationId` identifica la venta en reintentos, autorización, pago, transacción y cierre. Tras refresh se consulta Backend y se conserva la misma operación; una respuesta perdida no crea otra compra.
- **FF-002:** una operación nueva no avanza sin terminal preparada. Una operación ya iniciada puede terminar cuando el turno se cierra, según su estado válido.
- **FF-003:** el POSTPAGO requiere correspondencia entre placa y membresía activa; saldo insuficiente detiene la autorización y permite recarga/reintento de la misma venta o cambio explícito a prepago. Un rechazo no se presenta como cobro exitoso.
- **FF-004:** en PREPAGO, Yape/Plin generan orden DEMO; tarjeta/NFC y efectivo son simulaciones. La UI no puede marcar como autorizado un pago pendiente. No se atribuye integración financiera o NFC físico.
- **FF-005:** una falla, estado ambiguo o intervención conserva evidencia y ofrece recuperación/revisión; no se reenvía una transacción ya registrada. El comprobante se presenta después del registro, con estado financiero real y sin validez tributaria.
- **FF-006:** OCR y PrintAgent no son requisitos para continuar. La placa se puede ingresar manualmente y la operación puede finalizar sin impresión física.

## Seguridad y datos

Browser → proxy de mismo origen → BFF firmado → Backend; las nuevas ventas requieren credencial y operación técnica, no `KIOSK_API_KEY` directa. Datos principales: `TerminalOperation`, `FuelAuthorization`, `OnlineOrder`, `Payment`, `Transaction`, `InventoryReservation` y `InventoryMovement`. El cálculo autoritativo, límites y consistencia se especifican en [05-sales-payments-inventory.md](05-sales-payments-inventory.md).

## Criterios de aceptación y evidencia actual

- Un turno/terminal preparados permiten iniciar, autorizar, registrar y cerrar una venta POSTPAGO y otra PREPAGO DEMO por el BFF.
- Reintentar con el mismo `operationId` no duplica pago, transacción ni consumo físico; sin binding la creación se rechaza.
- Con OCR caído o sin PrintAgent, el cliente conserva placa manual y comprobante navegable.

Evidencia: `FrontEnd_1/src/js/script.js`, `FrontEnd_1/src/js/terminalOperation.js`, `FrontEnd_1/src/js/transactionsService.js`, `FrontEnd_1/tools/financial-e2e-local.mjs`, `FrontEnd_1/tests/terminal-operation.test.js`, `FrontEnd_1/tests/recovery.test.js`, `FrontEnd_1/tests/v11-payments.test.js`; `Backend/test/phase1a.e2e-spec.ts`. Relación académica: RF-01/03–15, RN-01–10 y RN-16. La diferencia de orden respecto a la secuencia solicitada se documenta en [SDD-GAPS.md](SDD-GAPS.md).
