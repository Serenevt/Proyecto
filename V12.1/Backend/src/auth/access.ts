import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
export type Actor =
  | { kind: 'member'; userId: string }
  | { kind: 'admin'; adminUser: string }
  | {
      kind: 'control';
      userId: string;
      role: string;
      permissions: string[];
      stationIds: string[];
      global: boolean;
    }
  | {
      kind: 'terminal';
      terminalId: string;
      stationId: string;
      credentialId: string;
    }
  | { kind: 'kiosk'; stationId?: string };
export const Public = () => SetMetadata('access', 'public');
export const KioskOnly = () => SetMetadata('access', 'kiosk');
export const MemberOrKiosk = () => SetMetadata('access', 'either');
export const SupervisorOnly = () => SetMetadata('access', 'supervisor');
export const TerminalOnly = () => SetMetadata('access', 'terminal');
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor =>
    ctx.switchToHttp().getRequest<{ actor: Actor }>().actor,
);
