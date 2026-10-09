import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class VehicleResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'ABC-123' }) plate: string;
  @ApiProperty({ example: 'Mi auto' }) label: string;
  @ApiPropertyOptional({
    nullable: true,
    example: { id: 'uuid', number: 'PRIME-0001', status: 'ACTIVE' },
  })
  membership?: object | null;
}
export class FuelResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'PREMIUM' }) code: string;
  @ApiProperty({ example: 'Premium' }) name: string;
  @ApiProperty({ example: '23.50', type: String }) pricePerGallon: string;
  @ApiProperty() active: boolean;
}
export class StationResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'PRIMAX-SUR' }) code: string;
  @ApiProperty({ example: 'Primax Sur' }) name: string;
  @ApiProperty() address: string;
  @ApiProperty() active: boolean;
}
export class BenefitResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'coffee' }) code: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() category: string;
  @ApiProperty({ example: 400 }) pointsCost: number;
  @ApiProperty() active: boolean;
}
export class MembershipResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'PRIME-0001' }) number: string;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] }) status: string;
  @ApiProperty({ example: { name: 'Diego', email: 'demo@primaxprime.pe' } })
  user: object;
  @ApiProperty({ type: [VehicleResponseDto] }) vehicles: VehicleResponseDto[];
  @ApiProperty({ example: 100, description: 'Suma de todo el ledger.' })
  points: number;
}
export class RewardResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['EARN', 'REDEEM'] }) kind: string;
  @ApiProperty({ example: 100 }) points: number;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) transactionId:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) redemptionId:
    | string
    | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
export class RedemptionResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Identificador del cupón.' })
  id: string;
  @ApiProperty({ format: 'uuid' }) operationId: string;
  @ApiProperty({ enum: ['ISSUED'] }) status: string;
  @ApiProperty({ example: 400 }) pointsSpent: number;
  @ApiProperty({ type: BenefitResponseDto }) benefit: BenefitResponseDto;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
export class RedeemResponseDto {
  @ApiProperty({ type: RedemptionResponseDto })
  redemption: RedemptionResponseDto;
  @ApiProperty() replayed: boolean;
}
export class TransactionViewDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) operationId: string;
  @ApiProperty({ example: '100.00', type: String }) amount: string;
  @ApiProperty({ example: 'PEN' }) currency: string;
  @ApiProperty({ example: 100 }) pointsEarned: number;
  @ApiProperty({ example: '1', type: String }) pointsRate: string;
  @ApiProperty({ enum: ['PAID'] }) status: string;
  @ApiProperty({ enum: ['PREPAGO', 'POSTPAGO'] }) mode: string;
  @ApiProperty({ enum: ['BOLETA', 'FACTURA'] }) receiptType: string;
  @ApiProperty({ type: VehicleResponseDto }) vehicle: VehicleResponseDto;
  @ApiProperty({ type: FuelResponseDto }) fuel: FuelResponseDto;
  @ApiProperty({ type: StationResponseDto }) station: StationResponseDto;
  @ApiProperty({
    nullable: true,
    example: { id: 'uuid', number: 'PRIME-0001', name: 'Diego' },
  })
  membership: object | null;
  @ApiProperty({
    example: {
      amount: '100',
      method: 'TARJETA',
      status: 'CAPTURED',
      provider: 'DEMO',
    },
  })
  payment: object;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
