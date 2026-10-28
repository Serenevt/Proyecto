import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrinter} from '../src/js/printReceipt.js';
const receipt={id:'tx-1',text:'DEMO'};
test('double click shares a request, queries first and sends one job',async()=>{
 const calls=[];let release;const printer=createPrinter(async(url,options)=>{calls.push(options.method);if(options.method==='GET'){await new Promise(r=>release=r);return new Response('{}',{status:404});}return Response.json({id:"receipt-tx-1",status:'accepted',physicalConfirmed:false});});
 const a=printer(receipt),b=printer(receipt);assert.equal(a,b);release();assert.equal((await a).physicalConfirmed,false);assert.deepEqual(calls,['GET','POST']);
});
test('lost POST response reconciles accepted job on retry, without another POST',async()=>{
 let saved=false,posts=0;const printer=createPrinter(async(url,options)=>{if(options.method==='GET')return saved?Response.json({id:"receipt-tx-1",status:'accepted'}):new Response('{}',{status:404});saved=true;posts++;throw Error('lost reply');});
 await assert.rejects(printer(receipt),/desconocido/);await printer(receipt);assert.equal(posts,1);
});
test('unknown job is queried but never resent',async()=>{
 let posts=0;const printer=createPrinter(async(url,o)=>{if(o.method==='POST')posts++;return Response.json({id:"receipt-tx-1",status:'unknown'});});
 await assert.rejects(printer(receipt),/No se reenviar?/);await assert.rejects(printer(receipt));assert.equal(posts,0);
});
test('unavailable local agent never posts; safe preflight failure can be retried',async()=>{
 let posts=0;const unavailable=createPrinter(async()=>{throw Error('offline')});await assert.rejects(unavailable(receipt),/agente local/);
 const printer=createPrinter(async(url,o)=>{if(o.method==='GET')return Response.json({id:"receipt-tx-1",status:'retryable'});posts++;return Response.json({id:"receipt-tx-1",status:posts===1?'retryable':'accepted',error:'USB desconectado'});});await assert.rejects(printer(receipt),/USB/);await printer(receipt);assert.equal(posts,2);
});
