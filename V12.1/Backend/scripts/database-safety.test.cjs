const test = require('node:test');
const assert = require('node:assert/strict');
const { assertLocalDatabase } = require('./database-safety.cjs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('local HTTP tools reject a remote browser API target', () => {
  const { assertLocalTargets } = require('../../tools/local-targets.cjs');
  assert.throws(() => assertLocalTargets({ PRIME_API_BASE_URL: 'https://remote.example/api/v1' }), /blocked/);
  assert.doesNotThrow(() => assertLocalTargets({ API_URL: 'http://127.0.0.1:3000' }));
});
test('direct E2E setup and CLI wrappers stop before remote database tools load', () => {
  const root = path.resolve(__dirname, '..');
  const env = {
    ...process.env,
    DATABASE_URL: 'postgresql://test:test@example.neon.tech/demo',
    DATABASE_URL_UNPOOLED: '',
  };
  for (const args of [
    ['scripts/local-db-command.cjs', 'prisma', 'migrate', 'deploy'],
    ['test/local-database.setup.cjs'],
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      env,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Remote database access is blocked/);
    assert(!result.stderr.includes(env.DATABASE_URL));
  }
});
test('rejects remote targets even when the test schema is temporary', () => {
  for (const host of [
    'example.neon.tech',
    'localhost.evil.example',
    '192.0.2.1',
  ])
    assert.throws(
      () =>
        assertLocalDatabase({
          DATABASE_URL: `postgresql://test:test@${host}/demo?schema=e2e_test`,
        }),
      /blocked/,
    );
});
test('checks the direct CLI connection as well', () => {
  assert.throws(
    () =>
      assertLocalDatabase({
        DATABASE_URL: 'postgresql://localhost/demo',
        DATABASE_URL_UNPOOLED: 'postgresql://example.neon.tech/demo',
      }),
    /blocked/,
  );
});
test('permits explicit local and Docker development targets', () => {
  assertLocalDatabase({ DATABASE_URL: 'postgresql://127.0.0.1/demo' });
  assertLocalDatabase({
    DATABASE_URL: 'postgresql://postgres/demo',
    APP_MODE: 'local',
  });
  assert.throws(() =>
    assertLocalDatabase({ DATABASE_URL: 'postgresql://postgres/demo' }),
  );
});
