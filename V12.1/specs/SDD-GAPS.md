# Discrepancias y cobertura pendiente detectadas al consolidar SDD

Este registro no cambia comportamiento ni declara automáticamente incorrecto al código. Las specs `00`–`08` describen V12.1 actual; cualquier cambio futuro requiere decisión y validación separadas.

| ID | Clase | Evidencia y diferencia | Tratamiento |
|---|---|---|---|
| GAP-001 | Orden de flujo / naming | La secuencia solicitada para la spec coloca placa antes de combustible. `FrontEnd_1/src/js/script.js` inicia mostrando `pantalla-combustible`; la placa se ingresa después, dentro de la modalidad. | `01-fuelflow.md` documenta el orden real. Decidir si la secuencia deseada es sólo conceptual o un cambio futuro de UX; no se reordenó la UI. |
| GAP-002 | Documentación desactualizada | `docs/PHASE-1A-OPERATIONS.md` dice que el flujo legacy de ventas continúa con su sesión de operador. `README.md` y `FrontEnd_1/tools/financial-e2e-local.mjs` acreditan el Terminal Binding posterior: nuevas autorizaciones, órdenes y transacciones con `KIOSK_API_KEY` directa se rechazan. | Usar la regla actual de binding para V12.1; conservar el documento como antecedente de Fase 1A. |
| GAP-003 | Dictamen académico histórico | `REQUIREMENTS-COMPLIANCE.md` contiene conclusiones de etapas anteriores sobre surtidor, incidentes y administración que preceden a las migraciones y módulos operacionales/Control actuales. Sus IDs oficiales siguen siendo válidos, pero no todos sus estados son dictamen vigente de V12.1. | `09-traceability.md` relaciona IDs sin alterar prioridades ni reescribir el informe histórico. Una revisión académica posterior deberá reevaluar cumplimiento formal. |
| GAP-004 | Documentación de comandos | `README.md` enumera `npm run test:gateway` y `npm run prisma:validate` para Backend; `Backend/package.json` no define esos scripts. | Ejecutar los scripts existentes (`test`, `build`, `test:e2e`, `test:safety` cuando aplique). Corregir el README en una revisión documental separada si se decide ampliar el alcance de esta fase. |
| GAP-005 | Test/validación física y remota | Hay tests de OCR con fixture, UI de confirmación/fallback y contratos PrintAgent; no hay en este repositorio prueba de cámara/placa física, impresora real en esta VM ni de la frontera privada de OCR/HTTPS en staging. | En la matriz se marca cobertura parcial o sin cobertura en staging. No afirmar validación de hardware ni despliegue remoto. |

No se encontró una razón para modificar schema, migraciones, lógica de negocio o seguridad durante esta fase documental.
