import { Prisma } from '@prisma/client';

export function documentConflict(error: unknown): string | undefined {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  )
    return;
  const target = String(error.meta?.target);
  if (target === 'passport' || target === 'Membership_passport_key')
    return 'Este pasaporte ya se encuentra registrado.';
  if (target === 'dni' || target === 'Membership_dni_key')
    return 'Este DNI ya se encuentra registrado.';
  if (target === 'ruc' || target === 'Membership_ruc_key')
    return 'Este RUC ya se encuentra registrado.';
}
