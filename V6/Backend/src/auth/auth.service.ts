import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './login.dto';
@Injectable()
export class AuthService {
  private readonly dummyHash = hash('invalid-account-timing-placeholder', 12);
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}
  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    const valid = await compare(
      dto.password,
      user?.passwordHash ?? (await this.dummyHash),
    );
    if (!user?.active || !valid)
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: { id: user.id, name: user.name, email: user.email },
    };
  }
}
