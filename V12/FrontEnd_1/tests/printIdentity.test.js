import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrinter} from '../src/js/printReceipt.js';
import {isLocalPrintOrigin} from '../src/js/printReceipt.js';

for(const reply of [{status:'accepted'},{id:'receipt-other',status:'accepted'},{id:'receipt-sale',status:'queued'}]) {
  test('does not finish from an unconfirmed agent identity: '+JSON.stringify(reply),async()=>{
    let posts=0;
    const printer=createPrinter(async(url,options)=>{assert(url.startsWith('http://127.0.0.1:25443/'));if(options.method==='POST')posts++;return Response.json(reply);});
    await assert.rejects(printer({id:'sale'}),/identificador y estado/);assert.equal(posts,0);
  });
}
test('invalid transaction ID fails before contacting localhost',async()=>{
  let calls=0;const printer=createPrinter(async()=>calls++);
  for(const id of ['',undefined,'../other','sale?x=1'])await assert.rejects(printer({id}),/Identificador/);
  assert.equal(calls,0);
});
test('malformed reply retains the same ID and never submits blindly',async()=>{
  let calls=0;const printer=createPrinter(async()=>{calls++;return new Response('<html>proxy error</html>');});
  await assert.rejects(printer({id:'sale'}),/Respuesta inválida/);await assert.rejects(printer({id:'sale'}));assert.equal(calls,2);
});
for(const origin of ['https://fuel.example','http://192.168.1.2:26081','null','file://','http://localhost.evil:26081'])test('HTTP printing refuses nonlocal page '+origin,async()=>{
 let calls=0;const printer=createPrinter(async()=>{calls++;},origin);await assert.rejects(printer({id:'sale'}),/localhost o 127/);assert.equal(calls,0);
});
test('both exact local web origins are supported',()=>{assert(isLocalPrintOrigin('http://localhost:26081'));assert(isLocalPrintOrigin('http://127.0.0.1:26081'));});
