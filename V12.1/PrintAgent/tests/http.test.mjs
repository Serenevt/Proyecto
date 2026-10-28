import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {handler} from '../routes.mjs';
import {JobStore} from '../store.mjs';
import {thermalReceipt} from '../../FrontEnd_1/src/js/thermalReceipt.js';

test('real HTTP loopback: restrictive CORS, host, methods, headers, health and stable jobs',async t=>{
 const parent=fileURLToPath(new URL('../test-results/',import.meta.url));mkdirSync(parent,{recursive:true});
 const dir=mkdtempSync(join(parent,'http-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let sends=0;const store=new JobStore(dir,async()=>{sends++;return {status:'accepted'};});
 const server=http.createServer(handler({origins:['http://localhost:26081']},store));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 assert.equal(server.address().address,'127.0.0.1');
 const base={Host:'127.0.0.1:25443',Origin:'http://localhost:26081','X-FuelFlow-Print':'1','Content-Type':'application/json'};
 const request=(method,path,body,extra={},raw)=>new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,headers:raw||{...base,...extra},agent:false},res=>{
   let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({code:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null}));
  });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
 });
 const health=await request('GET','/health');assert.equal(health.body.transport,'http-loopback');assert.equal(health.body.printerName,'PeriPage A6(1)');assert.equal(sends,0);
 for(const extra of [{Host:'localhost:25443'},{Host:'0.0.0.0:25443'},{Host:'evil.test:25443'},{Origin:'http://localhost:25081'},{Origin:'https://fuel.example'},{Origin:'http://192.168.1.2:26081'},{Origin:'null'},{Origin:''},{'X-FuelFlow-Print':''},{'Content-Type':'text/plain'},{'sec-fetch-mode':'navigate'}]){
  const r=await request('POST','/jobs/receipt-http-test',{},extra);assert.equal(r.code,403,JSON.stringify(extra));
  if(extra.Origin!==undefined)assert.equal(r.headers['access-control-allow-origin'],undefined);
 }
 for(const method of ['PUT','DELETE','PATCH','HEAD'])assert.equal((await request(method,'/health')).code,405);
 assert.equal((await request('POST','/health',{})).code,405);
 assert.equal((await request('GET','/jobs/../health')).code,404);
 const options={'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-fuelflow-print','Access-Control-Request-Private-Network':'true'};
 const preflight=await request('OPTIONS','/jobs/receipt-http-test',null,options);assert.equal(preflight.code,204);assert.equal(preflight.headers['access-control-allow-origin'],base.Origin);assert.equal(preflight.headers['access-control-allow-credentials'],undefined);assert.equal(preflight.headers['access-control-allow-private-network'],'true');
 for(const change of [{'Access-Control-Request-Method':'DELETE'},{'Access-Control-Request-Headers':'authorization'},{'Access-Control-Request-Headers':'content-type'},{'Access-Control-Request-Headers':'content-type,x-fuelflow-print,x-fuelflow-print'}])assert.equal((await request('OPTIONS','/jobs/receipt-http-test',null,{...options,...change})).code,403);
 const duplicate=Object.entries(base).flatMap(([k,v])=>[k,v]).concat(['Origin',base.Origin]);assert.equal((await request('GET','/health',null,{},duplicate)).code,403);
 const receipt=thermalReceipt({id:'http-test',createdAt:'2026-10-24T17:00:00Z',station:{name:'Estación DEMO'},plate:'ABC-123',fuel:{name:'Premium'},gallons:'1',unitPrice:'20',amount:'20',mode:'PREPAGO',receiptType:'BOLETA',receiptDni:'70123456',status:'PAID',payment:{method:'YAPE',status:'CAPTURED'}});
 const route='/jobs/receipt-http-test';assert.equal((await request('GET',route)).code,404);
 for(let i=0;i<2;i++)assert.equal((await request('POST',route,receipt)).body.status,'accepted');
 assert.equal(sends,1);assert.equal((await request('POST',route,{...receipt,total:'21.00'})).code,409);
 assert.equal((await request('POST',route,{...receipt,text:'x'.repeat(17000)})).code,413);
 const status=await request('GET',route);assert.equal(status.body.id,'receipt-http-test');assert.equal(status.body.physicalConfirmed,false);assert.equal(status.body.receipt,undefined);
});
