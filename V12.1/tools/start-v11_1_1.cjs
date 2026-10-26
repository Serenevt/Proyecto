// Only this release's Compose file/project/volume; never managed DB overrides.
const {execFileSync,spawnSync}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const args=['compose','--project-name','primax-v11-1-1','--file',path.join(root,'compose.yaml')];
function inspect(){
 const c=JSON.parse(execFileSync('docker',[...args,'config','--format','json'],{cwd:root,encoding:'utf8',windowsHide:true}));
 if(c.name!=='primax-v11-1-1'||c.volumes.postgres_data.name!=='primax-v11-1-1_postgres_data'||c.volumes.postgres_data.external)throw Error('Almacenamiento no aislado. No se inició ningún servicio.');
 for(const name of ['backend','migrate','seed']){
  const u=new URL(c.services[name].environment.DATABASE_URL);
  if(u.hostname!=='postgres'||u.port!=='5432'||u.pathname!=='/primax_v11_1_1')throw Error('Se rechazó una base distinta a primax_v11_1_1 interna.');
  const e=c.services[name].environment;
  if(e.APP_MODE!=='local'||e.PAYMENT_ENV!=='demo'||String(e.DEMO_WALLET_ENABLED)!=='true'||e.PASSWORD_RESET_DELIVERY!=='mailpit'||e.SMTP_HOST!=='mailpit'||e.PLATE_RECOGNITION_URL!=='http://plate-recognition:8000')throw Error('El iniciador local rechaza pagos, correo u OCR externos. Revisa las variables heredadas.');
 }
 for(const name of ['frontend1','frontend2'])if(c.services[name].environment.BACKEND_UPSTREAM!=='http://backend:3000')throw Error('El frontend debe conectarse al Backend de esta copia.');
 const expected={frontend1:26081,frontend2:26082,backend:26000,mailpit:26025};
 for(const [name,port] of Object.entries(expected)){
  const ports=c.services[name].ports;
  if(ports.length!==1||ports[0].host_ip!=='127.0.0.1'||Number(ports[0].published)!==port)throw Error('Puertos inesperados en '+name+'. Revisa variables de entorno; no se inició nada.');
 }
 if(c.services.postgres.ports?.length||c.services.postgres.volumes.some(v=>v.type!=='volume'||v.source!=='postgres_data'))throw Error('PostgreSQL debe usar solo el volumen privado sin publicar puertos.');
 return expected;
}
async function available(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error('Puerto '+port+' ocupado. No se detuvo el servicio que lo usa.')));s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
(async()=>{
 const ports=inspect();console.log('V11_1.1: proyecto, base y volumen propios; puertos locales '+Object.values(ports).join(', '));
 if(process.argv.includes('--check'))return;
 if(process.argv.includes('--stop')){const r=spawnSync('docker',[...args,'stop'],{cwd:root,stdio:'inherit',windowsHide:true});process.exitCode=r.status??1;return;}
 const status=execFileSync('docker',[...args,'ps','--format','json'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
 const running=!status?[]:status.startsWith('[')?JSON.parse(status):status.split(/\r?\n/).map(line=>JSON.parse(line));
 for(const [service,port] of Object.entries(ports)){
  const own=running.some(c=>c.Project==='primax-v11-1-1'&&c.Service===service&&c.State==='running'&&c.Publishers?.some(p=>p.URL==='127.0.0.1'&&p.Protocol==='tcp'&&p.PublishedPort===port));
  if(!own)await available(port);
 }
 const result=spawnSync('docker',[...args,'up','-d',...(process.argv.includes('--rebuild')?['--build']:[])],{cwd:root,stdio:'inherit',windowsHide:true});process.exitCode=result.status??1;
 if(!process.exitCode)console.log('FuelFlow http://localhost:26081/src/index.html | Prime http://localhost:26082 | Backend http://localhost:26000/api/v1/health. PrintAgent se inicia por separado.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
