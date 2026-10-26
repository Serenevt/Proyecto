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
import { Actor, StagingFuelFlowPolicy } from './access';
import {
  assertStagingFuelFlowPolicy,
  stagingOperatorIds,
} from './staging-fuelflow';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { Optional } from '@nestjs/common';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    @Optional() private readonly db?: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const access = this.reflector.getAllAndOverride<string>('access', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (access === 'public') return true;
    const req = context.switchToHttp().getRequest<Request & { actor: Actor }>();
    const key = req.header('x-kiosk-key');
    const proxyKey = req.header('x-fuelflow-proxy-key');
    const staging = this.config.get('APP_MODE') === 'staging';
    if (access === 'terminal') {
      const technical =
        (staging ? req.header('x-terminal-session') : undefined) ??
        (!staging
          ? req
              .header('cookie')
              ?.split(';')
              .map((part) => part.trim())
              .find((part) => part.startsWith('__Host-fuelflow-terminal='))
              ?.slice('__Host-fuelflow-terminal='.length)
          : undefined);
      if (!technical || !/^[0-9a-f]{64}$/i.test(technical) || !this.db)
        throw new UnauthorizedException('Sesión técnica requerida');
      if (staging) {
        if (
          this.config.get('STAGING_FUELFLOW_ENABLED') !== 'true' ||
          key ||
          !proxyKey
        )
          throw new ForbiddenException('Terminal deshabilitada en staging');
        const expected = Buffer.from(
          this.config.get<string>('STAGING_FUELFLOW_PROXY_KEY') ?? '',
        );
        const actual = Buffer.from(proxyKey);
        if (
          !expected.length ||
          actual.length !== expected.length ||
          !timingSafeEqual(actual, expected)
        )
          throw new UnauthorizedException('Proxy inválido');
      } else if (
        !key ||
        !this.equalKey(key, this.config.getOrThrow<string>('KIOSK_API_KEY'))
      )
        throw new UnauthorizedException('Proxy local inválido');
      const credential = await this.db.terminalCredential.findUnique({
        where: {
          tokenHash: createHash('sha256').update(technical).digest('hex'),
        },
        include: { terminal: true },
      });
      if (
        !credential ||
        credential.revokedAt ||
        credential.expiresAt <= new Date() ||
        credential.terminal.lifecycle !== 'REGISTRADA' ||
        credential.terminal.revokedAt
      )
        throw new UnauthorizedException('Sesión técnica vencida o revocada');
      req.actor = {
        kind: 'terminal',
        terminalId: credential.terminalId,
        stationId: credential.terminal.stationId,
        credentialId: credential.id,
      };
      return true;
    }
    if (
      staging &&
      (access === 'kiosk' || (access === 'either' && (key || proxyKey)))
    ) {
      if (
        key ||
        !proxyKey ||
        this.config.get('STAGING_FUELFLOW_ENABLED') !== 'true'
      )
        throw new ForbiddenException('Terminal deshabilitado en staging');
      const policy = this.reflector.getAllAndOverride<StagingFuelFlowPolicy>(
        'stagingFuelFlow',
        [context.getHandler(), context.getClass()],
      );
      if (!policy) throw new ForbiddenException('Ruta FuelFlow no permitida');
      const expected = Buffer.from(
        this.config.get<string>('STAGING_FUELFLOW_PROXY_KEY') ?? '',
      );
      const actual = Buffer.from(proxyKey);
      if (
        !expected.length ||
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw new UnauthorizedException('Credencial FuelFlow inválida');
      const token = req.header('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token)
        throw new UnauthorizedException('Se requiere sesión de operador');
      let operator: { sub?: string; ver?: number };
      try {
        operator = await this.jwt.verifyAsync<{ sub?: string; ver?: number }>(
          token,
        );
      } catch {
        throw new UnauthorizedException(
          'Sesión de operador inválida o vencida',
        );
      }
      if (
        typeof operator.sub !== 'string' ||
        !stagingOperatorIds(
          this.config.get<string>('STAGING_FUELFLOW_OPERATOR_IDS'),
        ).has(operator.sub.toLowerCase())
      )
        throw new ForbiddenException('Operador FuelFlow no autorizado');
      const user = await this.users.findById(operator.sub);
      if (!user?.active || (operator.ver ?? 0) !== user.authVersion)
        throw new UnauthorizedException('Sesión de operador revocada');
      req.actor = { kind: 'kiosk', operatorUserId: user.id };
      // Operational attribution without storing credentials or personal data.
      const operationId =
        req.body?.operationId ??
        req.body?.authorization?.operationId ??
        req.params?.id;
      const reference =
        typeof operationId === 'string' && /^[0-9a-f-]{36}$/i.test(operationId)
          ? operationId
          : undefined;
      let recorded = false;
      const record = (outcome: 'finish' | 'close') => {
        if (recorded) return;
        recorded = true;
        console.info(
          JSON.stringify({
            event: 'fuelflow-staging',
            operatorUserId: user.id,
            route: context.getClass().name + '.' + context.getHandler().name,
            operationId: reference,
            status: req.res?.statusCode,
            outcome,
          }),
        );
      };
      req.res?.once('finish', () => record('finish'));
      req.res?.once('close', () => record('close'));
      assertStagingFuelFlowPolicy(policy, req.body);
      return true;
    }
    if (proxyKey)
      throw new ForbiddenException('Credencial FuelFlow fuera de staging');
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
        payload.role === 'admin' &&
        payload.sub === 'admin' &&
        username &&
        payload.adminUser === username
      ) {
        req.actor = { kind: 'admin', adminUser: username };
        return true;
      }
      // A Prime account may also hold an explicit global permission.
      if (typeof payload.sub !== 'string' || !this.db)
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
      (!this.db ||
        !(await this.db.supervisorStationAssignment.findFirst({
          where: { userId: user.id, endedAt: null, station: { active: true } },
        })))
    )
      throw new ForbiddenException('Se requiere asignación de supervisor');
    return true;
  }
  private equalKey(value: string, expected: string) {
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
