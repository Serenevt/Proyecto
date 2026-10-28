import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class EmailCredentialsDto {
  @ApiProperty({ example: 'demo@primaxprime.pe' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
  @ApiProperty({ example: 'LOCAL_DEMO_PASSWORD', minLength: 1, maxLength: 72 })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}
export class LoginDto {
  @ApiProperty({ required: false, description: 'Correo o DNI de 8 dígitos' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @ValidateIf(
    (o: LoginDto) => o.identifier !== undefined || o.email === undefined,
  )
  @IsString()
  @MaxLength(254)
  @Matches(/^(?:[^@\s]+@[^@\s]+\.[^@\s]+|\d{8})$/)
  identifier?: string;

  // Backward-compatible email request; both forms use the same authentication.
  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @ValidateIf(
    (o: LoginDto) => o.email !== undefined || o.identifier === undefined,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}
export class LoginResponseDto {
  @ApiProperty() accessToken: string;
  @ApiProperty({ example: 'Bearer' }) tokenType: string;
  @ApiProperty({ example: 3600 }) expiresIn: number;
  @ApiProperty({
    example: { id: 'uuid', name: 'Diego', email: 'demo@primaxprime.pe' },
  })
  user: { id: string; name: string; email: string };
}
