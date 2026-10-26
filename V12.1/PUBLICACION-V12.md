# Publicación V12

V12 contiene una copia de los archivos publicables de V11_1.1, preparada el 25 de octubre de 2026 desde la carpeta de trabajo local. No se fusionó código de otras versiones. Los 483 archivos copiados conservan exactamente los bytes del origen; este documento es el único archivo nuevo.

Se excluyeron dependencias, compilaciones, cachés, logs, resultados locales de ejecución, configuraciones privadas, archivos .env (salvo ejemplos), certificados y claves, bases/dumps e historiales de impresión. Se conservan fuentes, pruebas, lockfiles, recursos, fixtures y documentación técnica. Las instrucciones e informes anteriores se conservan como documentación histórica; sus nombres y resultados no representan pruebas nuevas de V12.

V12 es el nombre de la carpeta publicada. Los identificadores internos, puertos y volumen Compose de V11_1.1 se conservan; esta publicación no crea un entorno de ejecución aislado adicional. Para usar las instrucciones del README, sustituir su ruta local por la carpeta V12 del clon. Las configuraciones privadas y el historial de impresión deben prepararse en cada equipo siguiendo el configurador documentado.

La verificación de publicación comprueba la integridad de la copia, secretos y que el commit solo agregue rutas dentro de V12/. No inicia servicios, no ejecuta impresiones y no certifica de nuevo las pruebas funcionales históricas.
