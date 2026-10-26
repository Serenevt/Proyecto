// Exercise the documented read-only SQL and optional loopback DBeaver binding.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const cwd=path.resolve(__dirname,'..');
const docker=(args,input)=>execFileSync('docker',args,{cwd,input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
async function main(){
  const compose=['compose','-f','compose.yaml','-f','compose.database-local.yaml'];
  try{
    docker([...compose,'up','-d','--wait','postgres']);
    const config=JSON.parse(docker([...compose,'config','--format','json']));
    const db=config.services.postgres,port=db.ports[0];
    assert.equal(port.host_ip,'127.0.0.1');
    await new Promise((resolve,reject)=>{const socket=net.connect(Number(port.published),'127.0.0.1',()=>{socket.end();resolve()});socket.setTimeout(5000,()=>{socket.destroy();reject(Error('Connection timed out'))});socket.on('error',reject)});
    const sql=fs.readFileSync(path.join(cwd,'docs/DATABASE-ACCESS.md'),'utf8').split('```sql\n')[1].split('```')[0];
    docker([...compose,'exec','-T','postgres','psql','-U',db.environment.POSTGRES_USER,'-d',db.environment.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-q','-o','/dev/null'],sql);
    console.log('PASS: documented SQL and loopback PostgreSQL access; no query data printed.');
  }finally{
    docker(['compose','up','-d','--wait','postgres']);
    const id=docker(['compose','ps','-q','postgres']).trim();
    const container=JSON.parse(docker(['inspect',id]))[0];
    assert.equal(container.NetworkSettings.Ports['5432/tcp'],null);
    console.log('Restored PostgreSQL with no published ports.');
  }
}
main().catch(()=>{console.error('Database access check failed; inspect local service health.');process.exitCode=1});
