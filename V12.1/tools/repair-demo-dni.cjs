require('./local-targets.cjs').assertLocalTargets();
// One-time, explicitly authorized repair of two identified synthetic fixtures.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sql = input => execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'primax', '-d', 'primax_v10', '-At'], {cwd:root,input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
function snapshot() {
  const tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split('\n');
  return Object.fromEntries(tables.map(table => [table, JSON.parse(sql(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM public."${table.replaceAll('"','""')}" t`))]));
}
const before = snapshot();
const ids = ['5c1d5152-681e-4ac0-b73c-8e5d1f93ff5b','1c779f3e-f157-4e04-9bac-9133990de726'];
const emails = ['82d7bc41-29b5-4ca0-8ec0-9b8f8d7bece1@example.test','register-cd9aaecb-4662-4926-b615-5c2462396f47@example.test'];
ids.forEach((id,i) => {
  const member=before.Membership.find(m=>m.id===id);
  assert.equal(member.number,['PRIM004','PRIM005'][i]);
  assert.equal(member.dni,'12345678');
  assert.equal(before.User.find(u=>u.id===member.userId).email,emails[i]);
});
assert.equal(before.Membership.find(m=>m.number==='PRIME-0001').dni,'12345678');
const directory=path.join(__dirname,'evidence','dni-repair-'+Date.now());
fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'before.json'),JSON.stringify(before,null,2),{flag:'wx'});
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'before.json'),'utf8')),before);
if(!process.argv.includes('--apply')) throw Error('Backup saved; --apply required');
sql(`BEGIN;
DO $$ DECLARE changed integer; BEGIN
 UPDATE public."Membership" m SET dni=NULL FROM public."User" u
 WHERE m."userId"=u.id AND m.dni='12345678' AND (
 (m.id='${ids[0]}' AND m.number='PRIM004' AND u.email='${emails[0]}') OR
 (m.id='${ids[1]}' AND m.number='PRIM005' AND u.email='${emails[1]}'));
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 2 THEN RAISE EXCEPTION 'Expected exactly two synthetic records'; END IF;
END $$;
COMMIT;`);
const after=snapshot();
fs.writeFileSync(path.join(directory,'after.json'),JSON.stringify(after,null,2));
const expected=structuredClone(before);
for(const id of ids) expected.Membership.find(m=>m.id===id).dni=null;
const canonical=value=>JSON.stringify(Object.fromEntries(Object.entries(value).map(([k,rows])=>[k,rows.map(r=>JSON.stringify(r)).sort()])));
assert.equal(canonical(after),canonical(expected));
fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify({changed:ids,fields:['dni'],value:null,allOtherPublicDataUnchanged:true,principalDemoUnchanged:true},null,2));
console.log('PASS: exactly two DNI fields changed to null; all other public data and PRIME-0001 unchanged. Evidence:',path.relative(root,directory));
