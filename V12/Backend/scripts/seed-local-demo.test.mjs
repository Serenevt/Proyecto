import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {URL} from 'node:url';
for(const env of [{APP_MODE:'production',PAYMENT_ENV:'production',DEMO_WALLET_ENABLED:'false'},{APP_MODE:'local',PAYMENT_ENV:'demo',DEMO_WALLET_ENABLED:'false'}])test('publication seed skipped outside explicitly enabled local DEMO '+JSON.stringify(env),()=>{const r=spawnSync(process.execPath,['scripts/seed-local-demo.cjs'],{cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...process.env,...env}});assert.equal(r.status,0);assert.match(r.stdout,/skipped/)});
test('publication never resynchronizes passwords on automatic startup',()=>{const r=spawnSync(process.execPath,['scripts/seed-local-demo.cjs'],{cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...process.env,APP_MODE:'local',PAYMENT_ENV:'demo',DEMO_WALLET_ENABLED:'true',RESYNC_DEMO_PASSWORD:'1'}});assert.notEqual(r.status,0);assert.match(r.stderr,/never resynchronizes/)});
