import http from 'node:http';
import {readFileSync, writeFileSync, unlinkSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {JobStore} from './store.mjs';
import {handler} from './routes.mjs';
import {validateConfig,verifyProbe} from './config.mjs';
import {AGENT_HOST,AGENT_URL} from './transport.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const configPath=resolve(process.argv[2] || join(root,'config.http.local.json'));
const config=validateConfig(JSON.parse(readFileSync(configPath,'utf8').replace(/^\uFEFF/,'')));
// Fail installation checks before accepting jobs. This never prints.
try {
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-File',join(root,'probe.ps1'),'-PrinterName',config.printerName],{timeout:30000,windowsHide:true});
  const probe=JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  verifyProbe(config,probe);
} catch(error) { throw Error('No se pudo validar la instalación A6 (permisos de cola/ejecución PowerShell, driver y ancho). '+error.message); }
const data=resolve(dirname(configPath),config.dataDirectory || 'data-v11_1_1');
function adapter(job) {
  return new Promise((resolveJob)=>{
    const input=join(data,job.id+'.input.json');
    writeFileSync(input,JSON.stringify({config,job}),{mode:0o600});
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',join(root,'print.ps1'),'-InputPath',input],{timeout:60000,windowsHide:true,maxBuffer:20000},(error,stdout)=>{
      try { unlinkSync(input); } catch {}
      try { resolveJob(JSON.parse(stdout.trim())); } catch { resolveJob({status:'unknown',error:'El adaptador no confirmó el envío; revisar la cola de Windows.'}); }
    });
  });
}
const diagnosticOnly=process.argv.includes('--diagnostic');
const store=diagnosticOnly?null:new JobStore(data,adapter);
const server=http.createServer(handler({...config,diagnosticOnly},store));
server.requestTimeout=25000;
server.headersTimeout=10000;
server.keepAliveTimeout=5000;
server.maxConnections=32;
// Bind first: a second agent cannot open the same port or submit to this store.
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'El puerto 25443 ya está ocupado. No se inició un segundo agente.' : error.message); process.exitCode=1; });
server.listen(config.agentPort,AGENT_HOST,()=>console.log('FuelFlow V11_1.1 print agent: '+AGENT_URL+(diagnosticOnly?' (diagnóstico: envío de trabajos bloqueado)':' (solo loopback; ninguna impresión de prueba)')));
