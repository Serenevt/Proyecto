const {spawn,execFileSync}=require('node:child_process');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),configPath=path.join(root,'PrintAgent/config.http.local.json');
async function main(){
 const config=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
 const child=spawn(process.execPath,[path.join(root,'PrintAgent/server.mjs'),configPath,'--diagnostic'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',c=>stderr+=c);
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Timeout del diagnóstico del agente.')),45000);
   child.once('error',e=>{clearTimeout(timer);reject(e)});
   child.once('exit',()=>{clearTimeout(timer);reject(Error(stderr||'El agente terminó antes de escuchar.'))});
   child.stdout.on('data',c=>{if(c.toString().includes('http://127.0.0.1:25443')){clearTimeout(timer);resolve();}});
  });
  const health=await new Promise((resolve,reject)=>{
   const req=http.request({hostname:'127.0.0.1',port:25443,path:'/health',method:'GET',headers:{Host:'127.0.0.1:25443',Origin:config.origins[0],'Content-Type':'application/json','X-FuelFlow-Print':'1'}},res=>{
    let raw='';res.on('data',c=>raw+=c);res.on('end',()=>res.statusCode===200?resolve(JSON.parse(raw)):reject(Error('HTTP '+res.statusCode)));
   });req.setTimeout(5000,()=>req.destroy(Error('Timeout HTTP')));req.on('error',reject);req.end();
  });
  if(health.transport!=='http-loopback'||!health.diagnosticOnly)throw Error('No se confirmó el modo diagnóstico HTTP.');
  const sockets=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','@(Get-NetTCPConnection -LocalPort 25443 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess) | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true}));
  const listeners=Array.isArray(sockets)?sockets:[sockets];
  if(!listeners.length||listeners.some(s=>s.LocalAddress!=='127.0.0.1'||s.OwningProcess!==child.pid))throw Error('No se pudo confirmar un listener exclusivo de loopback.');
  const result={timestamp:new Date().toISOString(),health,listeners,certificateAccess:false,certificateStoreChanges:0,printJobRequests:0,physicalPrints:0};
  const out=path.join(root,'docs/v11_1_1/http-local');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'print-diagnostic.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
