import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePlate } from '../vehicles/plate.dto';

@Injectable()
export class AlertsService {
  constructor(private readonly db: PrismaService) {}

  async checkPlate(plateInput: string, code: string, operationId: string) {
    const plate = normalizePlate(plateInput) as string;
    const membership = await this.db.membership.findUnique({
      where: { number: code.trim().toUpperCase() },
      include: { vehicles: true, user: { select: { name: true } } },
    });
    // A typo in an unknown membership is not evidence of a plate mismatch.
    if (!membership || membership.vehicles.some((v) => v.plate === plate))
      return { mismatch: false };
    const expectedPlates = membership.vehicles.map((v) => v.plate).sort();
    await this.db.businessAlert.upsert({
      where: { eventKey: `plate:${operationId}:${membership.id}:${plate}` },
      update: {},
      create: {
        eventKey: `plate:${operationId}:${membership.id}:${plate}`,
        type: 'PLATE_MISMATCH',
        plate,
        expectedPlates,
        operationId,
        membershipId: membership.id,
        userName: membership.user.name,
        description:
          'La placa ingresada no pertenece a la Membership indicada en postpago.',
      },
    });
    return { mismatch: true };
  }

  async list() {
    // Reconcile existing debts too. The unique debt event preserves reviewed history.
    const debts = await this.db.membershipDebt.findMany({
      where: {
        amountPending: { gt: 0 },
        transaction: { vehicleId: { not: null } },
      },
      include: {
        membership: { include: { user: { select: { name: true } } } },
        transaction: true,
      },
    });
    for (const debt of debts) {
      await this.db.businessAlert.upsert({
        where: { eventKey: `debt:${debt.id}` },
        update: { amountPending: debt.amountPending },
        create: {
          eventKey: `debt:${debt.id}`,
          type: 'PENDING_BALANCE',
          description: 'Saldo pendiente',
          plate: debt.transaction.plate,
          expectedPlates: [],
          membershipId: debt.membershipId,
          userName: debt.membership.user.name,
          amountPending: debt.amountPending,
          transactionId: debt.transactionId,
          debtId: debt.id,
          operationId: debt.transaction.operationId,
          occurredAt: debt.createdAt,
        },
      });
    }
    await this.db.businessAlert.updateMany({
      where: {
        type: 'PENDING_BALANCE',
        debt: { amountPending: { equals: 0 } },
      },
      data: { amountPending: 0 },
    });
    return this.db.businessAlert.findMany({
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
  }

  async checkAuthorization(
    plateInput: string,
    authorizationId: string,
    operationId: string,
  ) {
    const plate = normalizePlate(plateInput) as string;
    const auth = await this.db.fuelAuthorization.findUnique({
      where: { id: authorizationId },
      include: {
        membership: { include: { user: { select: { name: true } } } },
      },
    });
    if (
      !auth ||
      auth.mode !== 'POSTPAGO' ||
      !auth.membership ||
      auth.plate === plate
    )
      return;
    await this.db.businessAlert.upsert({
      where: { eventKey: `authorization:${operationId}:${auth.id}:${plate}` },
      update: {},
      create: {
        eventKey: `authorization:${operationId}:${auth.id}:${plate}`,
        type: 'PLATE_MISMATCH',
        plate,
        expectedPlates: [auth.plate],
        operationId,
        membershipId: auth.membership.id,
        userName: auth.membership.user.name,
        description: `La placa del cierre postpago contradice la autorización ${auth.id}.`,
      },
    });
  }

  async resolve(id: string, actor: string) {
    await this.db.businessAlert.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedBy: actor },
    });
    return this.db.businessAlert.findUniqueOrThrow({ where: { id } });
  }

  async dashboard() {
    const [summary, transactions] = await Promise.all([
      this.db.transaction.aggregate({
        _sum: { amount: true, gallons: true },
        _count: true,
      }),
      this.db.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          plate: true,
          amount: true,
          status: true,
          createdAt: true,
          fuel: { select: { name: true } },
        },
      }),
    ]);
    return { summary, transactions };
  }
}
