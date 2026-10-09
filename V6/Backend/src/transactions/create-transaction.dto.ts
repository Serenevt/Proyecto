import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, Matches, ValidateIf } from 'class-validator';
import { PaymentMethod, PurchaseMode, ReceiptType } from '@prisma/client';
import { PlateDto } from '../vehicles/plate.dto';
export class CreateTransactionDto extends PlateDto {
  @ApiProperty({
    format: 'uuid',
    description: 'UUID estable por compra. Reutilízalo al reintentar.',
  })
  @IsUUID('4')
  operationId: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() stationId: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() fuelId: string;
  @ApiProperty({
    example: '100.00',
    description:
      'Importe final efectivamente cobrado en PEN, como string decimal.',
  })
  @IsString()
  @Matches(/^\d{1,6}(\.\d{1,2})?$/)
  amount: string;
  @ApiProperty({ enum: PurchaseMode, example: 'PREPAGO' })
  @IsEnum(PurchaseMode)
  mode: PurchaseMode;
  @ApiProperty({ enum: PaymentMethod, example: 'TARJETA' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
  @ApiPropertyOptional({ enum: ReceiptType, default: 'BOLETA' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(ReceiptType)
  receiptType: ReceiptType = ReceiptType.BOLETA;
  @ApiPropertyOptional({
    example: '4.255',
    description: 'Volumen final despachado en galones; hasta 3 decimales.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^\d{1,6}(\.\d{1,3})?$/)
  gallons?: string;
}
