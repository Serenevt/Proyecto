import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';
import { PaymentMethod, PurchaseMode, ReceiptType } from '@prisma/client';
import { ReceiptProfileDto } from '../memberships/profile.dto';

export class CreateTransactionDto extends ReceiptProfileDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^\d{1,6}(\.\d{1,2})?$/)
  unitPrice?: string;
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
      'Importe final cobrado en PEN, como string decimal. En postpago debe ' +
      'coincidir con gallons × unitPrice dentro de la tolerancia del backend.',
  })
  @IsString()
  @Matches(/^\d{1,6}(\.\d{1,2})?$/)
  amount: string;
  @ApiProperty({ enum: PurchaseMode, example: 'PREPAGO' })
  @IsEnum(PurchaseMode)
  mode: PurchaseMode;
  @ApiProperty({
    enum: PaymentMethod,
    example: 'TARJETA',
    description:
      'Medio externo para PREPAGO; SALDO_PRIME obligatorio para POSTPAGO.',
  })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
  @ApiPropertyOptional({
    enum: ReceiptType,
    default: 'BOLETA',
  })
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
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Reserva de saldo previa. Obligatoria en POSTPAGO: identifica el ' +
      'importes ya descontado del saldo Primax Prime.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  authorizationId?: string;
  @ApiPropertyOptional({
    description:
      'Código de membresía capturado en el terminal. Si se informa en ' +
      'POSTPAGO, debe coincidir con el de la placa.',
    example: 'PRIME-0001',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z0-9-]{4,30}$/)
  membershipCode?: string;
  @ApiPropertyOptional({
    enum: ['AUTO', 'MANUAL'],
    default: 'MANUAL',
    description:
      'Cómo terminó el abastecimiento: AUTO si el surtidor alcanzó el tope, ' +
      'MANUAL si el cliente pulsó Detener. Solo informativo para la auditoría.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['AUTO', 'MANUAL'])
  outcome?: 'AUTO' | 'MANUAL';
}
