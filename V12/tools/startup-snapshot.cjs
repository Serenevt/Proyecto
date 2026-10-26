require('./local-targets.cjs').assertLocalTargets();
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PrismaClient}=require('./database.cjs');
async function main(){
  const db=new PrismaClient(), snapshot={};
  for(const model of ['user','membership','vehicle','station','fuel','benefit','transaction','payment','rewardMovement','walletMovement']){
    snapshot[model]=await db[model].findMany({orderBy:{id:'asc'}});
  }
  const file=path.join(__dirname,'evidence/startup-snapshot.json');
  if(process.argv.includes('--before')){
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(snapshot));
  } else assert.deepEqual(snapshot,JSON.parse(fs.readFileSync(file)));
  assert.equal(snapshot.user.filter(x=>x.email==='demo@primaxprime.pe').length,1);
  assert.equal(snapshot.membership.filter(x=>x.number==='PRIME-0001').length,1);
  assert.equal(snapshot.vehicle.filter(x=>x.plate==='ABC-123').length,1);
  console.log('PASS: startup data snapshot; one demo user, membership and vehicle; counts:',JSON.stringify(Object.fromEntries(Object.entries(snapshot).map(([k,v])=>[k,v.length]))));
}
main().catch(e=>{console.error(e.code==='ERR_ASSERTION'?'Startup snapshot mismatch':e.message);process.exitCode=1;});
