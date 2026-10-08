# Primax FuelFlow V5 Mobile

Implementación mobile-first de la copia V4. Solo se modifican archivos dentro de V5-Mobile; V1, V2 y V4 son referencias inmutables. Los hashes de los ocho archivos de V4 se encuentran en `V4_BASELINE.json`.

## Ejecutar

Abrir `index.html` directamente funciona sin compilación. Para desarrollo y pruebas:

```powershell
cd V5-Mobile
npm.cmd install
npm.cmd run dev
npm.cmd test
npm.cmd run test:mobile
npm.cmd run build
```

El servidor se limita a `127.0.0.1:5173`. Las pruebas de navegador usan Google Chrome instalado. `build` copia recursos estáticos a `www/`, que se ignora en Git; no inicializa Capacitor ni crea un proyecto Android.

## Pantallas y arquitectura

- Prepago: inicio → combustible → modalidad/monto → boleta o factura → datos/placa/membresía → método → pago simulado → autorización → abastecimiento → resumen.
- Postpago: inicio → combustible → modalidad → identificación/membresía → autorización simulada → abastecimiento → resumen pendiente → pagar ahora → resumen pagado.
- Cinco pasos de configuración para prepago, tres para postpago. Procesamiento, despacho y resumen son estados independientes.
- Administración devuelve a la pantalla de origen; su acceso se bloquea durante pagos y despacho. Asistencia e idioma no reinician la operación.
- Los controles conservan sus identificadores V4. Las acciones de cada pantalla y el dock de asistencia ocupan zonas inferiores distintas; el contenido reserva espacio para ambas.
- CSS base móvil, ampliaciones desde 768 px, áreas táctiles de 48 px, safe areas, altura dinámica, modales desplazables y movimiento reducido.
- Scripts clásicos encapsulados bajo `FuelFlow`, cargados con `defer`, sin framework ni dependencias de ejecución.
- `core`: configuración, estado, navegación, almacenamiento. `domain`: validadores y totales. `services`: operaciones locales intercambiables por HTTP. `ui`: pantallas, administración, voz, mascota, diálogos y asistencia. `i18n`: textos originales y ampliaciones.

## Compatibilidad conservada

Regular S/ 16.50/L, Premium S/ 18.20/L, Diésel S/ 14.80/L; prepago S/ 10–500; DNI 8 dígitos, RUC 11; placa normalizada de 6 caracteres alfanuméricos; descuento de membresía del 5 % con código no vacío. QR decorativo, NFC, efectivo y asistencia son simulados. Se mantienen denominaciones V4, devolución del último importe y cambio. Despacho de 0.5 L por 300 ms, parada automática de prepago y manual, avisos cada 10 L. Exportación de comprobante `.txt`, dashboard e historial local, español, inglés y quechua, voz y cuatro imágenes originales.

## Correcciones de integridad

Transacciones identificadas y guardadas una sola vez, pagos actualizados por identificador, estado de pago independiente del DOM y del idioma, claves V5 separadas de V4, copia inicial del historial antiguo sin escribir sobre él, temporizadores cancelables y bloqueo de acciones duplicadas. El abastecimiento se pausa cuando la página se oculta y no acumula combustible por tiempo ausente. Los diálogos controlan foco, fondo inerte y Escape; las autorizaciones exigen aceptación explícita.

## Límites deliberados

V4 ofrece selección de monto, no selector independiente de litros. Su prepago cobra el monto bruto y aplica descuento al resumen; el subtotal se recalcula con litros redondeados a dos decimales. Se conserva esa política, incluida su diferencia de redondeo respecto al objetivo. No hay reembolso, conciliación ni liquidación comercial real. El postpago conserva la identificación sin DNI/RUC y cobro final genérico, sin extenderle los cuatro métodos de prepago.

Login `admin` / `primax123` es una demostración local. Las cifras base del dashboard son de ejemplo; las nuevas operaciones se suman por separado. Sin almacenamiento disponible, la sesión sigue en memoria y muestra un aviso. Una recarga pierde esa memoria.

No se implementan backend, PostgreSQL, pagos/ANPR/facturación/surtidores reales, Docker ni Capacitor. No se realizan commits, push ni cambio de rama. Android físico, voz de WebView y exportación nativa requieren la validación posterior descrita en `ANDROID.md`.
