import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
export type Actor =
  | { kind: 'member'; userId: string }
  | { kind: 'kiosk'; operatorUserId?: string }
  | {
      kind: 'terminal';
      terminalId: string;
      stationId: string;
      credentialId: string;
    }
  | { kind: 'admin'; adminUser: string };
export const Public = () => SetMetadata('access', 'public');
export const KioskOnly = () => SetMetadata('access', 'kiosk');
export const MemberOrKiosk = () => SetMetadata('access', 'either');
export const SupervisorOnly = () => SetMetadata('access', 'supervisor');
export const TerminalOnly = () => SetMetadata('access', 'terminal');
export type StagingFuelFlowPolicy =
  | 'read'
  | 'write'
  | 'authorization'
  | 'transaction'
  | 'order';
export const StagingFuelFlow = (policy: StagingFuelFlowPolicy) =>
  SetMetadata('stagingFuelFlow', policy);
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor =>
    ctx.switchToHttp().getRequest<{ actor: Actor }>().actor,
);
