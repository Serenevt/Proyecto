# Ventas, pagos DEMO e inventario

## Propósito, alcance y actores

Backend registra autorización previa, cobro demostrativo, consumo, transacción e inventario de una operación FuelFlow. Cliente inicia la compra; Terminal/Kiosk ejecuta solicitudes técnicas; Control/Supervisor revisan excepciones dentro de sus permisos. No hay dinero real ni medición física del surtidor.

## Precondiciones y flujo principal

`operationId` estable, `TerminalOperation` activa, estación/surtidor/combustible válidos, precio de catálogo y existencias aplicables. Backend valida identidad técnica y solicitud; crea `FuelAuthorization` e `InventoryReservation` antes del despacho. En POSTPAGO reserva saldo Prime; en PREPAGO exige pago confirmado/persistido antes de autorizar. Los avances se comparan con tope monetario y galones. Al cerrar, `Transaction` conserva precio, cantidad, importe, modalidad, método, estado, autorización y vínculos técnicos; `InventoryMovement` registra el consumo físico una vez.

## Reglas críticas y alternativas

- **SALE-001:** mismo `operationId` y misma solicitud se reintentan idempotentemente; una solicitud incompatible con ese ID se rechaza. No se duplican débito, pago, reserva, transacción ni movimiento `DISPENSE`.
- **SALE-002:** PREPAGO no autoriza sin pago capturado; QR Yape/Plin, tarjeta/NFC y efectivo son modalidades DEMO. Estados pendientes, ambiguos, rechazados o error no se presentan como éxito. Cancelación y reembolso sólo avanzan por estados permitidos y dejan eventos trazables.
- **SALE-003:** POSTPAGO exige vehículo/placa y membresía activa concordantes, saldo o límite de deuda disponible y reserva previa. El importe no consumido se libera según cierre; saldo insuficiente bloquea la autorización. Deuda y recarga se concilian sin doble cargo.
- **SALE-004:** precio unitario, monto autorizado y avance se validan con decimales persistidos. La UI detiene por importe para no sobrepasar el autorizado debido al redondeo de galones. Backend rechaza avance o cierre manipulados y exige consistencia entre `operationId`, autorización, operación terminal y transacción.
- **INV-001:** `InventoryReservation` compromete capacidad; `InventoryMovement` es ledger con clave de evento única y secuencia. `DISPENSE` reduce existencia física una sola vez; liberación/cancelación reduce reserva sin simular devolución física de combustible ya entregado.
- **INV-002:** inventario nuevo o legado con evidencia incompleta/divergente entra en `REVIEW` o `REQUIRED` según la activación/reconciliación implementada. No se autocorrige una diferencia ni se autoriza nueva operación sobre estado bloqueado; recepción y reconciliación administrativa dejan ledger y auditoría.
- **SALE-005:** interrupción o resultado incierto conserva operación y exige consulta/reintento con la misma identidad o intervención; el comprobante refleja sólo estado registrado. Datos legacy con referencias técnicas opcionales siguen consultables y reconciliables, pero no habilitan omitir Terminal Binding en ventas nuevas.

## Seguridad y datos

Creaciones nuevas de autorización, orden y transacción por Kiosk requieren BFF firmado y binding técnico. Entidades principales: `FuelAuthorization`, `Payment`, `OnlineOrder`, `PaymentEvent`, `Transaction`, `MembershipDebt`, `WalletMovement`, `InventoryActivation`, `InventoryReservation`, `InventoryMovement`, `OperationalIncident` y `OperationalAuditEvent`. PostgreSQL aplica unicidad, FK y transacciones; los reembolsos no son cambios libres de saldos.

## Criterios de aceptación y evidencia actual

- Reintentos concurrentes o respuesta perdida preservan un solo efecto; una falla de persistencia impide autorizar el despacho.
- Pago PREPAGO pendiente no dispensa; POSTPAGO insuficiente no debita; el avance no supera tope ni genera dos movimientos físicos.
- Diferencia legacy queda visible para revisión; las rutas de reconciliación requieren permisos y no alteran litros sin evento.

Evidencia: `Backend/src/transactions/`, `Backend/src/payments/`, `Backend/src/inventory/`, `Backend/prisma/schema.prisma` y migraciones `20261026010000_v12_1_inventory_reservations`, `20261026020000_v12_1_inventory_lifecycle`; `Backend/src/transactions/critical-integrity.spec.ts`, `Backend/test/inventory-foundations.e2e-spec.ts`, `Backend/test/inventory-reconciliation.e2e-spec.ts`, `Backend/test/partial-refund.e2e-spec.ts`, `FrontEnd_1/tools/financial-e2e-local.mjs`. Relación académica: RF-07–15, RN-03–10/14/16 y RNF-06/07/13.
