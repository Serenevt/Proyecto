import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches } from 'class-validator';

export class RechargeDto {
  @ApiProperty({
    format: 'uuid',
    description: 'UUID estable por recarga. Reutilízalo al reintentar.',
  })
  @IsUUID('4')
  operationId: string;

  @ApiProperty({
    example: '50.00',
    description: 'Importe a acreditar en soles, como string decimal.',
  })
  @IsString()
  @Matches(/^\d{1,6}(\.\d{1,2})?$/)
  amount: string;
}
