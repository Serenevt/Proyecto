// Read-only verification after migrations and integration tests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const directory=path.resolve(root,process.argv[2]);
const before=JSON.parse(fs.readFileSync(path.join(directory,'before.json'),'utf8'));
let checked=0;
for(const [table,rows] of Object.entries(before)) {
  if(['_prisma_migrations','MembershipNumberCounter'].includes(table))continue;
  const input=`SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public."${table.replaceAll('"','""')}" t`;
  const current=JSON.parse(execFileSync('docker',['compose','exec','-T','postgres','psql','-X','-v','ON_ERROR_STOP=1','-U','primax','-d','primax_v10','-At'],{cwd:root,input,encoding:'utf8',stdio:['pipe','pipe','pipe']}));
  for(const original of rows) {
    const row=current.find(r=>r.id===original.id);assert(row,`Missing ${table} row`);
    const expected={...original};
    if(table==='Membership'&&['PRIM004','PRIM005'].includes(original.number))expected.dni=null;
    const actual=Object.fromEntries(Object.keys(original).map(k=>[k,row[k]]));
    // Avoid printing account data or credential hashes on a failed assertion.
    assert.equal(JSON.stringify(actual)===JSON.stringify(expected),true,`Historical ${table} row changed: ${original.id}`);
    checked++;
  }
  if(table==='Membership')assert.equal(current.find(m=>m.number==='PRIME-0001').dni,'12345678');
}
fs.writeFileSync(path.join(directory,'post-regression-verification.json'),JSON.stringify({historicalRowsChecked:checked,noHistoricalRowsDeleted:true,onlyAuthorizedDniChanges:true,principalDemoUnchanged:true,migrationAddedFieldsExcluded:true,counterAndMigrationHistoryExcluded:true},null,2));
console.log('PASS:',checked,'historical rows preserved; only authorized DNI changes; PRIME-0001 unchanged.');
