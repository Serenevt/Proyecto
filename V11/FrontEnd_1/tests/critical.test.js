import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createTransactionsService} from '../src/js/transactionsService.js';
import {paymentState} from '../src/js/paymentState.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
for (const [status,kind] of [[401,'authentication'],[403,'authentication'],[503,'unavailable'],[undefined,'timeout'],[404,'discard']]) {
  test(`recovery ${status ?? 'timeout'} preserves UUID and classifies failure`,async()=>{
    const disk=storage();
    let fails=true;
    const authorizations={status:async()=>{if(fails)throw Object.assign(Error('failure'),{status,kind:'timeout'});return {status:'DISPENSING'};}};
    let sent;
    let service=createTransactionsService({storage:disk,uuid:()=> 'stable-id',authorizations,request:async(_path,{body})=>{sent=body;return {transaction:{id:'tx'}};}});
    service.prepare({authorizationId:'auth',mode:'PREPAGO',amount:'80'},{});
    const before=service.current();
    const result=await service.reconcile();
    assert.equal(result.action,status===404?'discard':'blocked');
    if(status!==404)assert.equal(result.kind,kind);
    assert.deepEqual(service.current(),before);
    fails=false;
    assert.equal((await service.reconcile()).action,'retry');
    await service.submit();assert.equal(sent.operationId,'stable-id');
  });
}
test('prepayment single flight and lost response retain identical request and operationId',async()=>{
  const disk=storage();let calls=0;let resolve;const requests=[];
  const approved={authorization:{id:'auth',status:'RESERVED',unitPrice:'20.00'}};
  const auth={reserve:body=>{calls++;requests.push(body);return calls===1 ? new Promise(r=>{resolve=r;}) : Promise.resolve(approved);}};
  const svc=createTransactionsService({storage:disk,uuid:()=> 'stable',authorizations:auth});
  const first=svc.authorize({mode:'PREPAGO',amount:'80'},{});
  const second=svc.authorize({mode:'PREPAGO',amount:'80'},{});
  assert.equal(calls,1);
  assert.equal(svc.current().authorization,undefined);
  resolve(approved);
  assert.deepEqual(await first,await second);
  await svc.authorize({},{});assert.equal(calls,2);
  const restored=createTransactionsService({storage:disk,authorizations:auth});
  assert.equal((await restored.authorize({},{})).authorization.id,'auth');
  assert.equal(calls,3);
  assert.equal(requests[0].operationId,'stable');
});
test('cached approval cannot authorize while Backend is unavailable',async()=>{
  const disk=storage();
  const good=createTransactionsService({storage:disk,authorizations:{reserve:async()=>({authorization:{id:'auth',status:'RESERVED',unitPrice:'20.00'}})}});
  await good.authorize({mode:'PREPAGO'},{});
  const restored=createTransactionsService({storage:disk,authorizations:{reserve:async()=>{throw Object.assign(Error('unavailable'),{status:503});}}});
  await assert.rejects(restored.authorize({},{}),/unavailable/);
});
for(const status of ['PENDING','REJECTED','ERROR'])test(`frontend cannot authorize from ${status}`,async()=>{
  const svc=createTransactionsService({storage:storage(),authorizations:{reserve:async()=>({authorization:{status}})}});
  await assert.rejects(svc.authorize({mode:'PREPAGO'},{}),/no autorizó/);
  assert.equal(svc.current().authorization,undefined);
});
test('intervention survives reload and blocks authorization, submit and finish',async()=>{
  const disk=storage();const svc=createTransactionsService({storage:disk});
  svc.prepare({amount:'80'},{});svc.requireIntervention('critical',{total:80});
  const restored=createTransactionsService({storage:disk});
  assert.equal(restored.current().snapshot.total,80);
  await assert.rejects(restored.submit(),/intervención/);
  await assert.rejects(restored.authorize({},{}),/intervención/);
  assert.throws(()=>restored.finish(),/revisión/);
});
const source=readFileSync(new URL('../src/js/script.js',import.meta.url),'utf8');
test('critical dispatch failure stops timer and preserves reached state for intervention',()=>{
  let stopped, saved, persisted, message;
  const context={state:{autorizacionId:'auth',total:80,galones:4,despachoTimer:99},clearInterval:id=>{stopped=id;},marcarEstadoOperacion:s=>{context.state.estadoOperacion=s;},transactionsService:{requireIntervention:(_reason,snapshot)=>{saved=snapshot;}},authorizationService:{intervention:async id=>{persisted=id;}},mostrarModal:title=>{message=title;}};
  vm.runInNewContext(source.slice(source.indexOf('function requerirIntervencion('),source.indexOf('function pintarDespacho('))+"\nrequerirIntervencion(Error('503'));",context);
  assert.equal(stopped,99);assert.equal(saved.total,80);assert.equal(saved.galones,4);
  assert.equal(saved.estadoOperacion,'INTERVENTION_REQUIRED');assert.equal(persisted,'auth');
  assert.match(message,/intervención/);
});
test('audit timer scenario: no Backend response means no dispatch',async()=>{
  let resolve;let dispatched=false;
  const context={state:{},$:()=>({}),t:x=>x,mostrarPantalla(){},mostrarModal:(_a,_b,_c,fn)=>fn?.(),simularDespacho:()=>{dispatched=true;},ejecutarReserva:()=>new Promise(r=>{resolve=r;})};
  const script=source.slice(source.indexOf('let paymentInFlight'),source.indexOf('// ---------- Aviso de consumo'));
  vm.runInNewContext(script+'\nglobalThis.pending = procesarPago();',context);
  assert.equal(dispatched,false);assert.equal(context.state.pagoAutorizado,undefined);
  resolve();await context.pending;
  assert.equal(dispatched,true);
});
for(const status of ['PAYMENT_PENDING','PARTIAL','PAID','CAPTURED'])test(`ticket and local history reflect ${status}`,()=>{
  const elements=new Map();let record;
  const context={paymentState,state:{tipoComprobante:'BOLETA',placa:'ABC-123',combustible:{nombre:'Regular',precio:20},galones:4,modalidad:'POSTPAGO',montoPostpago:80,idioma:'es'},backendResult:{transaction:{id:'tx',status,amount:'80'},pointsEarned:80},calcularTotales:()=>({subtotal:80,descuento:0,total:80}),$:id=>{if(!elements.has(id))elements.set(id,{classList:{toggle(){}}});return elements.get(id);},t:x=>x,LOCALE_IDIOMA:{es:'es-PE'},guardarTransaccion:r=>{record=r;},refrescarAdmin(){},mostrarPantalla(){},hablar(){},actualizarEstado(){}};
  vm.runInNewContext(source.slice(source.indexOf('function pintarResumen()'),source.indexOf('function generarComprobante()'))+'\npintarResumen();',context);
  const label=paymentState({status}).label;
  assert.equal(record.estado,label);assert.ok(elements.get('t-estado').textContent.startsWith(label));
});
