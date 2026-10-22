import { ConfigService } from '@nestjs/config';
import { createDecipheriv, createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { RecoveryDelivery } from './recovery-delivery';
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));
describe('Private demo recovery delivery', () => {
  beforeEach(() => jest.clearAllMocks());
  it('disabled mode writes nothing and never simulates an external provider', async () => {
    await new RecoveryDelivery(
      new ConfigService({ PASSWORD_RESET_DELIVERY: 'disabled' }),
    ).send('test@example.test', '12345678', new Date());
    expect(writeFile).not.toHaveBeenCalled();
  });
  it('demo stores an encrypted restricted mailbox without plaintext email/code', async () => {
    const secret = 'local-test-key'.repeat(4),
      email = 'private@example.test',
      code = '87654321',
      expiresAt = new Date(Date.now() + 60000);
    await new RecoveryDelivery(
      new ConfigService({
        PASSWORD_RESET_DELIVERY: 'demo',
        JWT_SECRET: secret,
      }),
    ).send(email, code, expiresAt);
    expect(mkdir).toHaveBeenCalledWith('/tmp/prime-reset-demo', {
      recursive: true,
      mode: 0o700,
    });
    const [path, content, options] = (writeFile as jest.Mock).mock.calls[0];
    expect(path).not.toContain(email);
    expect(content).not.toContain(email);
    expect(content).not.toContain(code);
    expect(options).toEqual({ mode: 0o600 });
    const record = JSON.parse(content);
    const key = createHmac('sha256', secret)
      .update('v10-demo-mailbox-encryption')
      .digest();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(record.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    expect(
      JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(record.data, 'base64')),
          decipher.final(),
        ]).toString(),
      ),
    ).toEqual({ email, code, expiresAt: expiresAt.toISOString() });
  });
});
