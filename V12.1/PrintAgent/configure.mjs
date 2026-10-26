// One-time pairing. No print call, secret replacement or default-printer fallback.
import {parseArgs,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateConfig,verifyProbe} from './config.mjs';
const {values:v}=parseArgs({options:{printer:{type:'string'},origin:{type:'string',multiple:true},out:{type:'string'},'confirm-a6':{type:'boolean'}}});
if(v.printer!=='PeriPage A6(1)'||!v.origin?.length||!v.out||!v['confirm-a6'])throw Error('Uso: node configure.mjs --printer "PeriPage A6(1)" --origin http://localhost:26081 --origin http://127.0.0.1:26081 --out PrintAgent/config.http.local.json --confirm-a6');
const out=resolve(v.out);if(existsSync(out))throw Error('La configuración ya existe. No se sobrescribió; compara el probe y conserva su historial.');
const root=dirname(fileURLToPath(import.meta.url));
const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-File',join(root,'probe.ps1'),'-PrinterName',v.printer],{windowsHide:true,timeout:30000});
const p=JSON.parse(stdout.replace(/^\uFEFF/,'').trim());
const config={schemaVersion:2,transport:'http-loopback',agentHost:'127.0.0.1',agentPort:25443,dpi:203,origins:v.origin,printerName:p.printerName,driverName:p.driverName,portName:p.port,paperWidthHundredths:224,paperHeightHundredths:394,printableWidthMm:p.printableWidthMm,printableHeightMm:p.printableHeightMm,printableLeftMm:p.printableLeftMm,printableTopMm:p.printableTopMm,widthConfirmed:true,formatConfirmed:true,dataDirectory:'data-v11_1_1'};
const validated=validateConfig(config);verifyProbe(validated,p);
writeFileSync(out,JSON.stringify(validated,null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify({configuration:out,probe:p,physicalConfirmed:false},null,2));
