# Verificación ejecutada

Fecha local: 8 de octubre de 2026 (America/Lima).

| Comprobación                                   | Resultado observado                                            |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `npm run prisma:generate`                      | Cliente Prisma 6.19.3 generado                                 |
| Migración inicial                              | `20261008235020_init` aplicada                                 |
| Restricciones SQL                              | `20261008235100_constraints` aplicada                          |
| `npm run prisma:seed`                          | Diego, membresía, vehículos y catálogos creados                |
| Seed repetido en e2e y Compose                 | Sin duplicar ni restablecer datos                              |
| `npm test`                                     | 30 pruebas aprobadas / 5 suites                                |
| `npm run test:e2e`                             | 25 pruebas aprobadas / PostgreSQL real                         |
| `npm run lint`                                 | Sin errores                                                    |
| `npm run format:check`                         | Sin diferencias de formato                                     |
| `npm run build`                                | Código de salida 0                                             |
| `npm audit --omit=dev`                         | 0 vulnerabilidades reportadas                                  |
| Inicializador mediante `docker run`            | Ejecutado; archivos existentes preservados                     |
| `docker compose up -d --build`                 | Backend y PostgreSQL saludables; migración y seed con salida 0 |
| `docker compose --profile test run --rm tests` | 30 unitarias + 25 e2e, lint y build aprobados dentro de Docker |
| Health desde el host                           | HTTP 200; `status=ok`, `database=up`                           |
| Swagger desde el host                          | HTTP 200                                                       |
| Frontend y versiones anteriores                | Sin diferencias en Git                                         |
| Secretos generados                             | No aparecen en archivos nuevos candidatos a versionar          |

Las 55 pruebas son casos distintos; no se suman otra vez por ejecutarse tanto en Windows como en Docker. Las e2e utilizan un esquema temporal y lo eliminan al terminar. La prueba de rollback provoca intencionalmente un error de constraint que se registra en consola; la suite completa termina correctamente.

Compra persistente verificada con `docker compose exec -T backend npm run demo`:

```json
{
  "login": "Diego",
  "membership": "PRIME-0001",
  "plate": "ABC-123",
  "transactionId": "ae84dd0d-0827-49cf-8393-a06a56f590be",
  "operationId": "4efc445b-31ee-4f7f-9c8c-45a53df9408b",
  "amount": "100.00",
  "pointsEarned": 100,
  "historyContainsPurchase": true,
  "swagger": 200
}
```

La compra permanece en el volumen local, separada de las pruebas temporales. Los UUIDs corresponden a esta ejecución; una instalación nueva genera identificadores distintos.

No se hicieron commits ni push. No se integraron ni modificaron los frontend. Los límites funcionales (pagos demo y funciones reservadas para fases siguientes) están explicados en [README.md](README.md).
