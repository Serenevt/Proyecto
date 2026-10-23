# V11 ? implementation and validation workspace

Created exclusively from local V10_2. No commit, push or merge.

Structure: FrontEnd_1 (FuelFlow kiosk), FrontEnd_2 (Primax Prime + Capacitor Android), Backend (NestJS + Prisma), PostgreSQL (operational documentation/queries/ERD), PlateRecognition (OCR container), compose.yaml and docs.

Start local services: `docker compose up -d`. FuelFlow: http://127.0.0.1:21081. Prime: http://127.0.0.1:21082.

Authoritative V11 deployment status and limitations: [docs/DEPLOYMENT-V11.md](docs/DEPLOYMENT-V11.md).
Validation report: [docs/VALIDATION-V11.md](docs/VALIDATION-V11.md).
Other V8/V9/V10 reports retained in this tree are inherited historical evidence; they do not certify V11.

V11 is NOT production-ready: prepaid welcome discount, complete provider lifecycle recovery, commercial sandbox/live validation and actual public Android validation remain pending.
