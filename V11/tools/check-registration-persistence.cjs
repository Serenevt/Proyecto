const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PrismaClient}=require('./database.cjs');
require('./test-env.cjs');
const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'evidence/registration.json')));
const snapshotFile=path.join(__dirname,'evidence/registration-persistence.json');
async function main(){
  const db=new PrismaClient();
  try{
    const user=await db.user.findUniqueOrThrow({where:{id:evidence.userId},select:{id:true,email:true,membership:{include:{vehicles:true,transactions:{select:{id:true,amount:true,status:true,pointsEarned:true}}}}}});
    assert.equal(user.membership.id,evidence.membershipId);assert(user.membership.vehicles.some(v=>v.plate===evidence.plate));assert(user.membership.transactions.some(t=>t.id===evidence.transactionId));
    const snapshot=JSON.parse(JSON.stringify(user));
    if(process.argv.includes('--before'))fs.writeFileSync(snapshotFile,JSON.stringify(snapshot,null,2));
    else assert.deepEqual(snapshot,JSON.parse(fs.readFileSync(snapshotFile)));
    const base='http://localhost:'+(process.env.PORT||10000)+'/api/v1';
    const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:evidence.email,password:'RegistrationTest123!'})});
    assert.equal(login.status,200);const session=await login.json();assert.equal(session.user.id,evidence.userId);assert(!JSON.stringify(session).includes('password'));
    const response=await fetch(base+'/memberships/me',{headers:{Authorization:'Bearer '+session.accessToken}});assert.equal(response.status,200);const profile=await response.json();assert.equal(profile.number,evidence.number);assert.equal(profile.points,evidence.points);
    console.log(process.argv.includes('--before')?'PASS: pre-restart snapshot and login':'PASS: User, Membership, fiscal profile, Vehicle, Transaction and points unchanged after container restart; fresh JWT login works');
  }finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
