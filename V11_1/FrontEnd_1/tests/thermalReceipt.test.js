import test from 'node:test';
import assert from 'node:assert/strict';
import {thermalReceipt} from '../src/js/thermalReceipt.js';
import {validateReceipt} from '../../PrintAgent/contract.mjs';
const transaction={id:'1234',createdAt:'2026-10-24T17:00:00Z',station:{name:'Primax Sur'},plate:'ABC-123',fuel:{name:'Premium'},gallons:'1.125',unitPrice:'20',originalAmount:'22.50',discountAmount:'2.50',amount:'20',receiptType:'FACTURA',receiptRuc:'20123456789',receiptBusinessName:'Nombre muy largo '.repeat(9).trim(),mode:'POSTPAGO',payment:{method:'SALDO_PRIME',status:'PARTIAL'},status:'PAYMENT_PENDING',debt:{amountPending:'10'}};
test('v2 invoice preserves exact confirmed data and validates full agent contract',()=>{
 const r=thermalReceipt(transaction);assert.deepEqual(validateReceipt(r),r);assert.equal(r.documentType,'FACTURA');assert.equal(r.dni,'');assert.equal(r.ruc,transaction.receiptRuc);assert.equal(r.businessName,transaction.receiptBusinessName);assert.equal(r.id,transaction.id);assert.equal(r.issuedAt,'2026-10-24T17:00:00.000Z');assert.equal(r.total,'20.00');assert.equal(r.discount,'2.50');assert.equal(r.gallons,'1.125');assert.equal(r.state,'Saldo pendiente');assert.equal(r.pending,'10.00');assert.equal(r.demo,true);
 assert.deepEqual(r,thermalReceipt(transaction));
});
test('boleta does not leak invoice identity or another operation',()=>{
 const r=thermalReceipt({...transaction,receiptType:'BOLETA',receiptDni:'70123456',status:'PAID',payment:{method:'YAPE',status:'CAPTURED'},debt:null});assert.equal(r.dni,'70123456');assert.equal(r.ruc,'');assert.equal(r.businessName,'');assert.equal(r.state,'Pagado');assert.equal(r.pending,'0.00');assert.deepEqual(validateReceipt(r),r);
});
for(const [key,value] of [['amount',null],['unitPrice',NaN],['gallons',undefined],['createdAt','invalid'],['receiptType','OTRO'],['amount','12.345'],['plate',null]])test('rejects missing/invalid '+key+' before network',()=>assert.throws(()=>thermalReceipt({...transaction,[key]:value})));
test('decimal amounts do not round through Number or appear as undefined/null/NaN',()=>{const r=thermalReceipt({...transaction,amount:'9999999999.99',originalAmount:'9999999999.99',discountAmount:'0',gallons:'0.001'});assert.equal(r.total,'9999999999.99');assert.equal(r.gallons,'0.001');assert(!JSON.stringify(r).match(/undefined|null|NaN/));});
