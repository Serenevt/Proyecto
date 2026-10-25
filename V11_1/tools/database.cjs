// Test-only Prisma bridge: database stays private, even during host browser tests.
const {execFileSync} = require('node:child_process');
const path = require('node:path');
function query(model, method, args) {
  const script = `const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',async()=>{try{const q=JSON.parse(input);const value=q.model==='$bcrypt'?await require('bcryptjs').compare(...q.args):await db[q.model][q.method](q.args);console.log(JSON.stringify(value));}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.$disconnect();}});`;
  return JSON.parse(execFileSync('docker',['compose','-p','primax-v11-2','exec','-T','backend','node','-e',script],{cwd:path.resolve(__dirname,'..'),input:JSON.stringify({model,method,args}),encoding:'utf8',stdio:['pipe','pipe','pipe']}));
}
class PrismaClient {
  constructor(){return new Proxy(this,{get:(target,model)=>model==='$disconnect'?async()=>{}:new Proxy({},{get:(_,method)=>async args=>query(model,method,args)})});}
}
module.exports={PrismaClient,compare:async(...args)=>query('$bcrypt','compare',args)};
