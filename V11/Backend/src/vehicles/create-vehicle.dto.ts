import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { cleanText } from '../memberships/profile.dto';
import { PlateDto } from './plate.dto';

export class CreateVehicleDto extends PlateDto {
  @ApiProperty({ example: 'Mi vehículo' })
  @Transform(({ value }: { value: unknown }) => cleanText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;
}
