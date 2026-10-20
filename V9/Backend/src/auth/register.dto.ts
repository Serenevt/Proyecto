import { IntersectionType, ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsByteLength,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ProfileDto, cleanText } from '../memberships/profile.dto';
import { LoginDto } from './login.dto';

export class RegisterDto extends IntersectionType(LoginDto, ProfileDto) {
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => cleanText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiProperty({ minLength: 10, maxLength: 72 })
  @MinLength(10)
  @IsByteLength(0, 72)
  @Matches(/\S/, { message: 'La contraseña no puede contener solo espacios' })
  declare password: string;
}
