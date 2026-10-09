import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export function normalizePlate(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .trim()
    .toUpperCase()
    .replace(/^([A-Z0-9]{3})(\d{3})$/, '$1-$2');
}
export class PlateDto {
  @ApiProperty({ example: 'ABC-123', pattern: '^[A-Z0-9]{3}-[0-9]{3}$' })
  @Transform(({ value }: { value: unknown }) => normalizePlate(value))
  @Matches(/^[A-Z0-9]{3}-\d{3}$/)
  plate: string;
}
