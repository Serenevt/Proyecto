import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurchaseMode } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Actor } from '../auth/access';
import { PaymentsService } from '../payments/payments.service';
import { PointsPolicyService } from '../rewards/points-policy.service';
import { normalizePlate } from '../vehicles/plate.dto';
import { CreateTransactionDto } from './create-transaction.dto';
import { transactionResponse } from './transaction.model';
import { TransactionsRepository } from './transactions.repository';
@Injectable()
export class TransactionsService {
  constructor(
    private readonly repo: TransactionsRepository,
    private readonly policy: PointsPolicyService,
    private readonly payments: PaymentsService,
  ) {}
  async create(dto: CreateTransactionDto) {
    const amount = this.policy.amount(dto.amount);
    const plate = normalizePlate(dto.plate) as string;
    const gallons = dto.gallons ? new Prisma.Decimal(dto.gallons) : null;
    if (gallons?.lte(0))
      throw new BadRequestException('Los galones deben ser positivos');
    const payment = this.payments.captured(amount, dto.paymentMethod, dto.mode);
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          plate,
          amount: amount.toFixed(2),
          stationId: dto.stationId,
          fuelId: dto.fuelId,
          mode: dto.mode,
          method: dto.paymentMethod,
          receiptType: dto.receiptType ?? 'BOLETA',
          gallons: gallons?.toFixed(3) ?? null,
        }),
      )
      .digest('hex');
    return this.repo.atomic(async (tx) => {
      const existing = await this.repo.byOperation(dto.operationId, tx);
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException('operationId ya usado con otros datos');
        return {
          transaction: transactionResponse(existing),
          pointsEarned: existing.pointsEarned,
          replayed: true,
        };
      }
      const vehicle = await this.repo.vehicle(plate, tx);
      if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
      const membership = vehicle.membership;
      const eligible =
        membership?.status === 'ACTIVE' && membership.user.active;
      if (dto.mode === PurchaseMode.POSTPAGO && !eligible)
        throw new BadRequestException('POSTPAGO requiere membresía activa');
      const fuel = await this.repo.fuel(dto.fuelId, tx);
      const station = await this.repo.station(dto.stationId, tx);
      if (!fuel?.active)
        throw new NotFoundException('Combustible no disponible');
      if (!station?.active)
        throw new NotFoundException('Estación no disponible');
      const points = eligible ? this.policy.calculate(amount) : 0;
      const transaction = await this.repo.create(
        {
          operationId: dto.operationId,
          requestHash,
          vehicleId: vehicle.id,
          membershipId: membership?.id,
          stationId: station.id,
          fuelId: fuel.id,
          amount,
          unitPrice: fuel.pricePerGallon,
          gallons,
          pointsRate: this.policy.rate,
          pointsEarned: points,
          mode: dto.mode,
          receiptType: dto.receiptType,
          payment: { create: payment },
          ...(points > 0 && membership
            ? {
                rewardMovement: {
                  create: { membershipId: membership.id, points, kind: 'EARN' },
                },
              }
            : {}),
        },
        tx,
      );
      return {
        transaction: transactionResponse(transaction),
        pointsEarned: points,
        replayed: false,
      };
    });
  }
  async get(id: string, actor: Actor) {
    const transaction = await this.repo.byId(id);
    if (
      !transaction ||
      (actor.kind === 'member' &&
        transaction.membership?.userId !== actor.userId)
    )
      throw new NotFoundException('Transacción no encontrada');
    return transactionResponse(transaction);
  }
}
