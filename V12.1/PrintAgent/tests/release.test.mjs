import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateConfig,verifyProbe} from '../config.mjs';

const config={schemaVersion:2,transport:'http-loopback',agentHost:'127.0.0.1',agentPort:25443,dpi:203,origins:['http://localhost:26081'],printerName:'PeriPage A6(1)',driverName:'PeriPage A6',portName:'USB001',paperWidthHundredths:224,paperHeightHundredths:394,widthConfirmed:true,formatConfirmed:true,printableWidthMm:51.926,printableHeightMm:100.099,printableLeftMm:5.005,printableTopMm:0,dataDirectory:'data-v12_1'};
const probe={printerName:config.printerName,driverName:config.driverName,port:config.portName,status:'Normal',dpiX:203,dpiY:203,paperWidthMm:56.896,paperHeightMm:100.076,printableWidthMm:config.printableWidthMm,printableHeightMm:config.printableHeightMm,printableLeftMm:config.printableLeftMm,printableTopMm:0};
test('accepts measured nominal 57 × 100 mm geometry at 203 DPI',()=>{validateConfig(config);verifyProbe(config,probe);});
for(const change of [{agentPort:24443},{agentHost:'0.0.0.0'},{agentHost:'localhost'},{transport:'https'},{transport:undefined},{printerName:'PeriPage A6(2)'},{origins:['*']},{origins:['http://192.168.1.2:26081']},{origins:['https://fuel.example']},{origins:['http://localhost:26081/']},{origins:['http://user:pass@127.0.0.1:26081']},{dpi:304},{dataDirectory:'../data-v11_4'},{dataDirectory:'data-v11_1_1'},{paperWidthHundredths:228}])test('rejects previous release or unsafe configuration '+JSON.stringify(change),()=>assert.throws(()=>validateConfig({...config,...change})));
for(const change of [{dpiX:304},{dpiY:200},{dpiX:undefined},{paperWidthMm:57.912},{paperWidthMm:undefined},{paperHeightMm:NaN},{status:'Offline'}])test('rejects unconfirmed printer '+JSON.stringify(change),()=>assert.throws(()=>verifyProbe(config,{...probe,...change})));
test('frontend and agent use the same isolated loopback HTTP port',()=>{
  const source=readFileSync(new URL('../../FrontEnd_1/src/js/printReceipt.js',import.meta.url),'utf8');
  assert(source.includes("PRINT_AGENT_URL='http://127.0.0.1:25443'"));assert(!source.includes('localhost:24443'));
});
