import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {handler,isJsonContentType} from '../routes.mjs';
import {thermalReceipt} from '../../FrontEnd_1/src/js/thermalReceipt.js';
test('health GET only requires the authorized Origin/Host; jobs keep the protocol marker and UTF-8 JSON',async t=>{
 let submissions=0;const store={get:()=>null,submit:async(id)=>{submissions++;return {id,status:'accepted'};}};
 const server=http.createServer(handler({origins:['http://localhost:26081']},store));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const request=(method,url,headers={},body)=>new Promise((resolve,reject)=>{const q=http.request({hostname:'127.0.0.1',port:server.address().port,path:url,method,headers:{Host:'127.0.0.1:25443',Origin:'http://localhost:26081',...headers},agent:false},r=>{let raw='';r.on('data',c=>raw+=c);r.on('end',()=>resolve({status:r.statusCode,data:raw?JSON.parse(raw):null}));});q.on('error',reject);q.end(body?JSON.stringify(body):undefined);});
 assert.equal((await request('GET','/health')).status,200);
 assert.equal((await request('GET','/health',{Origin:'null'})).status,403);
 assert.equal((await request('GET','/health',{Host:'localhost:25443'})).status,403);
 assert.equal((await request('GET','/health',{'Sec-Fetch-Mode':'navigate'})).data.code,'FETCH_MODE');
 assert.equal((await request('GET','/health',{'Content-Type':'application/json; charset=utf-8'})).status,200);
 assert.equal((await request('GET','/jobs/receipt-header-test')).data.code,'PRINT_MARKER_REQUIRED');
 assert.equal((await request('GET','/jobs/receipt-header-test',{'X-FuelFlow-Print':'1'})).status,404);
 const receipt=thermalReceipt({id:'header-test',createdAt:'2026-10-25T15:00:00Z',station:{name:'DEMO'},plate:'DEMO-001',fuel:{name:'DEMO'},gallons:'1',unitPrice:'10',amount:'10',receiptType:'BOLETA',receiptDni:'00000000',mode:'PREPAGO',status:'PAYMENT_PENDING',payment:{method:'PRUEBA',status:'PENDING'}});
 assert.equal((await request('POST','/jobs/receipt-header-test',{'Content-Type':'application/json'},receipt)).data.code,'PRINT_MARKER_REQUIRED');
 assert.equal((await request('POST','/jobs/receipt-header-test',{'X-FuelFlow-Print':'1'},receipt)).data.code,'JSON_CONTENT_TYPE_REQUIRED');
 assert.equal(submissions,0);
 assert.equal((await request('POST','/jobs/receipt-header-test',{'X-FuelFlow-Print':'1','Content-Type':'application/json; charset=utf-8'},receipt)).status,200);assert.equal(submissions,1);
 assert.equal((await request('OPTIONS','/jobs/receipt-header-test',{'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'x-fuelflow-print'})).status,204);
 assert.equal((await request('OPTIONS','/jobs/receipt-header-test',{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'x-fuelflow-print'})).status,403);
});
test('media type parser permits JSON UTF-8 without admitting other types or encodings',()=>{
 for(const value of ['application/json','application/json; charset=utf-8','Application/JSON; Charset="UTF-8"'])assert(isJsonContentType(value));
 for(const value of [undefined,'text/plain','application/jsonp','application/json; charset=iso-8859-1','application/json; extra=1'])assert(!isJsonContentType(value));
});
