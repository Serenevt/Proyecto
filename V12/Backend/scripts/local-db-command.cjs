const { spawnSync } = require('node:child_process');
const { assertLocalDatabase } = require('./database-safety.cjs');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const localEnv = resolve(__dirname, '../.env');
if (existsSync(localEnv)) process.loadEnvFile(localEnv);
try {
  assertLocalDatabase();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
process.env.DATABASE_URL_UNPOOLED ||= process.env.DATABASE_URL;
const args = process.argv.slice(2);
const command = args.shift();
const entries = {
  prisma: 'prisma/build/index.js',
  jest: 'jest/bin/jest.js',
  seed: 'ts-node/dist/bin.js',
};
if (!Object.hasOwn(entries, command))
  throw Error('Unsupported local database command');
const result = spawnSync(
  process.execPath,
  [require.resolve(entries[command]), ...args],
  {
    cwd: require('node:path').resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  },
);
process.exitCode = result.status ?? 1;
