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
    if (this.mode === 'smtp') {
      const user = this.config.get<string>('SMTP_USER');
      const transport = createTransport({
        host: this.config.getOrThrow<string>('SMTP_HOST'),
        port: Number(this.config.get('SMTP_PORT') ?? 587),
        secure: String(this.config.get('SMTP_SECURE')) === 'true',
        requireTLS: true,
        ...(!user
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
      throw new Error('Use SMTP; fake mailboxes are disabled');
  }

  async sendAdminVerification(email: string, token: string, expiresAt: Date) {
    if (this.mode !== 'smtp')
      throw new Error('Email verification requires configured SMTP delivery');
    const user = this.config.get<string>('SMTP_USER');
    const transport = createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT') ?? 587),
      secure: String(this.config.get('SMTP_SECURE')) === 'true',
      requireTLS: true,
      ...(!user
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
