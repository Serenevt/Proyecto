import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PlateDto } from '../vehicles/plate.dto';

export const cleanText = (value: unknown) =>
  typeof value === 'string'
    ? [...value.replace(/<[^>]*>/g, '')]
        .filter((char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127)
        .join('')
        .trim()
    : value;

export class ProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^\d{8}$/) dni?:
    | string
    | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^\d{11}$/) ruc?:
    | string
    | null;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => cleanText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  businessName?: string | null;
}

export class ReceiptProfileDto extends PlateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/)
  receiptDni?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/)
  receiptRuc?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => cleanText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  receiptBusinessName?: string;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  saveReceiptProfile?: boolean;
}
