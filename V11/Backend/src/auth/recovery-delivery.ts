import { createTransport } from 'nodemailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// SMTP for real delivery and Mailpit; legacy encrypted demo adapter retained for compatibility.
// No phone field/provider exists in V10; SMS is deliberately not advertised.
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
    if (this.mode !== 'demo') return;
    const directory = '/tmp/prime-reset-demo';
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const key = createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_SECRET'),
    )
      .update('v10-demo-mailbox-encryption')
      .digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify({ email, code, expiresAt }), 'utf8'),
      cipher.final(),
    ]);
    const name = createHash('sha256').update(email).digest('hex') + '.json';
    await writeFile(
      join(directory, name),
      JSON.stringify({
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: encrypted.toString('base64'),
      }),
      { mode: 0o600 },
    );
  }
}
