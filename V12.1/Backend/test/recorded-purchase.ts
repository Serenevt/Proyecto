import { INestApplication } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import request, { Response } from 'supertest';

/** Existing purchase fixtures now perform the required authorization/progress protocol.
 * Manipulation tests must POST directly, without this fixture helper.
 */
export function recordedPurchase(
  app: INestApplication,
  key: string,
  db: PrismaClient,
  body: Record<string, unknown>,
) {
  let pending: Promise<Response> | undefined;
  const run = () =>
    (pending ??= (async () => {
      const payload = { ...body };
      if (
        body.mode === 'PREPAGO' &&
        !body.authorizationId &&
        typeof body.operationId === 'string'
      ) {
        const result = await request(app.getHttpServer())
          .post('/api/v1/authorizations')
          .set('x-kiosk-key', key)
          .send({
            operationId: body.operationId,
            plate: body.plate,
            amount: body.amount,
            fuelId: body.fuelId,
            stationId: body.stationId,
            mode: 'PREPAGO',
            paymentMethod: body.paymentMethod,
          });
        if (result.status !== 201) return result;
        if (result.status === 201)
          payload.authorizationId = result.body.authorization.id;
      }
      if (
        typeof payload.authorizationId === 'string' &&
        typeof payload.amount === 'string' &&
        /^\d+(\.\d+)?$/.test(payload.amount)
      ) {
        const auth = await db.fuelAuthorization.findUnique({
          where: { id: payload.authorizationId },
        });
        if (auth?.unitPrice) {
          const gallons = new Prisma.Decimal(payload.amount)
            .div(auth.unitPrice)
            .toFixed(3);
          if (payload.gallons === undefined) payload.gallons = gallons;
          if (
            ['RESERVED', 'DISPENSING'].includes(auth.status) &&
            auth.dispensedAmount.isZero()
          ) {
            await request(app.getHttpServer())
              .post(`/api/v1/authorizations/${auth.id}/progress`)
              .set('x-kiosk-key', key)
              .send({ amount: payload.amount, gallons });
          }
        }
      }
      return request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('x-kiosk-key', key)
        .send(payload);
    })());
  return {
    then: (
      resolve: (value: Response) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => run().then(resolve, reject),
    expect: async (status: number) => {
      const result = await run();
      if (result.status !== status)
        throw Error(
          `Expected HTTP ${status}, received ${result.status}: ${JSON.stringify(result.body)}`,
        );
      return result;
    },
  };
}
