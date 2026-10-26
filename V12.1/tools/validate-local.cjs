// Offline with respect to databases, Redis, payments and SMTP. No E2E suite runs.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (Number(process.versions.node.split('.')[0]) !== 22) throw Error('Run this validation with Node.js 22');
for (const relative of ['.env', 'Backend/.env'])
  if (fs.existsSync(path.join(root, relative))) throw Error('Validation refuses to load local secret files. Use a clean V12 checkout.');
const env = { ...process.env, APP_MODE: 'local', VERCEL: '',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/primax_offline?schema=public',
  DATABASE_URL_UNPOOLED: 'postgresql://test:test@127.0.0.1:5432/primax_offline?schema=public',
  PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1',
};
function run(component, args, extra = {}) {
  const result = spawnSync(process.execPath, args, { cwd: path.join(root, component), env: { ...env, ...extra }, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw Error(`Validation failed in ${component || 'V12'} (${result.status ?? 'process error'})`);
}
run('Backend', ['node_modules/prisma/build/index.js', 'validate']);
run('Backend', ['node_modules/prisma/build/index.js', 'generate']);
run('Backend', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json']);
run('Backend', ['scripts/copy-build-support.cjs']);
run('Backend', ['node_modules/jest/bin/jest.js', '--runInBand', '--no-cache', '--config', 'jest.config.cjs']);
run('Backend', ['--test', 'scripts/database-safety.test.cjs', 'scripts/seed-local-demo.test.mjs']);
for (const name of ['FrontEnd_1', 'FrontEnd_2']) {
  run(name, ['tools/build.cjs'], { NODE_ENV: 'development', PRIME_API_BASE_URL: '/api/v1', FUELFLOW_KIOSK_AUTH: 'false' });
  const tests = fs.readdirSync(path.join(root, name, 'tests')).filter(file => file.endsWith('.test.js')).map(file => 'tests/' + file);
  run(name, ['--test', ...tests], { NODE_ENV: 'development', PRIME_API_BASE_URL: '/api/v1' });
}
run('FrontEnd_1', ['tools/build.cjs'], { VERCEL: '1' });
run('FrontEnd_2', ['tools/build.cjs'], { VERCEL: '1', PRIME_API_BASE_URL: 'https://backend.example.invalid/api/v1' });
run('PrintAgent', ['--test', 'tests/contract.test.mjs', 'tests/release.test.mjs']);
console.log('PASS: safe Node 22 validation. No database, Redis, SMTP or provider calls were executed.');
