# Trazabilidad SDD de V12.1

La matriz enlaza especificaciones **consolidadas ahora** con código y evidencia que ya existían. Rutas relativas parten de `V12.1/`. **TEST EXISTENTE** significa que el repositorio contiene esa prueba, no que esta fase documental la haya vuelto a ejecutar. **SIN COBERTURA** señala una frontera todavía no probada. Una prueba parcial se declara como tal; cámara e impresora físicas no se consideran validadas por fixtures o mocks.

| ID | Especificación | Implementación | Test/validación | Estado |
|---|---|---|---|---|
| SYS-001 | Venta nueva vinculada a terminal | `Backend/src/operations/`, `Backend/src/transactions/` | `FrontEnd_1/tools/financial-e2e-local.mjs` | TEST EXISTENTE |
| SYS-002 | Backend autoritativo para venta | `Backend/src/transactions/`, `Backend/src/inventory/` | `Backend/src/transactions/critical-integrity.spec.ts` | TEST EXISTENTE |
| SYS-003 | OCR/impresión/correo no bloquean núcleo | `FrontEnd_1/src/js/plateCamera.js`, `FrontEnd_3/js/print-agent.js`, `Backend/src/control/control.service.ts` | `tools/ocr-fallback-ui.cjs`, `FrontEnd_3/tests/print-agent.test.js`, `Backend/src/control/email-disabled.spec.ts` | TEST EXISTENTE |
| SYS-004 | Ámbitos humanos y técnicos separados | `Backend/src/auth/access.guard.ts`, `Backend/src/operations/` | `Backend/test/phase1a.e2e-spec.ts`, `Backend/test/control.e2e-spec.ts` | TEST EXISTENTE |
| FF-001 | ID y recuperación idempotente | `FrontEnd_1/src/js/transactionsService.js`, `terminalOperation.js` | `FrontEnd_1/tests/recovery.test.js`, `terminal-operation.test.js` | TEST EXISTENTE |
| FF-002 | Terminal preparada; cierre en curso | `Backend/src/operations/`, `FrontEnd_1/src/js/script.js` | `FrontEnd_1/tools/terminal-e2e-local.mjs`, `FrontEnd_1/tools/financial-e2e-local.mjs` | TEST EXISTENTE |
| FF-003 | POSTPAGO, placa y saldo | `Backend/src/transactions/authorizations.service.ts` | `Backend/src/transactions/authorizations.service.spec.ts`, `FrontEnd_1/tests/prime-flow.test.js` | TEST EXISTENTE |
| FF-004 | PREPAGO DEMO y estados de pago | `Backend/src/payments/`, `FrontEnd_1/src/js/script.js` | `FrontEnd_1/tests/v11-payments.test.js`, `Backend/test/prepaid-guest.e2e-spec.ts` | TEST EXISTENTE |
| FF-005 | Intervención y comprobante posterior | `FrontEnd_1/src/js/script.js`, `transactionsService.js` | `FrontEnd_1/tests/finalization.test.js`, `recovery.test.js` | TEST EXISTENTE |
| FF-006 | OCR/impresión opcionales | `FrontEnd_1/src/js/plateCamera.js`, `FrontEnd_1/src/js/printReceipt.js` | `tools/ocr-fallback-ui.cjs`, `FrontEnd_1/tests/printReceipt.test.js` | TEST EXISTENTE |
| SUP-001 | Turnos y alcance Supervisor | `Backend/src/operations/operations.controller.ts` | `Backend/test/phase1a.e2e-spec.ts`, `FrontEnd_1/tools/terminal-e2e-local.mjs` | TEST EXISTENTE |
| SUP-002 | Terminal Binding de nueva venta | `Backend/src/operations/`, `Backend/src/transactions/`, `FrontEnd_1/server/gateway.js` | `FrontEnd_1/tools/financial-e2e-local.mjs` | TEST EXISTENTE |
| SUP-003 | Suspensión/cierre e intervención | `Backend/src/operations/`, `Backend/src/incidents/` | `FrontEnd_1/tools/terminal-e2e-local.mjs`, `FrontEnd_1/tools/financial-e2e-local.mjs` | TEST EXISTENTE |
| SUP-004 | Rotación, revocación y recuperación | `Backend/src/operations/`, `FrontEnd_1/server/gateway.js` | `FrontEnd_1/tools/terminal-e2e-local.mjs`, `Backend/test/phase1a.e2e-spec.ts` | TEST EXISTENTE |
| SUP-005 | Administración y asignación separada | `Backend/src/operations/operations.controller.ts`, `Backend/prisma/schema.prisma` | `Backend/test/phase1a.e2e-spec.ts`, `Backend/test/control.e2e-spec.ts` | TEST EXISTENTE |
| PRIME-001 | Login/registro y sesión propia | `FrontEnd_2/js/services/authService.js`, `Backend/src/auth/` | `FrontEnd_2/tests/auth.test.js`, `FrontEnd_2/tests/register.test.js` | TEST EXISTENTE |
| PRIME-002 | Saldo, deuda, puntos reales | `FrontEnd_2/js/services/`, `Backend/src/wallet/`, `Backend/src/rewards/` | `FrontEnd_2/tests/services.test.js`, `FrontEnd_2/tests/payment-state.test.js` | TEST EXISTENTE |
| PRIME-003 | Prime y placa POSTPAGO | `Backend/src/vehicles/`, `Backend/src/transactions/` | `Backend/src/transactions/authorizations.service.spec.ts`, `FrontEnd_1/tests/prime-flow.test.js` | TEST EXISTENTE |
| PRIME-004 | Perfil, vehículos y canjes propios | `Backend/src/memberships/`, `Backend/src/vehicles/`, `Backend/src/rewards/` | `FrontEnd_2/tests/services.test.js`, `Backend/test/registration.e2e-spec.ts` | TEST EXISTENTE |
| PRIME-005 | Recuperación sin correo configurado | `Backend/src/auth/password-reset.service.ts`, `FrontEnd_2/js/recovery.js` | `Backend/src/control/email-disabled.spec.ts` | TEST EXISTENTE |
| CTRL-001 | Cuenta aprobada para login | `Backend/src/control/control.service.ts` | `Backend/test/control.e2e-spec.ts` | TEST EXISTENTE |
| CTRL-002 | Grants y station scope | `Backend/src/control/`, `FrontEnd_3/js/app.js` | `Backend/test/control.e2e-spec.ts`, `Backend/test/control-operations.e2e-spec.ts` | TEST EXISTENTE |
| CTRL-003 | Altas y cambios auditables | `Backend/src/control/control.service.ts`, `Backend/src/operations/` | `Backend/test/control.e2e-spec.ts`, `FrontEnd_1/tools/supervisor-ui-e2e-local.mjs` | TEST EXISTENTE |
| CTRL-004 | Consultas y comprobantes acotados | `Backend/src/control/control-customers.service.ts` | `Backend/test/control-customers.e2e-spec.ts` | TEST EXISTENTE |
| CTRL-005 | Permisos inventario/incidentes/auditoría | `Backend/src/control/control-operations.service.ts` | `Backend/test/control-operations.e2e-spec.ts`, `Backend/test/control.e2e-spec.ts` | TEST EXISTENTE |
| CTRL-006 | Correo ausente no crea solicitud | `Backend/src/control/control.service.ts` | `Backend/src/control/email-disabled.spec.ts` | TEST EXISTENTE |
| SALE-001 | Idempotencia financiera | `Backend/src/transactions/`, `Backend/src/payments/` | `Backend/src/transactions/critical-integrity.spec.ts`, `FrontEnd_1/tools/financial-e2e-local.mjs` | TEST EXISTENTE |
| SALE-002 | Pago PREPAGO antes de autorizar | `Backend/src/payments/`, `Backend/src/transactions/authorizations.service.ts` | `Backend/test/v11-closure.e2e-spec.ts`, `Backend/test/partial-refund.e2e-spec.ts` | TEST EXISTENTE |
| SALE-003 | Reserva POSTPAGO y deuda | `Backend/src/transactions/`, `Backend/src/wallet/` | `Backend/src/transactions/authorizations.service.spec.ts`, `Backend/test/v9.e2e-spec.ts` | TEST EXISTENTE |
| SALE-004 | Precio, avance y redondeo | `Backend/src/transactions/`, `FrontEnd_1/src/js/script.js` | `Backend/src/transactions/critical-integrity.spec.ts`, `Backend/test/inventory-foundations.e2e-spec.ts` | TEST EXISTENTE |
| INV-001 | Reserva y un DISPENSE físico | `Backend/src/inventory/`, `Backend/prisma/schema.prisma` | `Backend/test/inventory-foundations.e2e-spec.ts`, `FrontEnd_1/tools/financial-e2e-local.mjs` | TEST EXISTENTE |
| INV-002 | Reconciliación REVIEW/REQUIRED | `Backend/src/inventory/`, `Backend/src/control/` | `Backend/test/inventory-reconciliation.e2e-spec.ts`, `Backend/test/control-operations.e2e-spec.ts` | TEST EXISTENTE |
| SALE-005 | Interrupción y legacy sin bypass | `Backend/src/transactions/`, `FrontEnd_1/src/js/transactionsService.js` | `FrontEnd_1/tests/recovery.test.js`, `Backend/test/inventory-reconciliation.e2e-spec.ts` | TEST EXISTENTE |
| OCR-001 | Fallo OCR permite placa manual | `FrontEnd_1/src/js/plateCamera.js`, `Backend/src/vehicles/recognition.service.ts` | `tools/ocr-fallback-ui.cjs`, `Backend/src/vehicles/recognition.service.spec.ts`; cámara física pendiente | PARCIAL: TEST; FÍSICO PENDIENTE |
| OCR-002 | Resultado exige confirmación | `FrontEnd_1/src/js/plateCamera.js` | `tools/ocr-fallback-ui.cjs` | TEST EXISTENTE |
| OCR-003 | Placa corregida se valida | `FrontEnd_1/src/js/plateCamera.js`, `Backend/src/vehicles/plate.dto.ts` | `tools/ocr-fallback-ui.cjs`, `Backend/src/vehicles/recognition.service.spec.ts` | TEST EXISTENTE |
| OCR-004 | OCR autenticado, sin acceso browser directo | `compose.yaml`, `Backend/src/vehicles/recognition.service.ts`, `PlateRecognition/app.py` | `PlateRecognition/test_ocr.py`, `Backend/src/vehicles/recognition.service.spec.ts`; 401 sin credencial y 200 autorizado verificados en Render; Browser sin frontend remoto | TEST LOCAL Y REMOTO; BROWSER REMOTO PENDIENTE |
| SEC-001 | BFF HMAC y allowlist | `FrontEnd_1/server/gateway.js`, `server/policy.js` | `FrontEnd_1/tests/kiosk-gateway.test.js`, `function-boundaries.test.js` | TEST EXISTENTE |
| SEC-002 | Redis, Origin y CSRF | `Backend/src/kiosk/`, `FrontEnd_1/server/gateway.js` | `Backend/src/kiosk/kiosk.spec.ts`, `FrontEnd_1/tests/kiosk-gateway.test.js` | TEST EXISTENTE |
| SEC-003 | Credencial/operación vinculadas | `Backend/src/operations/`, `Backend/src/auth/access.guard.ts` | `Backend/test/phase1a.e2e-spec.ts`, `FrontEnd_1/tools/financial-e2e-local.mjs` | TEST EXISTENTE |
| SEC-004 | Cookies y Control same-origin | `FrontEnd_1/server/gateway.js`, `Backend/src/control/control.controller.ts`, `FrontEnd_3/api/` | `Backend/src/control/control-cookie.spec.ts`, `FrontEnd_3/tests/control-proxy.test.js` | TEST EXISTENTE |
| SEC-005 | Roles, grants y revocación | `Backend/src/control/`, `Backend/src/operations/` | `Backend/test/control.e2e-spec.ts`, `Backend/test/phase1a.e2e-spec.ts` | TEST EXISTENTE |
| SEC-006 | Secretos sólo servidor/CORS exacto | `Backend/src/setup-app.ts`, `FrontEnd_1/server/gateway.js` | `FrontEnd_2/tests/secrets.test.js`, `FrontEnd_1/tests/build-secrets.test.js` | TEST EXISTENTE |
| SEC-007 | Rate limit y auditoría | `Backend/src/kiosk/`, `Backend/src/operations/`, `Backend/src/control/` | `Backend/src/kiosk/redis-store.spec.ts`, `Backend/test/control-operations.e2e-spec.ts` | TEST EXISTENTE |
| DEP-001 | DB/Redis aislados y migración aprobada | `compose.yaml`, `Backend/prisma/`, `Backend/scripts/database-safety.cjs` | `Backend/scripts/database-safety.test.cjs`; remoto pendiente | PARCIAL: TEST LOCAL |
| DEP-002 | HTTPS, BFF y proxies de staging | `FrontEnd_1/vercel.json`, `FrontEnd_3/vercel.json`, `Backend/src/setup-app.ts` | `FrontEnd_1/tests/function-boundaries.test.js`, `FrontEnd_3/tests/control-proxy.test.js`; host real pendiente | PARCIAL: TEST LOCAL |
| DEP-003 | OCR protegido opcional en runtime | `compose.yaml`, `Backend/src/vehicles/recognition.service.ts`, `PlateRecognition/app.py` | `PlateRecognition/test_ocr.py`, `Backend/src/vehicles/recognition.service.spec.ts`; Backend → OCR y fallback manual local validados; frontend remoto pendiente | PARCIAL: TEST LOCAL Y REMOTO |
| DEP-004 | PrintAgent sólo local y fallback | `PrintAgent/`, `FrontEnd_1/src/js/printReceipt.js`, `FrontEnd_3/js/print-agent.js` | `PrintAgent/tests/`, `FrontEnd_3/tests/print-agent.test.js`; impresora física pendiente | PARCIAL: TEST; FÍSICO PENDIENTE |
| DEP-005 | Sin Mailpit; SMTP futuro | `compose.yaml`, `Backend/src/auth/recovery-delivery.ts` | `Backend/src/auth/smtp-delivery.spec.ts`, `Backend/src/control/email-disabled.spec.ts` | TEST EXISTENTE |

## Vínculo con IDs académicos existentes

Los IDs oficiales están en `REQUIREMENTS-COMPLIANCE.md` (RF-01…22, RN-01…16, RNF-01…14; referencia a CU-01…15). Los IDs SDD anteriores **no los reemplazan**: FF/SUP/SALE/INV desarrollan RF-01–15 y RN-01–10/16; PRIME desarrolla RF-16 y RN-12; OCR desarrolla RF-17 y RN-13; CTRL desarrolla RF-18/20–22 y RN-11/14; SEC/DEP desarrollan RNF-03–07/09/12–14. La correspondencia detallada figura al final de cada spec. El dictamen histórico de cumplimiento puede no reflejar cambios posteriores de V12.1; véase [SDD-GAPS.md](SDD-GAPS.md).
