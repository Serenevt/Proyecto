const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const [variable,value,error] of [['FRONTEND1_PORT','25081','Puertos inesperados'],['BACKEND_UPSTREAM','http://localhost:25000','Backend de esta copia'],['PAYMENT_ENV','production','pagos, correo u OCR externos'],['POSTGRES_DB','primax_v11_1','base distinta']]){
 test('startup refuses inherited '+variable+' without starting containers',()=>{
  const r=spawnSync(process.execPath,['tools/start-v11_1_1.cjs','--check'],{cwd:root,env:{...process.env,[variable]:value},encoding:'utf8',windowsHide:true});
  assert.equal(r.status,1);assert(r.stderr.includes(error),r.stderr);
 });
}
test('explicit project name isolates the copy from ambient COMPOSE_PROJECT_NAME',()=>{
 const r=spawnSync(process.execPath,['tools/start-v11_1_1.cjs','--check'],{cwd:root,env:{...process.env,COMPOSE_PROJECT_NAME:'primax-v11-1'},encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,r.stderr);assert(r.stdout.includes('V11_1.1'));
});
