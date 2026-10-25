import https from 'node:https';
import {readFileSync, writeFileSync, unlinkSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {JobStore} from './store.mjs';
import {handler} from './routes.mjs';
import {validateConfig,verifyProbe} from './config.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const configPath=resolve(process.argv[2] || join(root,'config.local.json'));
const config=validateConfig(JSON.parse(readFileSync(configPath,'utf8').replace(/^\uFEFF/,'')));
// Fail installation checks before accepting jobs. This never prints.
try {
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-File',join(root,'probe.ps1'),'-PrinterName',config.printerName],{timeout:15000,windowsHide:true});
  const probe=JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  verifyProbe(config,probe);
} catch(error) { throw Error('No se pudo validar la instalación A6 (permisos de cola/ejecución PowerShell, driver y ancho). '+error.message); }
const data=resolve(dirname(configPath),config.dataDirectory || 'data-v11_4');
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
const store=new JobStore(data,adapter);
const server=https.createServer({key:readFileSync(resolve(dirname(configPath),config.tlsKey)),cert:readFileSync(resolve(dirname(configPath),config.tlsCert)),minVersion:'TLSv1.2'},handler(config,store));
server.requestTimeout=25000;
server.headersTimeout=10000;
// Bind first: a second agent cannot open the same port or submit to this store.
server.listen(24443,'127.0.0.1',()=>console.log('FuelFlow print agent: https://localhost:24443 (solo loopback)'));
