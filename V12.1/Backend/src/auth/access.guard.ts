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
import { createHash, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { demoAdminEnabled } from './admin.controller';
import { KioskService } from '../kiosk/kiosk.service';
import { Actor } from './access';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly kiosk: KioskService,
    private readonly db: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const access = this.reflector.getAllAndOverride<string>('access', [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request & { actor: Actor }>();
    const signed = Boolean(req.header('x-kiosk-signature'));
    if (signed && access === 'control')
      throw new ForbiddenException(
        'Primax Control no acepta sesiones de kiosco',
      );
    if (
      signed &&
      access !== 'supervisor' &&
      access !== 'terminal' &&
      !req.path.startsWith('/api/v1/kiosk/session')
    ) {
      req.actor = await this.kiosk.authorize(req);
      return true;
    }
    if (access === 'terminal') {
      if (!signed) throw new UnauthorizedException('Gateway requerido');
      this.kiosk.verifyGateway(req);
      await this.kiosk.limitTechnical(req);
      const token = req.header('x-terminal-session') || '';
      if (!/^[a-f0-9]{64}$/.test(token))
        throw new UnauthorizedException('Credencial técnica requerida');
      const credential = await this.db.terminalCredential.findUnique({
        where: { tokenHash: createHash('sha256').update(token).digest('hex') },
        include: { terminal: true },
      });
      if (
        !credential ||
        credential.revokedAt ||
        credential.expiresAt <= new Date() ||
        credential.terminal.lifecycle !== 'REGISTRADA' ||
        credential.terminal.revokedAt
      )
        throw new UnauthorizedException(
          'Credencial técnica revocada o vencida',
        );
      req.actor = {
        kind: 'terminal',
        terminalId: credential.terminalId,
        stationId: credential.terminal.stationId,
        credentialId: credential.id,
      };
      return true;
    }
    if (access === 'public') return true;
    if (signed && access !== 'supervisor')
      throw new ForbiddenException('Ruta firmada no permitida');
    if (
      access === 'supervisor' &&
      req.path?.match(/\/terminals\/[0-9a-f-]+\/(pair|rotate|revoke-session)$/i)
    ) {
      if (!signed) throw new UnauthorizedException('Gateway requerido');
      this.kiosk.verifyGateway(req);
      await this.kiosk.session(
        req.header('x-kiosk-session') || '',
        req.header('x-csrf-token') || '',
        false,
      );
      await this.kiosk.limitTechnical(req);
    } else if (signed) {
      throw new ForbiddenException('Ruta firmada no permitida');
    }
    const key = req.header('x-kiosk-key');
    if (key && (access === 'kiosk' || access === 'either')) {
      if (this.config.get('APP_MODE') === 'academic')
        throw new UnauthorizedException('Se requiere una sesión de operador');
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
    const cookieToken =
      access === 'control'
        ? req.headers.cookie
            ?.split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith('primax_control='))
            ?.slice('primax_control='.length)
        : undefined;
    const token =
      req.header('authorization')?.match(/^Bearer (\S+)$/i)?.[1] ?? cookieToken;
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
        payload.role === 'admin' &&
        payload.sub === 'admin' &&
        username &&
        payload.adminUser === username
      ) {
        req.actor = { kind: 'admin', adminUser: username };
        return true;
      }
      if (
        typeof payload.sub !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(payload.sub)
      )
        throw new ForbiddenException('Se requiere permiso administrativo');
      const adminUser = await this.users.findById(payload.sub);
      if (
        !adminUser?.active ||
        (payload.ver ?? 0) !== adminUser.authVersion ||
        !(await this.db.userPermissionGrant.findFirst({
          where: {
            userId: adminUser.id,
            permission: 'SYSTEM_ADMIN',
            revokedAt: null,
          },
        }))
      )
        throw new ForbiddenException('Se requiere permiso administrativo');
      req.actor = { kind: 'member', userId: adminUser.id };
      return true;
    }
    if (access === 'control') {
      if (
        typeof payload.sub !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(payload.sub)
      )
        throw new UnauthorizedException('Sesión administrativa inválida');
      const user = await this.users.findById(payload.sub);
      if (!user?.active || (payload.ver ?? 0) !== user.authVersion)
        throw new UnauthorizedException('Sesión administrativa vencida');
      const systemAdmin = await this.db.userPermissionGrant.findFirst({
        where: { userId: user.id, permission: 'SYSTEM_ADMIN', revokedAt: null },
      });
      const account = await this.db.adminControlAccount.findUnique({
        where: { userId: user.id },
        include: {
          stations: {
            where: { endedAt: null, station: { active: true } },
            select: { stationId: true },
          },
        },
      });
      if (
        !systemAdmin &&
        (!account || account.status !== 'APPROVED' || !account.emailVerifiedAt)
      )
        throw new ForbiddenException(
          'Acceso administrativo pendiente o revocado',
        );
      const permissions = systemAdmin
        ? [
            'ADMIN_CONTROL_ACCESS',
            'ADMIN_DASHBOARD_VIEW',
            'ADMIN_INCIDENT_VIEW',
            'ADMIN_INCIDENT_MANAGE',
            'ADMIN_INVENTORY_VIEW',
            'ADMIN_OPERATION_VIEW',
            'ADMIN_USER_MANAGE',
            'ADMIN_STATION_MANAGE',
            'ADMIN_AUDIT_VIEW',
          ]
        : (
            await this.db.adminControlGrant.findMany({
              where: { userId: user.id, revokedAt: null },
            })
          ).map((grant) => grant.permission);
      if (!systemAdmin && !permissions.includes('ADMIN_CONTROL_ACCESS'))
        throw new ForbiddenException('Se requiere acceso a Primax Control');
      req.actor = {
        kind: 'control',
        userId: user.id,
        role: systemAdmin ? 'SUPER_ADMIN' : account!.role,
        permissions,
        stationIds: systemAdmin
          ? []
          : account!.stations.map((station) => station.stationId),
        global: Boolean(systemAdmin),
      };
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
    if (
      access === 'supervisor' &&
      !(await this.db.supervisorStationAssignment.findFirst({
        where: { userId: user.id, endedAt: null, station: { active: true } },
      }))
    )
      throw new ForbiddenException('Se requiere asignación de supervisor');
    return true;
  }
}
