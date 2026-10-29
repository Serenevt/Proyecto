# PlateRecognition — OCR de placa

## Propósito, alcance y actores

PlateRecognition es parte importante del MVP: propone una placa para acelerar al **Cliente** en FuelFlow. No identifica legalmente a una persona, no autentica membresía ni autoriza pago. La aceptación final corresponde al usuario y a las reglas Backend de placa/vehículo/membresía.

## Precondiciones y flujo principal

Con cámara disponible y permiso del navegador, FuelFlow captura imagen, la reduce y envía base64 por su API de mismo origen. La ruta es **Browser → FuelFlow/BFF → Backend → PlateRecognition**. Backend llama al servicio Python separado por `POST /recognize` JSON, valida forma de placa y umbral de confianza y devuelve una sugerencia. FuelFlow muestra el resultado en campo editable; el cliente confirma o corrige antes de incorporarlo a la venta. El reconocimiento de membresía, cuando se usa, sigue siendo una sugerencia que Backend verifica por separado.

## Flujos alternativos y reglas

- **OCR-001:** cámara ausente, permiso denegado, petición fallida, timeout, servicio caído, imagen inválida, ausencia de placa, baja confianza o lectura incorrecta permiten ingreso manual inmediato. Ninguna de estas condiciones bloquea FuelFlow.
- **OCR-002:** una lectura automática nunca completa por sí sola la identificación; requiere revisión/corrección y confirmación del cliente. Una lectura de baja confianza no se acepta como reconocida.
- **OCR-003:** la placa manual o corregida sigue la misma validación de formato y consulta/backend que la ingresada por OCR; OCR no concede membresía ni autorización financiera.
- **OCR-004:** el navegador no llama directamente a OCR. En Compose OCR sólo está en red interna; en staging académico gratuito puede ser un Web Service HTTPS que rechaza `POST /recognize` sin un secreto dedicado enviado únicamente por Backend. La red privada sigue siendo preferida para producción. El health público sólo indica `ok`.

## Datos, seguridad y límites

Backend usa `PLATE_RECOGNITION_URL`, `PLATE_RECOGNITION_ENABLED`, `PLATE_CONFIDENCE_THRESHOLD`, `OCR_SERVICE_SECRET` y timeout de 12 s. El servicio Flask/Gunicorn/Tesseract autentica `POST /recognize` con credencial de servicio; en staging Free tiene URL HTTPS pública pero no acceso anónimo al reconocimiento. La imagen se procesa temporalmente; la venta persiste la placa confirmada, no la fotografía. Las pruebas con fixture sintético no sustituyen validación física de cámara, iluminación y placas reales.

## Criterios de aceptación y evidencia actual

- Una imagen legible sugiere `ABC-123`; antes de pulsar **Confirmar resultado** no se propaga como placa final.
- Con OCR 503 o cámara no disponible se puede cerrar el cuadro, escribir placa válida y continuar una operación autorizada.
- Un resultado de confianza insuficiente no rellena automáticamente la venta; el usuario puede reintentar o escribir.

Evidencia: `FrontEnd_1/src/js/plateCamera.js`, `Backend/src/vehicles/recognition.controller.ts`, `Backend/src/vehicles/recognition.service.ts`, `PlateRecognition/app.py`, `tools/ocr-fallback-ui.cjs`, `Backend/src/vehicles/recognition.service.spec.ts`, `PlateRecognition/test_ocr.py`, `PlateRecognition/test_v11.py` y validación HTTP local documentada en `README.md`. Relación académica: RF-17 y RN-13.
