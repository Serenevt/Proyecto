import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentState} from '../js/services/paymentState.js';
for(const status of ['PAYMENT_PENDING','PENDING','PARTIAL','REJECTED','ERROR','UNKNOWN'])test(`${status} is never paid`,()=>{
  assert.equal(paymentState({status}).paid,false);
});
for(const status of ['PAID','CAPTURED'])test(`${status} is paid without outstanding debt`,()=>{
  assert.equal(paymentState({status}).label,'Pagado');
  assert.equal(paymentState({status,pendingBalance:5}).paid,false);
  assert.equal(paymentState({status,payment:{status:'PARTIAL'}}).label,'Saldo pendiente');
  assert.equal(paymentState({status,payment:{status:'UNKNOWN'}}).paid,false);
});
