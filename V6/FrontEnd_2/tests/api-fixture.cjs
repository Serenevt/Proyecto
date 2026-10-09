// Deterministic API fixture for visual regression tests; live API tested in tools/integration.spec.cjs.
exports.installApi=async context=>{
 let points=2450,redemptions=[];
 await context.route('**/api/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),body=req.postDataJSON();
  let status=200,data;
  if(url.pathname.endsWith('/auth/login')){
   if(body.email!=='demo@primaxprime.pe'||body.password!=='FixtureOnly123'){status=401;data={message:'Incorrecto'};}
   else data={accessToken:'fixture-jwt',expiresIn:3600,user:{id:'fixture-user',name:'Diego'}};
  }else if(url.pathname.endsWith('/memberships/me'))data={user:{name:'Diego'},number:'PRIME-0001',status:'ACTIVE',points,vehicles:[{plate:'ABC-123',label:'Mi auto'},{plate:'DEF-456',label:'Auto familiar'}]};
  else if(url.pathname.endsWith('/transactions'))data=[{id:'fixture-tx',amount:'100.00',pointsEarned:100,createdAt:'2026-10-09T00:00:00Z',vehicle:{plate:'ABC-123'},station:{name:'Primax Sur'},status:'PAID'}];
  else if(url.pathname.endsWith('/rewards/redeem')){points-=400;const redemption={id:'fixture-coupon',benefit:{title:'Café'}};redemptions.push(redemption);status=201;data={redemption,replayed:false};}
  else if(url.pathname.endsWith('/rewards'))data=[{id:'fixture-reward',points:100,kind:'EARN',transactionId:'fixture-tx',createdAt:'2026-10-09T00:00:00Z'}];
  else if(url.pathname.endsWith('/redemptions'))data=redemptions;
  else if(url.pathname.endsWith('/benefits'))data=[{id:'fuel',code:'fuel',category:'COMBUSTIBLE',title:'Combustible',description:'Ahorro',pointsCost:500},{id:'coffee',code:'coffee',category:'TU PAUSA FAVORITA',title:'Café',description:'Un café',pointsCost:400}];
  else {status=404;data={message:'Missing fixture'};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
};
