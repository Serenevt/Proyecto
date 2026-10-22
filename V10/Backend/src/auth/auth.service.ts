import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';
@Injectable()
export class AuthService {
  private readonly dummyHash = hash('invalid-account-timing-placeholder', 12);
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}
  async login(dto: LoginDto) {
    if (dto.email && dto.identifier)
      throw new BadRequestException('Usa un solo identificador');
    const identifier = (dto.identifier ?? dto.email ?? '').trim().toLowerCase();
    const user = /^\d{8}$/.test(identifier)
      ? await this.users.findByDni(identifier)
      : await this.users.findByEmail(identifier);
    const valid = await compare(
      dto.password,
      user?.passwordHash ?? (await this.dummyHash),
    );
    if (!user?.active || !valid)
      throw new UnauthorizedException('Correo, DNI o contraseña incorrectos');
    return this.session(user);
  }
  async register(dto: RegisterDto) {
    const user = await this.users.register(dto, await hash(dto.password, 12));
    return this.session(user);
  }
  private async session(user: {
    id: string;
    name: string;
    email: string;
    authVersion?: number;
  }) {
    return {
      accessToken: await this.jwt.signAsync({
        sub: user.id,
        ver: user.authVersion ?? 0,
      }),
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: { id: user.id, name: user.name, email: user.email },
    };
  }
}
