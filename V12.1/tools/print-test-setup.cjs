const {spawn}=require('node:child_process');
const path=require('node:path');
module.exports=async()=>{
  const url='http://localhost:24381/healthz';
  const exists=await fetch(url,{signal:AbortSignal.timeout(500)}).then(()=>true,()=>false);
  if(exists)throw Error('El puerto de pruebas 24381 ya está ocupado.');
  const child=spawn(process.execPath,[path.join(__dirname,'serve.cjs')],{cwd:path.resolve(__dirname,'..'),env:{...process.env,FRONTEND:'1',FRONTEND_PORT:'24381'},stdio:'ignore',windowsHide:true});
  let error;child.on('error',e=>error=e);
  try {
    for(let i=0;i<100;i++){
      if(error)throw error;
      if(child.exitCode!==null)throw Error('El servidor de pruebas no arrancó.');
      if(await fetch(url,{signal:AbortSignal.timeout(200)}).then(r=>r.ok,()=>false))return async()=>{child.kill();};
      await new Promise(r=>setTimeout(r,50));
    }
    throw Error('Timeout al iniciar servidor de pruebas.');
  }catch(e){child.kill();throw e;}
};
