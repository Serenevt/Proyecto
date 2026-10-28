import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { customerIdentity } from '../src/js/customerIdentity.js';
import { renderAlerts } from '../src/js/adminService.js';
test('identity uses the User name returned by Backend rather than Membership number', () => {
  assert.equal(customerIdentity('ABC-123', {name:'Diego',number:'PRIM001'}),'ABC-123 · Diego');
  assert.equal(customerIdentity('XYZ-123', {name:'María',number:'PRIM002'}),'XYZ-123 · María');
});
test('vehicle without Membership shows No afiliado', () => {
  assert.equal(customerIdentity('ABC-123',null),'ABC-123 · No afiliado');
});
test('dashboard has no hardcoded business alerts or simulated totals', () => {
  const source=readFileSync(new URL('../src/js/script.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/ALERTAS_EJEMPLO|TRANSACCIONES_EJEMPLO|alerta_[123]|ventasBase|transBase/);
  assert.match(source,/adminService.alerts\(\)/);
});
test('empty dashboard renders no pending alerts; resolved history remains visible', () => {
  const node=()=>({children:[],textContent:'',append(x){this.children.push(x)},replaceChildren(){this.children=[]}});
  globalThis.document={createElement:node};const ul=node();renderAlerts(ul,[],()=>{});
  assert.equal(ul.children[0].textContent,'No hay alertas pendientes');
  renderAlerts(ul,[{id:'one',status:'RESOLVED',description:'Saldo pendiente',plate:'ABC-123',userName:'Diego',occurredAt:new Date(),expectedPlates:[],amountPending:'1.00',operationId:'operation'}],()=>{});
  assert.equal(ul.children.length,2);assert.match(ul.children[1].textContent,/Revisada/);
});
test('review button passes the real alert id and renders untrusted names as text', async () => {
  const node=()=>({children:[],textContent:'',append(x){this.children.push(x)},replaceChildren(){this.children=[]}});
  globalThis.document={createElement:node};const ul=node();let resolved;
  renderAlerts(ul,[{id:'real-id',status:'OPEN',description:'Saldo pendiente',plate:'ABC-123',userName:'<img>',occurredAt:new Date(),expectedPlates:[],operationId:'operation'}],id=>{resolved=id});
  ul.children[0].children[0].onclick();assert.equal(resolved,'real-id');assert.match(ul.children[0].textContent,/<img>/);assert.equal(ul.children[0].innerHTML,undefined);
});
