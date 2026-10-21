// The aggregate includes historical earnings; the S/100 fixture awards 11 points.
// Deterministic API fixture for visual regression tests; live API tested in tools/integration.spec.cjs.
exports.installApi=async context=>{
 let points=2450,redemptions=[],balance=0,movements=[],profile={dni:null,ruc:null,businessName:null};
 await context.route('**/api/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),body=req.postDataJSON();
  let status=200,data;
  if(url.pathname.endsWith('/auth/login')){
   if(body.email!=='demo@primaxprime.pe'||body.password!=='FixtureOnly123'){status=401;data={message:'Incorrecto'};}
   else data={accessToken:'fixture-jwt',expiresIn:3600,user:{id:'fixture-user',name:'Diego'}};
  }else if(url.pathname.endsWith('/memberships/me/profile')){profile={...profile,...body};data=profile;}
  else if(url.pathname.endsWith('/memberships/me'))data={...profile,user:{name:'Diego'},number:'PRIME-0001',status:'ACTIVE',points,vehicles:[{plate:'ABC-123',label:'Mi auto'},{plate:'DEF-456',label:'Auto familiar'}]};
  else if(url.pathname.endsWith('/wallet'))data={balance:String(balance),available:String(balance),reserved:'0.00',total:String(balance),movements};
  else if(url.pathname.endsWith('/recharges')){balance+=Number(body.amount);const movement={id:body.operationId,kind:'RECHARGE',amount:body.amount,createdAt:new Date().toISOString()};movements.unshift(movement);data={movement,balance:String(balance),replayed:false};}
  else if(url.pathname.endsWith('/transactions'))data=[{id:'fixture-tx',amount:'100.00',pointsEarned:11,createdAt:'2026-10-09T00:00:00Z',vehicle:{plate:'ABC-123'},station:{name:'Primax Sur'},status:'PAID'}];
  else if(url.pathname.endsWith('/rewards/redeem')){points-=400;const redemption={id:'fixture-coupon',benefit:{title:'Café'}};redemptions.push(redemption);status=201;data={redemption,replayed:false};}
  else if(url.pathname.endsWith('/rewards'))data=[{id:'fixture-reward',points:11,kind:'EARN',transactionId:'fixture-tx',createdAt:'2026-10-09T00:00:00Z'}];
  else if(url.pathname.endsWith('/redemptions'))data=redemptions;
  else if(url.pathname.endsWith('/benefits'))data=[{id:'fuel',code:'fuel',category:'COMBUSTIBLE',title:'Combustible',description:'Ahorro',pointsCost:500},{id:'coffee',code:'coffee',category:'TU PAUSA FAVORITA',title:'Café',description:'Un café',pointsCost:400}];
  else {status=404;data={message:'Missing fixture'};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
};
