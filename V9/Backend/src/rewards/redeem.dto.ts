import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
export class RedeemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() benefitId: string;
  @ApiProperty({
    format: 'uuid',
    description: 'UUID estable para reintentar un mismo canje.',
  })
  @IsUUID('4')
  operationId: string;
}
