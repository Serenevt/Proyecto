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

// Channel boundary: replace this local demo adapter with a real mail provider.
// No phone field/provider exists in V10; SMS is deliberately not advertised.
@Injectable()
export class RecoveryDelivery {
  constructor(private readonly config: ConfigService) {}
  get mode(): string {
    return this.config.get<string>('PASSWORD_RESET_DELIVERY') ?? 'disabled';
  }
  async send(email: string, code: string, expiresAt: Date) {
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
