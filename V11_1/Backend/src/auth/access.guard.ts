import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { demoAdminEnabled } from './admin.controller';
import { Actor } from './access';
import { UsersService } from '../users/users.service';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const access = this.reflector.getAllAndOverride<string>('access', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (access === 'public') return true;
    const req = context.switchToHttp().getRequest<Request & { actor: Actor }>();
    const key = req.header('x-kiosk-key');
    if (key && (access === 'kiosk' || access === 'either')) {
      const expected = Buffer.from(
        this.config.getOrThrow<string>('KIOSK_API_KEY'),
      );
      const actual = Buffer.from(key);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw new UnauthorizedException('Credencial de terminal inválida');
      req.actor = { kind: 'kiosk' };
      return true;
    }
    if (access === 'kiosk')
      throw new UnauthorizedException('Se requiere credencial de terminal');
    const token = req.header('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Se requiere un token Bearer');
    let payload: {
      sub?: string;
      ver?: number;
      role?: string;
      adminUser?: string;
    };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: string; ver?: number }>(
        token,
      );
    } catch {
      throw new UnauthorizedException('Token inválido o vencido');
    }
    if (access === 'admin') {
      const username = this.config.get<string>(
        demoAdminEnabled(this.config) ? 'DEMO_ADMIN_USER' : 'ADMIN_USER',
      );
      if (
        payload.role !== 'admin' ||
        payload.sub !== 'admin' ||
        !username ||
        payload.adminUser !== username
      )
        throw new ForbiddenException('Se requiere sesión administrativa');
      return true;
    }
    if (
      typeof payload.sub !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(payload.sub)
    )
      throw new UnauthorizedException('Token inválido');
    const user = await this.users.findById(payload.sub);
    if (!user?.active) throw new ForbiddenException('Usuario inactivo');
    if ((payload.ver ?? 0) !== user.authVersion)
      throw new UnauthorizedException(
        'Sesión invalidada. Inicia sesión nuevamente.',
      );
    req.actor = { kind: 'member', userId: user.id };
    return true;
  }
}
