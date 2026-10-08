# Preparación posterior para Android

Capacitor no está instalado ni inicializado. Primero aceptar la interfaz mediante `TEST_MATRIX.md`. El build estático preparado copia HTML, CSS, scripts e imágenes a `www/`; no incluye documentación, pruebas ni dependencias.

## Pasos posteriores

1. Elegir versiones compatibles de Capacitor CLI/core/Android y fijarlas en package-lock. Verificar requisitos de Node, JDK, SDK y Android Studio en la documentación oficial al comenzar esa fase.
2. Inicializar dentro de V5-Mobile: nombre provisional **Primax FuelFlow**, app id de prueba **com.primax.fuelflow.demo**, webDir **www**. Confirmar identidad definitiva antes de una distribución pública.
3. Crear el proyecto Android, ejecutar el build de recursos y sincronizarlo. No configurar una URL remota como sustituto de los recursos empaquetados.
4. Preparar icono adaptativo y splash desde la marca original. Configurar portrait y tema de barras del sistema.
5. Conectar el botón Atrás nativo a `FuelFlow.back()`: cerrar diálogos cancelables, retroceder en configuración y bloquear cambios durante procesamiento/despacho. La aceptación de autorización seguirá siendo explícita.
6. Validar edge-to-edge, safe areas, botones y teclado real: los insets CSS dependen de la configuración de WebView y no sustituyen esa comprobación.
7. Comprobar voz mediante SpeechSynthesis en WebView. Si falla, introducir un adaptador nativo; el texto seguirá permitiendo completar la compra.
8. Comprobar descarga `.txt`. Si WebView no la gestiona, cambiar solo el adaptador de exportación a Filesystem/Share nativos, sin cambiar pantallas ni contenido del recibo.
9. Validar cambio de aplicación, bloqueo de pantalla y retorno: el despacho se pausa sin acumular litros fuera de primer plano. No restaurar un cobro real sin consultar su estado al servidor cuando exista.
10. Compilar APK de depuración, instalar en emulador y dispositivo físico, ejecutar matriz funcional y registrar resultados.

No solicitar cámara, NFC ni permisos de pagos para simulaciones. Esta demo no reconoce matrículas ni procesa tarjetas reales. La APK de prueba no es un artefacto de producción firmado.
