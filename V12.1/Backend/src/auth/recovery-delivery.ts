import { createTransport } from 'nodemailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class RecoveryDelivery {
  constructor(private readonly config: ConfigService) {}
  get mode(): string {
    return this.config.get<string>('PASSWORD_RESET_DELIVERY') ?? 'disabled';
  }
  async send(email: string, code: string, expiresAt: Date) {
    if (this.mode === 'smtp' || this.mode === 'mailpit') {
      const local = this.mode === 'mailpit';
      const user = this.config.get<string>('SMTP_USER');
      const transport = createTransport({
        host: local ? 'mailpit' : this.config.getOrThrow<string>('SMTP_HOST'),
        port: local ? 1025 : Number(this.config.get('SMTP_PORT') ?? 587),
        secure: !local && String(this.config.get('SMTP_SECURE')) === 'true',
        requireTLS: !local,
        ...(local || !user
          ? {}
          : {
              auth: {
                user,
                pass: this.config.getOrThrow<string>('SMTP_PASSWORD'),
              },
            }),
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      await transport.sendMail({
        from: this.config.getOrThrow<string>('SMTP_FROM'),
        to: email,
        subject: 'Primax Prime: código de recuperación',
        text: `Tu código de verificación es: ${code}\nVence: ${expiresAt.toISOString()}\nSi no lo solicitaste, ignora este correo.`,
      });
      return;
    }
    if (this.mode !== 'disabled')
      throw new Error('Use SMTP or Mailpit; fake mailboxes are disabled');
  }

  async sendAdminVerification(email: string, token: string, expiresAt: Date) {
    if (this.mode !== 'smtp' && this.mode !== 'mailpit')
      throw new Error('Email verification requires SMTP or Mailpit delivery');
    const local = this.mode === 'mailpit';
    const user = this.config.get<string>('SMTP_USER');
    const transport = createTransport({
      host: local ? 'mailpit' : this.config.getOrThrow<string>('SMTP_HOST'),
      port: local ? 1025 : Number(this.config.get('SMTP_PORT') ?? 587),
      secure: !local && String(this.config.get('SMTP_SECURE')) === 'true',
      requireTLS: !local,
      ...(local || !user
        ? {}
        : {
            auth: {
              user,
              pass: this.config.getOrThrow<string>('SMTP_PASSWORD'),
            },
          }),
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const base =
      this.config.get<string>('PRIMAX_CONTROL_PUBLIC_URL') ??
      'http://localhost:3003';
    await transport.sendMail({
      from: this.config.getOrThrow<string>('SMTP_FROM'),
      to: email,
      subject: 'Primax Control: verifica tu correo',
      text: `Verifica tu correo para solicitar acceso a Primax Control: ${base}/#/verify?token=${encodeURIComponent(token)}\nEl enlace vence: ${expiresAt.toISOString()}`,
    });
  }
}
