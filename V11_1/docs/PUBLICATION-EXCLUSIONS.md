# Exclusiones de publicación

Se conserva la documentación técnica Markdown, fuentes, pruebas, lockfiles, recursos y fixtures de OCR de V11_4. No se copia desde un commit.

Se omiten dependencias, builds y cachés regenerables; logs; sesiones/fixtures JSON de ejecuciones locales; inventarios de equipos y metadatos locales; configuraciones y claves privadas; datos/historial de impresión y bases. No son requisitos del runtime. El documento académico PDF heredado contiene datos personales y queda fuera conforme a la restricción de publicación; no se alteró en la fuente.

| Ruta omitida o categoría | Motivo |
|---|---|
| Backend/dist | dependencias, builds o cachés locales |
| docs/backend-checks-v11_3.log | configuración, secretos, logs o artefactos locales |
| docs/backend-checks-v11_4.log | configuración, secretos, logs o artefactos locales |
| docs/baseline-previous-v11_4.json | metadatos locales de ejecuciones históricas |
| docs/browser-v11_2-results.json | metadatos locales de ejecuciones históricas |
| docs/browser-v11_3-results.json | metadatos locales de ejecuciones históricas |
| docs/browser-v11_4-results.json | metadatos locales de ejecuciones históricas |
| docs/clean-source-manifest.json | metadatos locales de ejecuciones históricas |
| docs/docker-runtime-v11_3.json | metadatos locales de ejecuciones históricas |
| docs/docker-runtime-v11_4.json | metadatos locales de ejecuciones históricas |
| docs/evidence-v11_3/restart-before.json | fixtures y registros locales generados; pueden contener sesiones de prueba |
| docs/evidence-v11_3/restart-fixture.json | fixtures y registros locales generados; pueden contener sesiones de prueba |
| docs/evidence-v11_3/restart-ticket.json | fixtures y registros locales generados; pueden contener sesiones de prueba |
| docs/evidence-v11_4/layout-cases.json | fixtures y registros locales generados; pueden contener sesiones de prueba |
| docs/evidence-v11_4/restart-before.json | fixtures y registros locales generados; pueden contener sesiones de prueba |
| docs/evidence-v11_4/restart-fixture.json | fixtures y registros locales generados; pueden contener sesiones de prueba |
| docs/evidence-v11_4/restart-ticket.json | fixtures y registros locales generados; pueden contener sesiones de prueba |
| docs/previous-versions-v11_3.json | metadatos locales de ejecuciones históricas |
| docs/printers-v11_3.json | metadatos locales de ejecuciones históricas |
| docs/printers-v11_4.json | metadatos locales de ejecuciones históricas |
| docs/probe-v11_4.log | configuración, secretos, logs o artefactos locales |
| docs/Proyecto Software (1).pdf | documento académico con datos personales, ajeno al runtime |
| docs/rebuild-frontends-v11_3.log | configuración, secretos, logs o artefactos locales |
| docs/restart-v11_3.json | metadatos locales de ejecuciones históricas |
| docs/restart-v11_4.json | metadatos locales de ejecuciones históricas |
| docs/served-builds-v11_3.json | metadatos locales de ejecuciones históricas |
| docs/served-builds-v11_4.json | metadatos locales de ejecuciones históricas |
| docs/source-integrity.json | metadatos locales de ejecuciones históricas |
| docs/source-verification-v11.json | metadatos locales de ejecuciones históricas |
| docs/unit-agent-v11_3.log | configuración, secretos, logs o artefactos locales |
| docs/unit-agent-v11_4.log | configuración, secretos, logs o artefactos locales |
| docs/unit-fuelflow-v11_2.log | configuración, secretos, logs o artefactos locales |
| docs/unit-fuelflow-v11_3.log | configuración, secretos, logs o artefactos locales |
| docs/unit-fuelflow-v11_4.log | configuración, secretos, logs o artefactos locales |
| docs/unit-prime-v11_2.log | configuración, secretos, logs o artefactos locales |
| docs/unit-prime-v11_3.log | configuración, secretos, logs o artefactos locales |
| docs/unit-prime-v11_4.log | configuración, secretos, logs o artefactos locales |
| docs/windows-v11_4.json | metadatos locales de ejecuciones históricas |
| FrontEnd_1/dist | dependencias, builds o cachés locales |
| FrontEnd_2/node_modules | dependencias, builds o cachés locales |
| FrontEnd_2/www | dependencias, builds o cachés locales |
| tools/test-results | dependencias, builds o cachés locales |

Los informes históricos .md y capturas DEMO se conservan como evidencia histórica; los enlaces a logs/fixtures omitidos no son evidencia nueva ni requisitos de arranque. Las verificaciones históricas de árboles V11/V11_3 requieren esos checkouts originales y no forman parte del arranque portable. El informe PUBLICATION-VALIDATION.md certifica solo las pruebas nuevas de esta publicación.
