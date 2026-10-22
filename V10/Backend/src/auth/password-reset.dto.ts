import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { EmailCredentialsDto } from './login.dto';
import { RegisterDto } from './register.dto';
export class ForgotPasswordDto extends PickType(EmailCredentialsDto, [
  'email',
] as const) {}
export class VerifyResetCodeDto extends ForgotPasswordDto {
  @ApiProperty() @IsString() @Matches(/^\d{8}$/) code: string;
}
export class ResetPasswordDto extends PickType(RegisterDto, [
  'password',
] as const) {
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) resetToken: string;
}
