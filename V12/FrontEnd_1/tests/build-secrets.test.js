import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('Vercel static build enables operator login without copying private server configuration', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const canaries = Object.fromEntries(['KIOSK_API_KEY', 'KIOSK_GATEWAY_SECRET', 'KIOSK_OPERATOR_PASSWORD_HASH', 'KIOSK_REDIS_REST_TOKEN', 'DATABASE_URL'].map(name => [name, 'fictional-build-canary-' + name]));
  execFileSync(process.execPath, ['tools/build.cjs'], { cwd: root, env: { ...process.env, ...canaries, VERCEL: '1' }, stdio: 'pipe' });
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.(?:js|html|json|css)$/.test(file)) {
        const value = readFileSync(file, 'utf8');
        for (const canary of Object.values(canaries)) assert(!value.includes(canary), 'Private configuration in static artifact');
      }
    }
  }
  scan(path.join(root, 'dist'));
  assert(!existsSync(path.join(root, 'dist/server')));
  assert(!existsSync(path.join(root, 'dist/api')));
  assert(readFileSync(path.join(root, 'dist/src/js/runtime-config.js'), 'utf8').includes('true'));
});
