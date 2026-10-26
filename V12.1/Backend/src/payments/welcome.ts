import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateAuthorizationDto } from '../transactions/create-authorization.dto';
import { normalizePlate } from '../vehicles/plate.dto';

// Reserve eligibility, never consume it before successful delivery settlement.
// The membership row and serializable transaction arbitrate all purchase modes.
export async function reserveWelcome(tx: Prisma.TransactionClient, dto: CreateAuthorizationDto) {
  const originalAmount = new Prisma.Decimal(dto.amount);
  let discountAmount = new Prisma.Decimal(0);
  const vehicle = await tx.vehicle.findUnique({ where: { plate: normalizePlate(dto.plate) as string }, include: { membership: { include: { user: true } } } });
  const member = vehicle?.membership;
  if (dto.membershipCode && member?.number !== dto.membershipCode)
    throw new BadRequestException('La membresía no corresponde al vehículo');
  if (originalAmount.gt(50) && member?.status === 'ACTIVE' && member.user.active) {
    const claim = await tx.membership.updateMany({ where: { id: member.id, welcomeAvailable: true, welcomeReservedOperationId: null }, data: { welcomeReservedOperationId: dto.operationId } });
    if (claim.count) discountAmount = new Prisma.Decimal(10);
  }
  return { originalAmount, discountAmount, amount: originalAmount.minus(discountAmount) };
}
