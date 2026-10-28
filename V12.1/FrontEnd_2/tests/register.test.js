import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {authService} from '../js/services/authService.js';
import {SESSION_KEY} from '../js/services/session.js';
const {validateApiUrl}=createRequire(import.meta.url)('../tools/api-url.cjs');
function storage(){const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};return values;}
test('registro comparte sesión JWT con login, sin persistir contraseña',async()=>{
  const values=storage();globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/v1/auth/register');assert.equal(options.headers.Authorization,undefined);assert.equal(JSON.parse(options.body).name,'Nueva');return Response.json({accessToken:'token',expiresIn:3600,user:{id:'new',name:'Nueva'}});};
  await authService.register({name:'Nueva',email:'new@example.test',password:'RegistrationTest123!'});assert(authService.isAuthenticated());assert(!values.get(SESSION_KEY).includes('RegistrationTest123!'));
});
test('registro fallido no crea usuario ni sesión local',async()=>{storage();globalThis.fetch=async()=>Response.json({message:'Duplicado'},{status:409});await assert.rejects(authService.register({}),/Duplicado/);assert.equal(authService.isAuthenticated(),false);});
test('URL Android rechaza localhost, credenciales y rutas incorrectas',()=>{for(const url of ['/api/v1','http://localhost:3000/api/v1','http://127.0.0.1/api/v1','https://user:secret@api.example.com/api/v1','https://api.example.com/','https://api.example.com/api/v1?key=secret'])assert.throws(()=>validateApiUrl(url,true));});
test('URL configurable acepta API compartida LAN y HTTPS sin secretos',()=>{assert.equal(validateApiUrl('/api/v1'),'/api/v1');assert.equal(validateApiUrl('http://192.0.2.1:3000/api/v1',true),'http://192.0.2.1:3000/api/v1');assert.equal(validateApiUrl('https://api.example.com/api/v1/',true),'https://api.example.com/api/v1');});
