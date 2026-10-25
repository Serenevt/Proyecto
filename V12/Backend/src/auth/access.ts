import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
export type Actor = { kind: 'member'; userId: string } | { kind: 'kiosk' };
export const Public = () => SetMetadata('access', 'public');
export const KioskOnly = () => SetMetadata('access', 'kiosk');
export const MemberOrKiosk = () => SetMetadata('access', 'either');
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor =>
    ctx.switchToHttp().getRequest<{ actor: Actor }>().actor,
);
