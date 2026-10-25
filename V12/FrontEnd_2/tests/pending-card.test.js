import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {views} from '../js/views.js';
import {memberService,vehicleService,transactionService,benefitsService} from '../js/services/index.js';
test('one backend debt summary with separate recharge access',t=>{
 let pendingBalance=30;
 t.mock.method(memberService,'get',()=>({name:'Cliente',points:0,available:75,number:'PRIME',pendingBalance}));
 t.mock.method(memberService,'progress',()=>0);t.mock.method(vehicleService,'list',()=>[]);t.mock.method(benefitsService,'list',()=>[]);
 t.mock.method(transactionService,'list',()=>[{id:'tx-1',station:'Primax Sur',pendingBalance:30}]);
 let html=views.inicio();assert.equal(html.match(/SALDO PENDIENTE/g).length,1);assert(!html.includes('data-online-debt'));assert(html.includes('Recarga tu saldo para regularizar tus consumos pendientes.'));assert(html.includes('data-recharge'));assert(html.includes('75.00'));assert(html.includes('30.00'));
 pendingBalance=12;html=views.inicio();assert(html.includes('12.00'));
 pendingBalance=0;html=views.inicio();assert(!html.includes('SALDO PENDIENTE'));assert(html.includes('75.00'));
 assert(!readFileSync(new URL('../js/app.js',import.meta.url),'utf8').includes('PAGO PENDIENTE FUELFLOW'));
});
