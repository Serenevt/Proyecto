// One-time pairing. No print call, secret replacement or default-printer fallback.
import {parseArgs,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateConfig,verifyProbe} from './config.mjs';
const {values:v}=parseArgs({options:{printer:{type:'string'},origin:{type:'string',multiple:true},key:{type:'string'},cert:{type:'string'},out:{type:'string'},'confirm-a6':{type:'boolean'}}});
if(!v.printer||!v.origin?.length||!v.key||!v.cert||!v.out||!v['confirm-a6'])throw Error('Uso: node configure.mjs --printer "PeriPage A6(1)" --origin http://localhost:24081 --key RUTA_PEM_EXISTENTE --cert RUTA_PEM_EXISTENTE --out NUEVA_CONFIG --confirm-a6');
const out=resolve(v.out);if(existsSync(out))throw Error('La configuración ya existe. No se sobrescribió; compara el probe y conserva su historial.');
for(const p of [v.key,v.cert])readFileSync(resolve(p));
const root=dirname(fileURLToPath(import.meta.url));
const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-File',join(root,'probe.ps1'),'-PrinterName',v.printer],{windowsHide:true,timeout:15000});
const p=JSON.parse(stdout.replace(/^\uFEFF/,'').trim());
const config={schemaVersion:2,origins:v.origin,printerName:p.printerName,driverName:p.driverName,portName:p.port,paperWidthHundredths:228,paperHeightHundredths:394,printableWidthMm:p.printableWidthMm,printableHeightMm:p.printableHeightMm,printableLeftMm:p.printableLeftMm,printableTopMm:p.printableTopMm,widthConfirmed:true,formatConfirmed:true,tlsKey:resolve(v.key),tlsCert:resolve(v.cert),dataDirectory:'data-v11_4'};
validateConfig(config);verifyProbe(config,p);
writeFileSync(out,JSON.stringify(config,null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify({configuration:out,probe:p,physicalConfirmed:false},null,2));
