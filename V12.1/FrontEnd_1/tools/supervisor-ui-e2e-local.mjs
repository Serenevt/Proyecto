// Local HTTP exercise of Control provisioning and the FuelFlow Supervisor console paths.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../.env', import.meta.url), 'utf8').split(/\r?\n/).filter(x => x.includes('=') && !x.startsWith('#')).map(x => { const i=x.indexOf('='); return [x.slice(0,i),x.slice(i+1).replace(/^'|'$/g,'')]; }));
const fuel = 'http://127.0.0.1:26081', control = 'http://127.0.0.1:26083';
const cookies = new Map(); let csrf = '';
function save(response) { for (const entry of response.headers.getSetCookie()) { const pair = entry.split(';')[0]; const i=pair.indexOf('='); cookies.set(pair.slice(0,i),pair.slice(i+1)); } }
async function call(origin, path, method='GET', body, headers={}) {
  const response=await fetch(origin+path,{method,headers:{...(origin===fuel?{'X-FuelFlow-Request':'1','Sec-Fetch-Site':'same-origin','Cookie':[...cookies].map(([k,v])=>k+'='+v).join('; '),'X-CSRF-Token':csrf}:{}),...headers,...(method==='POST'?{'Content-Type':'application/json',Origin:origin}:{})},...(method==='POST'?{body:JSON.stringify(body??{})}:{})});
  save(response); const raw=await response.text(); return {status:response.status,value:raw?JSON.parse(raw):null};
}
function ok(result,status,label){assert.equal(result.status,status,label+': '+JSON.stringify(result.value));return result.value;}
const admin=ok(await call(control,'/api/v1/control/login','POST',{email:env.DEMO_CONTROL_ADMIN_EMAIL,password:env.DEMO_CONTROL_ADMIN_PASSWORD}),200,'Control login');
const adminCookie=[...cookies].find(([key])=>key==='primax_control');assert.ok(adminCookie);
const session=ok(await call(control,'/api/v1/control/session','GET',undefined,{Cookie:adminCookie.join('=')}),200,'Control session');
const station=session.stations.find(item=>item.code==='PRIMAX-SUR');assert.ok(station);
const email='supervisor-'+randomUUID().slice(0,8)+'@primax.local', password='Demo-'+randomBytes(16).toString('base64url');
const created=ok(await call(control,'/api/v1/control/supervisors','POST',{name:'Supervisor de prueba local',email,password,stationIds:[station.id]},{Cookie:adminCookie.join('=')}),201,'Create Supervisor');
assert.equal(created.email,email);
const human=ok(await call(fuel,'/supervisor-api/login','POST',{identifier:email,password}),200,'Supervisor login');
const bearer={Authorization:'Bearer '+human.accessToken};
const stations=ok(await call(fuel,'/supervisor-api/supervisor/me/stations','GET',undefined,bearer),200,'Supervisor stations');assert.equal(stations[0].stationId,station.id);
const terminals=ok(await call(fuel,'/supervisor-api/supervisor/stations/'+station.id+'/terminals','GET',undefined,bearer),200,'Terminals');const terminal=terminals.find(row=>row.code==='PRIMAX-SUR-T01');assert.ok(terminal);
const shift=ok(await call(fuel,'/supervisor-api/supervisor/shifts','POST',{stationId:station.id},bearer),201,'Open shift');
ok(await call(fuel,'/supervisor-api/supervisor/terminals/'+terminal.id+'/enable','POST',{shiftId:shift.id},bearer),201,'Enable');
const pre=ok(await call(fuel,'/api/kiosk/session'),200,'Technical pre-session');csrf=pre.csrfToken;
const boot=ok(await call(fuel,'/api/supervisor/bootstrap','POST',{},bearer),201,'Supervisor bootstrap');csrf=boot.csrfToken;assert.equal(boot.authenticated,true);
const pair=ok(await call(fuel,'/api/v1/supervisor/terminals/'+terminal.id+'/pair','POST',{},bearer),201,'Pair');assert.equal(pair.paired,true);assert.equal(pair.token,undefined);
const me=ok(await call(fuel,'/api/v1/terminal/me'),200,'Technical status');assert.equal(me.prepared,true);
const operationId=randomUUID();csrf=cookies.get('primax-terminal-csrf-local');
ok(await call(fuel,'/api/v1/terminal/operations','POST',{operationId}),201,'INICIAR operation');
ok(await call(fuel,'/supervisor-api/supervisor/shifts/'+shift.id+'/close','POST',{},bearer),201,'Close shift');
assert.equal((await call(fuel,'/api/v1/terminal/operations','POST',{operationId:randomUUID()})).status,409);
ok(await call(fuel,'/api/v1/terminal/operations/'+operationId+'/close','POST',{}),201,'Close active operation');
csrf=boot.csrfToken;
ok(await call(fuel,'/api/v1/supervisor/terminals/'+terminal.id+'/revoke-session','POST',{},bearer),201,'Revoke technical cookie');
console.log(JSON.stringify({result:'passed',supervisorId:created.id,operationId,station:station.code}));
