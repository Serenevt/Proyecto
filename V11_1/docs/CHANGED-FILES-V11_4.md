# Archivos V11_4 frente al árbol de V11_3

Base: contenido de trabajo copiado antes de editar, no un commit. No existía .git en la copia. No se modificaron fuentes funcionales de Backend, Prime ni OCR. FrontEnd_2 solo cambia identificación de build/cabecera de versión. No hay cambios de esquema ni migraciones.

| Estado | Archivo |
|---|---|
| Modificado | `.gitignore` |
| Modificado | `Backend/test/v11_2-demo.e2e-spec.ts` |
| Modificado | `compose.database-local.yaml` |
| Modificado | `compose.lan.yaml` |
| Modificado | `compose.yaml` |
| Modificado | `FrontEnd_1/nginx/default.conf` |
| Modificado | `FrontEnd_1/src/js/printReceipt.js` |
| Modificado | `FrontEnd_1/src/js/script.js` |
| Modificado | `FrontEnd_1/src/js/thermalReceipt.js` |
| Modificado | `FrontEnd_1/src/js/transactionsService.js` |
| Nuevo | `FrontEnd_1/tests/finalization.test.js` |
| Modificado | `FrontEnd_1/tests/thermalReceipt.test.js` |
| Modificado | `FrontEnd_1/tools/build.cjs` |
| Modificado | `FrontEnd_2/nginx/default.conf` |
| Modificado | `FrontEnd_2/tools/build.cjs` |
| Modificado | `PrintAgent/config.example.json` |
| Nuevo | `PrintAgent/config.mjs` |
| Modificado | `PrintAgent/configure.mjs` |
| Nuevo | `PrintAgent/contract.mjs` |
| Modificado | `PrintAgent/print.ps1` |
| Modificado | `PrintAgent/probe.ps1` |
| Modificado | `PrintAgent/routes.mjs` |
| Modificado | `PrintAgent/server.mjs` |
| Modificado | `PrintAgent/store.mjs` |
| Nuevo | `PrintAgent/tests/contract.test.mjs` |
| Modificado | `PrintAgent/tests/jobs.test.mjs` |
| Nuevo | `PrintAgent/ThermalLayout.cs` |
| Modificado | `README.md` |
| Nuevo | `tools/playwright.v11_4.cjs` |
| Modificado | `tools/print-agent.spec.cjs` |
| Modificado | `tools/print-test-setup.cjs` |
| Nuevo | `tools/test-layout-v11_4.cjs` |
| Nuevo | `tools/v11_4-regression.spec.cjs` |
| Nuevo | `tools/v11_4-ticket.spec.cjs` |
| Nuevo | `tools/verify-previous-v11_4.cjs` |
| Nuevo | `tools/verify-restart-v11_4.cjs` |
| Nuevo | `tools/verify-served-v11_4.cjs` |

Documentación/evidencias nuevas: README.md (actualizado), PRINTING-A6-V11_4.md, VALIDATION-V11_4.md, este inventario, baseline-previous-v11_4.json, docker-runtime-v11_4.json, served-builds-v11_4.json, restart-v11_4.json, layout-results-v11_4.json, browser-v11_4-results.json, printers-v11_4.json, probe-v11_4.log, logs unitarios/backend y capturas/fixtures en evidence-v11_4. Salidas dist/www recompiladas y dependencias instaladas solo en V11_4. Los informes heredados de V11_3 son historia y se conservan.
