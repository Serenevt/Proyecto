import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { AccessGuard } from './access.guard';
import { AuthorizationsController } from '../transactions/authorizations.controller';
import { RecognitionController } from '../vehicles/recognition.controller';
import { OnlineOrdersController } from '../payments/online-orders';
import { VehiclesController } from '../vehicles/vehicles.controller';
import { assertStagingFuelFlowPolicy } from './staging-fuelflow';
import { validateEnvironment } from '../config/environment';
import { EventEmitter } from 'node:events';

const operatorId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const proxyKey = 'f'.repeat(40);
const kioskKey = 'k'.repeat(40);

function guardFor(controller: { prototype: object }, method: string, options: {
  mode?: string; proxy?: string; kiosk?: string; token?: string; sub?: string;
  active?: boolean; ver?: number; body?: unknown; enabled?: string;
  response?: EventEmitter;
} = {}) {
  const headers: Record<string, string | undefined> = {
    'x-fuelflow-proxy-key': options.proxy,
    'x-kiosk-key': options.kiosk,
    authorization: options.token === undefined ? 'Bearer operator-token' : options.token,
  };
  const request: { actor?: unknown; body: unknown; res?: EventEmitter; header: (name: string) => string | undefined } = {
    body: options.body ?? {}, res: options.response, header: (name) => headers[name],
  };
  const jwt = { verifyAsync: jest.fn().mockImplementation(() => {
    if (options.token === 'Bearer expired') throw Error('expired');
    return { sub: options.sub ?? operatorId, ver: 0 };
  }) };
  const users = { findById: jest.fn().mockResolvedValue({
    id: options.sub ?? operatorId, active: options.active ?? true,
    authVersion: options.ver ?? 0,
  }) };
  const config = new ConfigService({
    APP_MODE: options.mode ?? 'staging', KIOSK_API_KEY: kioskKey,
    STAGING_FUELFLOW_ENABLED: options.enabled ?? 'true',
    STAGING_FUELFLOW_PROXY_KEY: proxyKey,
    STAGING_FUELFLOW_OPERATOR_IDS: operatorId,
  });
  const guard = new AccessGuard(new Reflector(), config,
    jwt as unknown as JwtService, users as unknown as UsersService);
  const context = {
    getHandler: () => (controller.prototype as Record<string, unknown>)[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { guard, context, request, jwt, users };
}

describe('staging FuelFlow terminal access', () => {
  it('requires both the dedicated proxy key and a valid allowlisted operator', async () => {
    const { guard, context, request, users } = guardFor(AuthorizationsController, 'status', { proxy: proxyKey });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.actor).toEqual({ kind: 'kiosk', operatorUserId: operatorId });
    expect(users.findById).toHaveBeenCalledWith(operatorId);
  });

  it('attributes completed FuelFlow requests to the operator UUID without logging credentials', async () => {
    const response = new EventEmitter();
    (response as EventEmitter & { statusCode: number }).statusCode = 201;
    const log = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const { guard, context } = guardFor(AuthorizationsController, 'create', {
        proxy: proxyKey, response,
        body: { mode: 'POSTPAGO', allowDebt: false,
          operationId: '33333333-3333-4333-8333-333333333333' },
      });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      response.emit('finish');
      expect(log).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(String(log.mock.calls[0][0])) as Record<string, unknown>;
      expect(entry).toMatchObject({ operatorUserId: operatorId,
        operationId: '33333333-3333-4333-8333-333333333333', status: 201 });
      expect(JSON.stringify(entry)).not.toContain(proxyKey);
    } finally { log.mockRestore(); }
  });

  it.each([
    [{ proxy: undefined }, ForbiddenException],
    [{ proxy: 'wrong' }, UnauthorizedException],
    [{ proxy: proxyKey, token: undefined, enabled: 'false' }, ForbiddenException],
    [{ proxy: proxyKey, token: 'Bearer expired' }, UnauthorizedException],
    [{ proxy: proxyKey, sub: otherId }, ForbiddenException],
    [{ proxy: proxyKey, active: false }, UnauthorizedException],
    [{ proxy: proxyKey, ver: 1 }, UnauthorizedException],
    [{ proxy: proxyKey, kiosk: kioskKey }, ForbiddenException],
  ] as const)('rejects missing, invalid, revoked or legacy terminal proof %#', async (options, error) => {
    const { guard, context } = guardFor(AuthorizationsController, 'status', options);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(error);
  });

  it('keeps OCR and refund routes closed even with both credentials', async () => {
    for (const [controller, method] of [
      [RecognitionController, 'recognize'],
      [OnlineOrdersController, 'refund'],
      [AuthorizationsController, 'pending'],
    ] as const) {
      const { guard, context } = guardFor(controller, method, { proxy: proxyKey });
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('keeps normal member access and local/production kiosk behavior', async () => {
    const member = guardFor(VehiclesController, 'find');
    await expect(member.guard.canActivate(member.context)).resolves.toBe(true);
    expect(member.request.actor).toEqual({ kind: 'member', userId: operatorId });
    for (const mode of ['local', 'production']) {
      const terminal = guardFor(AuthorizationsController, 'status', { mode, kiosk: kioskKey });
      await expect(terminal.guard.canActivate(terminal.context)).resolves.toBe(true);
      expect(terminal.request.actor).toEqual({ kind: 'kiosk' });
    }
  });

  it('rejects debt before controller execution, including nested online order debt', async () => {
    for (const [controller, method, body] of [
      [AuthorizationsController, 'create', { mode: 'POSTPAGO', allowDebt: true }],
      [OnlineOrdersController, 'create', { transactionId: otherId, authorization: { mode: 'PREPAGO' } }],
      [OnlineOrdersController, 'create', { method: 'YAPE', authorization: { mode: 'PREPAGO', paymentMethod: 'YAPE', allowDebt: true } }],
    ] as const) {
      const { guard, context } = guardFor(controller, method, { proxy: proxyKey, body });
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(() => assertStagingFuelFlowPolicy('transaction', { mode: 'POSTPAGO', paymentMethod: 'EFECTIVO' }))
      .toThrow(ForbiddenException);
  });

  it('accepts the four DEMO payment paths and saldo Prime without debt', () => {
    for (const method of ['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN']) {
      expect(() => assertStagingFuelFlowPolicy('transaction', { mode: 'PREPAGO', paymentMethod: method })).not.toThrow();
    }
    expect(() => assertStagingFuelFlowPolicy('transaction', { mode: 'POSTPAGO', paymentMethod: 'SALDO_PRIME' })).not.toThrow();
    expect(() => assertStagingFuelFlowPolicy('authorization', { mode: 'POSTPAGO', allowDebt: false })).not.toThrow();
    expect(() => assertStagingFuelFlowPolicy('order', { method: 'YAPE', authorization: { mode: 'PREPAGO', paymentMethod: 'YAPE', allowDebt: false } })).not.toThrow();
  });
});

describe('staging FuelFlow environment', () => {
  const base = {
    DATABASE_URL: 'postgresql://fixture:fixture@db.example.test/demo', JWT_SECRET: 'j'.repeat(40),
    KIOSK_API_KEY: kioskKey, APP_MODE: 'staging', PAYMENT_ENV: 'demo',
    DEMO_WALLET_ENABLED: 'true', CORS_ORIGINS: 'https://prime.example.test',
    STAGING_FUELFLOW_ENABLED: 'true', STAGING_FUELFLOW_PROXY_KEY: proxyKey,
    STAGING_FUELFLOW_OPERATOR_IDS: operatorId,
  };
  it('accepts explicit staging configuration', () => {
    expect(validateEnvironment(base)).toMatchObject({ CORS_ORIGINS: base.CORS_ORIGINS });
  });
  it.each([
    { APP_MODE: 'local' }, { APP_MODE: 'production' },
    { STAGING_FUELFLOW_PROXY_KEY: 'short' },
    { STAGING_FUELFLOW_OPERATOR_IDS: '' },
    { STAGING_FUELFLOW_OPERATOR_IDS: `${operatorId},invalid` },
  ])('rejects invalid operator configuration %p', (patch) => {
    expect(() => validateEnvironment({ ...base, ...patch })).toThrow();
  });
});
