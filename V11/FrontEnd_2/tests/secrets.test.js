import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
test('web build does not copy SMTP/server secrets even when present in the build environment', () => {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const secrets={SMTP_PASSWORD:'SMTP_CANARY_ONLY_8f2a90',SMTP_USER:'SMTP_USER_CANARY_761e',JWT_SECRET:'JWT_CANARY_ONLY_88ef',KIOSK_SECRET:'KIOSK_CANARY_ONLY_f91a',POSTGRES_PASSWORD:'PG_CANARY_ONLY_a49e'};
  execFileSync(process.execPath,['tools/build.cjs'],{cwd:root,env:{...process.env,...secrets,PRIME_API_BASE_URL:'/api/v1'},stdio:'pipe'});
  function scan(directory){for(const item of readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,item.name);if(item.isDirectory()){scan(file);continue;}
    const content=readFileSync(file);
    for(const secret of Object.values(secrets)) assert.equal(content.includes(secret),false,'Server secret in '+file);
  }}
  scan(path.join(root,'www'));
  assert.doesNotMatch(readFileSync(path.join(root,'www/js/config.js'),'utf8'),/Prime123|SMTP_PASSWORD|SMTP_USER/);
});
