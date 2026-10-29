import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RecoveryDelivery } from './recovery-delivery';
import {
  ForgotPasswordDto,
  VerifyResetCodeDto,
  ResetPasswordDto,
} from './password-reset.dto';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly delivery: RecoveryDelivery,
  ) {}
  private codeHash(id: string, code: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update('v10-reset-code:' + id + ':' + code)
      .digest('hex');
  }
  private invalid() {
    return new BadRequestException(
      'Código o enlace inválido o vencido. Solicita uno nuevo.',
    );
  }
  async forgot(dto: ForgotPasswordDto) {
    if (this.delivery.mode === 'disabled')
      throw new ServiceUnavailableException('La recuperación por correo no está configurada. Contacta al administrador.');
    const response = {
      message:
        'Si la cuenta existe, recibirás instrucciones para recuperar tu contraseña.',
      delivery: this.delivery.mode,
    };
    const account = await this.db.user.findUnique({where:{email:dto.email.trim().toLowerCase()}});
    if (!account?.active) throw new BadRequestException('No existe una cuenta registrada con este correo.');
    const email = dto.email.trim().toLowerCase();
    const code = String(randomInt(100000000)).padStart(8, '0');
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + Number(this.config.get('PASSWORD_RESET_TTL_MINUTES') ?? 10) * 60_000);
    const issued = await this.db.atomic(async (tx) => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user?.active) return false;
      const current = await tx.passwordReset.findUnique({
        where: { userId: user.id },
      });
      // Per-account cooldown as well as the controller's per-IP rate limits.
      if (current && Date.now() - current.createdAt.getTime() < 60_000)
        return false;
      await tx.passwordReset.deleteMany({ where: { userId: user.id } });
      await tx.passwordReset.create({
        data: {
          id,
          userId: user.id,
          codeHash: this.codeHash(id, code),
          expiresAt,
        },
      });
      return true;
    });
    if (issued) {
      try {
        await this.delivery.send(email, code, expiresAt);
      } catch {
        this.logger.warn('Recovery delivery failed; no sensitive data logged');
        await this.db.passwordReset.updateMany({where:{id},data:{usedAt:new Date(),tokenHash:null}});
        throw new ServiceUnavailableException('No se pudo enviar el correo. Intenta nuevamente en un minuto.');
      }
    }
    return response;
  }
  async verify(dto: VerifyResetCodeDto) {
    const resetToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(resetToken).digest('hex');
    const accepted = await this.db.atomic(async (tx) => {
      const user = await tx.user.findUnique({
        where: { email: dto.email.trim().toLowerCase() },
      });
      if (!user?.active) return false;
      const row = await tx.passwordReset.findUnique({
        where: { userId: user.id },
      });
      if (
        !row ||
        row.usedAt ||
        row.verifiedAt ||
        row.attempts >= Number(this.config.get('PASSWORD_RESET_MAX_ATTEMPTS') ?? 5) ||
        row.expiresAt.getTime() <= Date.now()
      )
        return false;
      const valid = timingSafeEqual(
        Buffer.from(row.codeHash, 'hex'),
        Buffer.from(this.codeHash(row.id, dto.code), 'hex'),
      );
      // Return rather than throw inside the transaction so failed attempts commit.
      await tx.passwordReset.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          ...(valid
            ? {
                verifiedAt: new Date(),
                tokenHash,
                expiresAt: new Date(
                  Math.min(row.expiresAt.getTime(), Date.now() + 5 * 60_000),
                ),
              }
            : {}),
        },
      });
      return valid;
    });
    if (!accepted) throw this.invalid();
    return { resetToken };
  }
  async reset(dto: ResetPasswordDto) {
    const tokenHash = createHash('sha256').update(dto.resetToken).digest('hex');
    const passwordHash = await hash(dto.password, 12);
    const accepted = await this.db.atomic(async (tx) => {
      const row = await tx.passwordReset.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (
        !row ||
        !row.user.active ||
        row.usedAt ||
        !row.verifiedAt ||
        row.expiresAt.getTime() <= Date.now()
      )
        return false;
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await tx.passwordReset.update({
        where: { id: row.id },
        data: { usedAt: new Date(), tokenHash: null },
      });
      return true;
    });
    if (!accepted) throw this.invalid();
    return { message: 'Contraseña actualizada. Inicia sesión nuevamente.' };
  }
}
