import test from 'node:test';
import assert from 'node:assert/strict';
import {authService} from '../js/services/authService.js';

function storage() {
  const values=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}});
  return values;
}
test('login correcto persiste solo la sesión de la cuenta Diego',()=>{
  const values=storage();
  assert.equal(authService.isAuthenticated(),false);
  assert.deepEqual(authService.login('demo@primaxprime.pe','Prime123'),{name:'Diego',email:'demo@primaxprime.pe'});
  assert.equal(values.get('prime_authenticated'),'true');
  assert.equal(values.size,1);
  assert.equal(authService.isAuthenticated(),true);
});
test('credenciales incorrectas y variaciones no permiten acceso',()=>{
  storage();
  for(const [email,password] of [['otro@primaxprime.pe','Prime123'],['demo@primaxprime.pe','incorrecta'],['demo@primaxprime.pe','prime123'],['demo@primaxprime.pe','Prime123 '],['Demo@primaxprime.pe','Prime123'],['','']])assert.throws(()=>authService.login(email,password),/correo o la contraseña/);
  assert.equal(authService.isAuthenticated(),false);
});
test('solo true constituye una sesión válida y logout conserva otros datos',()=>{
  const values=storage();
  values.set('primax-prime:v1','datos demo intactos');
  for(const invalid of ['false','1','TRUE','{}']){values.set('prime_authenticated',invalid);assert.equal(authService.isAuthenticated(),false);}
  values.set('prime_authenticated','true');
  assert.equal(authService.isAuthenticated(),true);
  authService.logout();
  assert.equal(authService.isAuthenticated(),false);
  assert.equal(values.get('primax-prime:v1'),'datos demo intactos');
  assert.equal(values.size,1);
});
test('almacenamiento bloqueado muestra un error y no permite acceso',()=>{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('bloqueado');}});
  assert.equal(authService.isAuthenticated(),false);
  assert.throws(()=>authService.login('demo@primaxprime.pe','Prime123'),/guardar tu sesión/);
  assert.throws(()=>authService.logout(),/cerrar tu sesión/);
  delete globalThis.localStorage;
});
