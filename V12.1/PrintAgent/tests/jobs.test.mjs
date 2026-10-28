import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const testRoot=fileURLToPath(new URL('../test-results/',import.meta.url));mkdirSync(testRoot,{recursive:true});
import {join} from 'node:path';
import http from 'node:http';
import {JobStore} from '../store.mjs';
import {handler} from '../routes.mjs';
import {thermalReceipt} from '../../FrontEnd_1/src/js/thermalReceipt.js';
const receipt=thermalReceipt({id:'test-1',createdAt:'2026-10-24T17:00:00Z',station:{name:'Primax Sur'},plate:'ABC-123',fuel:{name:'Premium'},gallons:'1',unitPrice:'20',amount:'20',receiptType:'BOLETA',receiptDni:'70123456',mode:'PREPAGO',status:'PAID',payment:{method:'YAPE',status:'CAPTURED'}});
function store(t,adapter) {const dir=mkdtempSync(join(testRoot,'fuelflow-print-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return new JobStore(dir,adapter);}
test('concurrent clicks, replay and process restart send only once',async t=>{
  let calls=0,release;
  const s=store(t,async()=>{calls++;await new Promise(r=>release=r);return {status:'accepted'};});
  const first=s.submit('receipt-test-1',receipt),second=s.submit('receipt-test-1',receipt);
  assert.equal(first,second);release();await first;await s.submit('receipt-test-1',receipt);
  const restarted=new JobStore(s.directory,()=>{calls++;});
  const result=await restarted.submit('receipt-test-1',receipt);
  assert.equal(calls,1);assert.equal(result.status,'accepted');assert.equal(result.physicalConfirmed,false);
  assert.throws(()=>s.submit('receipt-test-1',{...receipt,text:'changed'}),/otro contenido/);
});
test('unknown adapter result and crash are never automatically resent',async t=>{
  let calls=0;const s=store(t,async()=>{calls++;throw Error('lost reply');});
  assert.equal((await s.submit('receipt-test-1',receipt)).status,'unknown');
  await new JobStore(s.directory,()=>{calls++;}).submit('receipt-test-1',receipt);assert.equal(calls,1);
});
test('disconnected printer safe preflight failure permits retry with the same id',async t=>{
  let calls=0;const s=store(t,async()=>++calls===1?{status:'retryable',error:'USB disconnected'}:{status:'accepted'});
  assert.equal((await s.submit('receipt-test-1',receipt)).status,'retryable');
  assert.equal((await s.submit('receipt-test-1',receipt)).status,'accepted');assert.equal(calls,2);
});
test('API restricts origins, host, headers, paths and payload; reconciles same job',async t=>{
  let calls=0;const s=store(t,async()=>{calls++;return {status:'accepted'};});
  const server=http.createServer(handler({origins:['http://localhost:26081']},s));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const url='http://127.0.0.1:'+server.address().port+'/jobs/receipt-test-1';
  const headers={Host:'127.0.0.1:25443',Origin:'http://localhost:26081','Content-Type':'application/json','X-FuelFlow-Print':'1'};
  const request=(method,body,h=headers)=>new Promise((resolve,reject)=>{
    const req=http.request(url,{method,headers:h},res=>{
      let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:new Headers(res.headers),json:async()=>JSON.parse(text)}));
    });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
  });
  assert.equal((await request('POST',receipt,{...headers,Origin:'https://evil.example'})).status,403);
  assert.equal((await request('POST',receipt,{...headers,Host:'evil.example'})).status,403);
  assert.equal((await request('POST',receipt,{...headers,'X-FuelFlow-Print':''})).status,403);
  assert.equal((await request('GET')).status,404);
  const preflight=await request('OPTIONS',undefined,{...headers,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-fuelflow-print'});assert.equal(preflight.headers.get('access-control-allow-origin'),'http://localhost:26081');
  assert.equal((await request('POST',{...receipt,id:'different'})).status,400);
  assert.equal((await request('POST',{...receipt,text:'x'.repeat(18000)})).status,413);
  await request('POST',receipt);await request('POST',receipt);
  assert.equal((await (await request('GET')).json()).status,'accepted');assert.equal(calls,1);
});

test('diagnostic server blocks all job access without creating a store',async t=>{
  const server=http.createServer(handler({origins:['http://localhost:26081'],diagnosticOnly:true},null));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const request=method=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/jobs/receipt-test-1',method,headers:{Host:'127.0.0.1:25443',Origin:'http://localhost:26081','Content-Type':'application/json','X-FuelFlow-Print':'1'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();
  });
  assert.equal(await request('GET'),503);assert.equal(await request('POST'),503);
});
