// Local operator-only demo mailbox reader. Never expose this through HTTP.
const { Buffer } = require('node:buffer');
const { createHash, createHmac, createDecipheriv } = require('node:crypto');
const { readFileSync, unlinkSync } = require('node:fs');
if (process.env.PASSWORD_RESET_DELIVERY !== 'demo')
  throw Error('Demo recovery is disabled');
const email = (process.argv[2] || '').trim().toLowerCase();
if (!email.includes('@'))
  throw Error('Usage: node scripts/read-reset-demo.cjs email');
const file =
  '/tmp/prime-reset-demo/' +
  createHash('sha256').update(email).digest('hex') +
  '.json';
try {
  const record = JSON.parse(readFileSync(file, 'utf8'));
  const key = createHmac('sha256', process.env.JWT_SECRET)
    .update('v10-demo-mailbox-encryption')
    .digest();
  const cipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(record.iv, 'base64'),
  );
  cipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  const message = JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(record.data, 'base64')),
      cipher.final(),
    ]).toString(),
  );
  if (Date.parse(message.expiresAt) <= Date.now()) {
    unlinkSync(file);
    throw Error('Expired');
  }
  console.log(
    JSON.stringify({
      demo: true,
      channel: 'local-email-simulation',
      ...message,
    }),
  );
} catch {
  console.error('No valid demo message available');
  process.exitCode = 1;
}
