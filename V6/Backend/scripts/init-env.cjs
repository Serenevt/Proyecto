// Requires only the Node runtime included in the Docker image. Never prints secrets.
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  const secret = () => randomBytes(32).toString('hex');
  const template = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  fs.writeFileSync(
    envPath,
    template
      .replace('REPLACE_WITH_LOCAL_PASSWORD', secret())
      .replace('REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS', secret())
      .replace(
        'REPLACE_WITH_RANDOM_TERMINAL_KEY_AT_LEAST_32_CHARACTERS',
        secret(),
      ),
    { mode: 0o600, flag: 'wx' },
  );
}
const values = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const backendPath = path.join(root, 'Backend/.env');
if (!fs.existsSync(backendPath)) {
  const url = `postgresql://${encodeURIComponent(values.POSTGRES_USER)}:${encodeURIComponent(values.POSTGRES_PASSWORD)}@localhost:${values.POSTGRES_PORT}/${values.POSTGRES_DB}?schema=public`;
  const entries = [
    'JWT_SECRET',
    'KIOSK_API_KEY',
    'PORT',
    'POINTS_PER_SOL',
    'CORS_ORIGINS',
    'DEMO_PASSWORD',
  ];
  fs.writeFileSync(
    backendPath,
    `DATABASE_URL=${url}\n` +
      entries.map((key) => `${key}=${values[key]}`).join('\n') +
      '\n',
    { mode: 0o600, flag: 'wx' },
  );
}
console.log('V6/.env and Backend/.env ready; existing files preserved.');
