import 'reflect-metadata';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { UsersService } from '../users/users.service';
import { AccessGuard } from './access.guard';
import { AdminController } from './admin.controller';
import { AuthorizationsController } from '../transactions/authorizations.controller';
import { TransactionsController } from '../transactions/transactions.controller';
import { RecognitionController } from '../vehicles/recognition.controller';
import { PaymentLifecycleController } from '../payments/payment-lifecycle';
import { OnlineOrdersController } from '../payments/online-orders';
import { VehiclesController } from '../vehicles/vehicles.controller';

const userId = '11111111-1111-4111-8111-111111111111';
const kioskKey = 'k'.repeat(32);
const kioskRoutes = [
  [AdminController, 'check'],
  [AuthorizationsController, 'create'],
  [AuthorizationsController, 'intervention'],
  [AuthorizationsController, 'progress'],
  [AuthorizationsController, 'status'],
  [AuthorizationsController, 'pending'],
  [AuthorizationsController, 'release'],
  [TransactionsController, 'create'],
  [RecognitionController, 'recognize'],
  [PaymentLifecycleController, 'refund'],
] as const;
const sharedRoutes = [
  [VehiclesController, 'find'],
  [TransactionsController, 'get'],
  [OnlineOrdersController, 'create'],
  [OnlineOrdersController, 'confirmDemo'],
  [OnlineOrdersController, 'cancel'],
  [OnlineOrdersController, 'refund'],
  [OnlineOrdersController, 'status'],
] as const;

function harness(mode: string, controller: { prototype: object }, method: string, key?: string) {
  const handler = (controller.prototype as Record<string, unknown>)[method] as (...args: unknown[]) => unknown;
  const request: { header: (name: string) => string | undefined; actor?: unknown } = {
    header: (name) => name === 'x-kiosk-key' ? key
      : name === 'authorization' ? 'Bearer valid-member-token' : undefined,
  };
  const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: userId, ver: 0 }) };
  const users = { findById: jest.fn().mockResolvedValue({ id: userId, active: true, authVersion: 0 }) };
  const guard = new AccessGuard(
    new Reflector(), new ConfigService({ APP_MODE: mode, KIOSK_API_KEY: kioskKey }),
    jwt as unknown as JwtService, users as unknown as UsersService,
  );
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { guard, context, request, jwt, users };
}

function accessOf(controller: { prototype: object }, method: string) {
  const handler = (controller.prototype as Record<string, unknown>)[method] as object;
  return Reflect.getMetadata('access', handler) ?? Reflect.getMetadata('access', controller);
}

describe('staging terminal access boundary', () => {
  it.each(kioskRoutes)('blocks KioskOnly route %# with and without a valid key', async (controller, method) => {
    expect(accessOf(controller, method)).toBe('kiosk');
    for (const key of [undefined, 'wrong-key', kioskKey]) {
      const { guard, context, jwt, users } = harness('staging', controller, method, key);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
      expect(jwt.verifyAsync).not.toHaveBeenCalled();
      expect(users.findById).not.toHaveBeenCalled();
    }
  });

  it.each(sharedRoutes)('allows a member but blocks kiosk identity at shared route %#', async (controller, method) => {
    expect(accessOf(controller, method)).toBe('either');
    const member = harness('staging', controller, method);
    await expect(member.guard.canActivate(member.context)).resolves.toBe(true);
    expect(member.request.actor).toEqual({ kind: 'member', userId });
    const terminal = harness('staging', controller, method, kioskKey);
    await expect(terminal.guard.canActivate(terminal.context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(terminal.jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it.each(['local', 'production'])('preserves kiosk access in %s', async (mode) => {
    const terminal = harness(mode, AuthorizationsController, 'create', kioskKey);
    await expect(terminal.guard.canActivate(terminal.context)).resolves.toBe(true);
    expect(terminal.request.actor).toEqual({ kind: 'kiosk' });
    const shared = harness(mode, OnlineOrdersController, 'status', kioskKey);
    await expect(shared.guard.canActivate(shared.context)).resolves.toBe(true);
    expect(shared.request.actor).toEqual({ kind: 'kiosk' });
  });
});
