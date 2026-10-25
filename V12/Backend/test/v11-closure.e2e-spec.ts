import '../src/config/load-env';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma, PurchaseMode } from '@prisma/client';
import { validate } from 'class-validator';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthorizationsService } from '../src/transactions/authorizations.service';
import { AuthorizationsRepository } from '../src/transactions/authorizations.repository';
import { TransactionsService } from '../src/transactions/transactions.service';
import { TransactionsRepository } from '../src/transactions/transactions.repository';
import { CreateAuthorizationDto } from '../src/transactions/create-authorization.dto';
import { CreateTransactionDto } from '../src/transactions/create-transaction.dto';
import { WalletRepository } from '../src/wallet/wallet.repository';
import { PointsPolicyService } from '../src/rewards/points-policy.service';
import { PaymentsService } from '../src/payments/payments.service';
import { OnlineOrdersService } from '../src/payments/online-orders';
import { CulqiProvider, PaymentProvider, ProviderOrder } from '../src/payments/payment-provider';
import { PaymentLifecycleService } from '../src/payments/payment-lifecycle';
import { PaymentEventDto, PaymentWebhookController } from '../src/payments/webhook';

describe('V11 internal closure against PostgreSQL (provider is explicitly mocked)', () => {
 const original=process.env.DATABASE_URL!;
 const schema='e2e_closure_'+randomUUID().replaceAll('-','');
 let db:PrismaService,auth:AuthorizationsService,purchases:TransactionsService,orders:OnlineOrdersService,refunds:PaymentLifecycleService;
 let stationId:string,fuelId:string,sequence=0;
 const remote=new Map<string,ProviderOrder>();
 const provider:PaymentProvider={
  create:jest.fn(async (id,amount)=>{const order={id:'mock_'+id,order_number:id,amount,currency_code:'PEN',state:'pending'};remote.set(order.id,order);return order;}),
  get:jest.fn(async id=>remote.get(id)!),
  findByReference:jest.fn(async id=>[...remote.values()].find(x=>x.order_number===id)??null),
  cancel:jest.fn(async id=>{remote.get(id)!.state='cancelled';}),
  refund:jest.fn(async id=>{Object.assign(remote.get(id)!,{state:'refunded',refunded_at:1});}),
 };
 beforeAll(async()=>{
  const url=new URL(original);url.searchParams.set('schema',schema);process.env.DATABASE_URL=url.toString();
  execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,stdio:'pipe'});
  db=new PrismaService();await db.$connect();
  stationId=(await db.station.create({data:{code:'CLOSURE',name:'Station fixture',address:'Local test'}})).id;
  fuelId=(await db.fuel.create({data:{code:'CLOSURE',name:'Fuel fixture',pricePerGallon:20}})).id;
  await db.fuelInventory.create({data:{stationId,fuelId,liters:100000}});
  const repo=new AuthorizationsRepository(db),wallet=new WalletRepository(db),payments=new PaymentsService();
  auth=new AuthorizationsService(repo,wallet,payments);
  purchases=new TransactionsService(new TransactionsRepository(db),new PointsPolicyService(new ConfigService({SOLES_PER_POINT:'9'})),payments,repo,wallet);
  orders=new OnlineOrdersService(db,provider);refunds=new PaymentLifecycleService(db);
 },90000);
 afterAll(async()=>{await db?.$disconnect();process.env.DATABASE_URL=original;console.log('Retained V11 evidence schema:',schema);});
 async function member(eligible=true){
  const n=++sequence,plate='TST-'+String(n).padStart(3,'0');
  const user=await db.user.create({data:{email:randomUUID()+'@example.test',name:'Fixture',passwordHash:'unused',membership:{create:{number:'PRIM'+n,welcomeAvailable:eligible,balance:1000,vehicles:{create:{plate,label:"Fixture"}}}}},include:{membership:true}});
  return {id:user.membership!.id,userId:user.id,plate,code:user.membership!.number};
 }
 function body(m:Awaited<ReturnType<typeof member>>,mode:PurchaseMode,amount='60.00'){
  return plainToInstance(CreateAuthorizationDto,{operationId:randomUUID(),plate:m.plate,membershipCode:m.code,stationId,fuelId,unitPrice:'20.00',amount,mode,paymentMethod:mode==='PREPAGO'?'EFECTIVO':'SALDO_PRIME'});
 }
 async function finish(a:CreateAuthorizationDto,id:string,amount=a.amount){
  const gallons=new Prisma.Decimal(amount).div(20).toFixed(3);
  await auth.progress(id,{amount,gallons});
  return purchases.create(plainToInstance(CreateTransactionDto,{...a,operationId:randomUUID(),authorizationId:id,amount,gallons,outcome:'AUTO'}));
 }
 test.each(['PREPAGO','POSTPAGO'] as const)('%s strict threshold, net points and once only',async mode=>{
  const m=await member();
  for(const [amount,discount] of [['49.00','0'],['50.00','0'],['60.00','10'],['60.00','0']]){
   const dto=body(m,mode,amount),a=await auth.create(dto),result=await finish(dto,a.authorization.id);
   expect(String(result.transaction.discountAmount)).toBe(discount);
   expect(result.transaction.amount).toBe(new Prisma.Decimal(amount).minus(discount).toFixed(2));
   expect(result.pointsEarned).toBe(new Prisma.Decimal(result.transaction.amount).div(9).floor().toNumber());
   expect(result.transaction.payment!.amount.toFixed(2)).toBe(result.transaction.amount);
  }
 });
 test.each(['PREPAGO','POSTPAGO'] as const)('%s existing account receives no welcome bonus',async mode=>{
  const m=await member(false),dto=body(m,mode),a=await auth.create(dto);
  expect((await finish(dto,a.authorization.id)).transaction.amount).toBe('60.00');
 });
 test.each(['PREPAGO','POSTPAGO'] as const)('%s cancellation releases eligibility without stock debit',async mode=>{
  const m=await member(),dto=body(m,mode),a=await auth.create(dto);
  const before=await db.fuelInventory.findUniqueOrThrow({where:{stationId_fuelId:{stationId,fuelId}}});
  await auth.release(a.authorization.id);await expect(auth.release(a.authorization.id)).rejects.toThrow();
  const row=await db.membership.findUniqueOrThrow({where:{id:m.id}});
  expect(row.welcomeAvailable).toBe(true);expect(row.welcomeReservedOperationId).toBeNull();
  expect((await db.fuelInventory.findUniqueOrThrow({where:{stationId_fuelId:{stationId,fuelId}}})).liters.eq(before.liters)).toBe(true);
 });
 test.each(['PREPAGO','POSTPAGO'] as const)('%s failed closure cannot consume welcome benefit',async mode=>{
  const m=await member(),dto=body(m,mode),a=await auth.create(dto);
  await expect(purchases.create(plainToInstance(CreateTransactionDto,{...dto,authorizationId:a.authorization.id,gallons:'3.000'}))).rejects.toThrow();
  expect((await db.membership.findUniqueOrThrow({where:{id:m.id}})).welcomeAvailable).toBe(true);
  expect((await finish(dto,a.authorization.id)).transaction.amount).toBe('50.00');
 });
 test.each(['PREPAGO','POSTPAGO'] as const)('%s simultaneous purchases apply exactly one welcome discount',async mode=>{
  const m=await member(),a=body(m,mode),b=body(m,mode);
  const [x,y]=await Promise.all([auth.create(a),auth.create(b)]);
  const result=await Promise.all([finish(a,x.authorization.id),finish(b,y.authorization.id)]);
  expect(result.map(r=>r.transaction.amount).sort()).toEqual(['50.00','60.00']);
 });
 test('prepaid reservation prevents a simultaneous postpaid claim',async()=>{
  const m=await member(),a=body(m,'PREPAGO'),b=body(m,'POSTPAGO');
  const x=await auth.create(a),y=await auth.create(b);
  expect((await finish(b,y.authorization.id)).transaction.amount).toBe('60.00');
  expect((await finish(a,x.authorization.id)).transaction.amount).toBe('50.00');
 });
 test.each([['60.00','40.00'],['51.00','45.00']])('partial prepaid %s -> %s retains benefit and settles simulated net payment',async(original,consumed)=>{
  const m=await member(),dto=body(m,'PREPAGO',original),a=await auth.create(dto);
  const purchase=(await finish(dto,a.authorization.id,consumed)).transaction;
  expect(purchase.amount).toBe(consumed);expect(String(purchase.discountAmount)).toBe('0');
  expect(purchase.payment!.amount.toFixed(2)).toBe(consumed);
  const row=await db.membership.findUniqueOrThrow({where:{id:m.id}});expect(row.welcomeAvailable).toBe(true);expect(row.welcomeReservedOperationId).toBeNull();
 });
 test('concurrent simulated refund produces one compensation, no stock restoration',async()=>{
  const m=await member(),dto=body(m,'PREPAGO'),a=await auth.create(dto),r=await finish(dto,a.authorization.id);
  const paymentId=r.transaction.payment!.id;
  const stock=await db.fuelInventory.findUniqueOrThrow({where:{stationId_fuelId:{stationId,fuelId}}});
  await Promise.all([refunds.refund(paymentId),refunds.refund(paymentId)]);
  expect(await db.paymentEvent.count({where:{eventKey:'refund:'+paymentId}})).toBe(1);
  expect((await db.payment.findUniqueOrThrow({where:{id:paymentId}})).refundedAmount.toFixed(2)).toBe('50.00');
  expect((await db.transaction.findUniqueOrThrow({where:{id:r.transaction.id}})).status).toBe('REFUNDED');
  expect((await db.rewardMovement.aggregate({where:{membershipId:m.id},_sum:{points:true}}))._sum.points).toBe(0);
  expect((await db.fuelInventory.findUniqueOrThrow({where:{stationId_fuelId:{stationId,fuelId}}})).liters.eq(stock.liters)).toBe(true);
 });
 test('missing and pending payments cannot be refunded',async()=>{
  await expect(refunds.refund(randomUUID())).rejects.toThrow();
  const p=await db.payment.create({data:{amount:60,method:'TARJETA',status:'PENDING'}});
  await expect(refunds.refund(p.id)).rejects.toThrow();
  expect((await db.payment.findUniqueOrThrow({where:{id:p.id}})).status).toBe('PENDING');
 });
 async function online(){
  const m=await member(),a=body(m,'PREPAGO');a.paymentMethod='YAPE';
  const dto={operationId:a.operationId,method:'YAPE' as const,authorization:a,customer:{first_name:'Test',last_name:'Fixture',email:'fixture@example.test',phone_number:'999999999'}};
  return {m,a,dto,order:await orders.create(dto,{kind:'kiosk'})};
 }
 test('missing merchant configuration cannot reserve a bonus or persist a payable intent',async()=>{
  const key=process.env.CULQI_SECRET_KEY;delete process.env.CULQI_SECRET_KEY;
  try {
   const m=await member(),a=body(m,'PREPAGO');a.paymentMethod='YAPE';
   const service=new OnlineOrdersService(db,new CulqiProvider());
   await expect(service.create({operationId:a.operationId,method:'YAPE',authorization:a,customer:{first_name:'Test',last_name:'Test',email:'test@example.test',phone_number:'999999999'}},{kind:'kiosk'})).rejects.toThrow('credenciales');
   expect(await db.onlineOrder.count({where:{operationId:a.operationId}})).toBe(0);
   expect((await db.membership.findUniqueOrThrow({where:{id:m.id}})).welcomeReservedOperationId).toBeNull();
  } finally {if(key===undefined)delete process.env.CULQI_SECRET_KEY;else process.env.CULQI_SECRET_KEY=key;}
 });
 test('Yape prepago charges net amount and consumes bonus only after delivery',async()=>{
  const {m,a,order}=await online();expect(order.amount.toFixed(2)).toBe('50.00');
  expect((await db.membership.findUniqueOrThrow({where:{id:m.id}})).welcomeAvailable).toBe(true);
  const remoteOrder=remote.get(order.providerId!)!;remoteOrder.state='paid';remoteOrder.paid_at=1;
  await orders.webhook({eventId:randomUUID(),orderId:order.id,type:'PAID'});
  const approved=await auth.create(a);expect((await finish(a,approved.authorization.id)).transaction.amount).toBe('50.00');
 });
 test('concurrent duplicate webhook captures once and conflicting event identity fails',async()=>{
  const {order}=await online(),event={eventId:randomUUID(),orderId:order.id,type:'PAID'};
  await expect(orders.webhook(event)).rejects.toThrow();
  Object.assign(remote.get(order.providerId!)!,{state:'paid',paid_at:1});
  await Promise.all([orders.webhook(event),orders.webhook(event)]);
  expect(await db.paymentEvent.count({where:{eventKey:'capture:'+order.id}})).toBe(1);
  expect(await db.paymentEvent.count({where:{eventKey:'webhook:'+event.eventId}})).toBe(1);
  await expect(orders.webhook({...event,type:'FAILED'})).rejects.toThrow();
 });
 test.each(['failed','rejected','expired','cancelled'])('%s releases bonus but never captures payment',async state=>{
  const {m,order}=await online();remote.get(order.providerId!)!.state=state;
  const result=await orders.status(order.id);expect(result.status).toBe(['expired','cancelled'].includes(state)?'CANCELLED':'FAILED');
  expect((await db.membership.findUniqueOrThrow({where:{id:m.id}})).welcomeReservedOperationId).toBeNull();
  expect((await db.payment.findUniqueOrThrow({where:{id:order.paymentId!}})).status).not.toBe('CAPTURED');
 });
 test('cancel is idempotent and paid orders cannot be cancelled',async()=>{
  const {order}=await online();await orders.cancel(order.id,{kind:'kiosk'});await orders.cancel(order.id,{kind:'kiosk'});
  const paid=(await online()).order;Object.assign(remote.get(paid.providerId!)!,{state:'paid',paid_at:1});
  await expect(orders.cancel(paid.id,{kind:'kiosk'})).rejects.toThrow();
 });
 test('ambiguous creation recovers by merchant reference without creating another charge',async()=>{
  const {order}=await online();await db.onlineOrder.update({where:{id:order.id},data:{status:'CREATING',providerId:null}});
  const calls=(provider.create as jest.Mock).mock.calls.length;
  expect((await orders.status(order.id)).providerId).toBe(order.providerId);
  expect((provider.create as jest.Mock).mock.calls.length).toBe(calls);
 });
 test('concurrent identical order creation has one remote side effect',async()=>{
  const m=await member(),a=body(m,'PREPAGO');a.paymentMethod='YAPE';
  const dto={operationId:a.operationId,method:'YAPE' as const,authorization:a,customer:{first_name:'Test',last_name:'Test',email:'test@example.test',phone_number:'999999999'}};
  const count=(provider.create as jest.Mock).mock.calls.length;
  const result=await Promise.all([orders.create(dto,{kind:'kiosk'}),orders.create(dto,{kind:'kiosk'})]);
  expect(result[0].id).toBe(result[1].id);expect((provider.create as jest.Mock).mock.calls.length-count).toBe(1);
 });
 test('provider refund is confirmed once; unsigned/pending state never refunds',async()=>{
  const {m,order}=await online();Object.assign(remote.get(order.providerId!)!,{state:'paid',paid_at:1});await orders.status(order.id);
  await expect(orders.confirmRefund(order.id)).rejects.toThrow();
  Object.assign(remote.get(order.providerId!)!,{state:'refunded',refunded_at:-1});
  await expect(orders.confirmRefund(order.id)).rejects.toThrow();
  await orders.refund(order.id,{kind:'kiosk'});await orders.refund(order.id,{kind:'kiosk'});
  expect((await db.payment.findUniqueOrThrow({where:{id:order.paymentId!}})).refundedAmount.toFixed(2)).toBe('50.00');
  expect((await db.membership.findUniqueOrThrow({where:{id:m.id}})).welcomeReservedOperationId).toBeNull();
  expect(await db.paymentEvent.count({where:{eventKey:'refund:'+order.id}})).toBe(1);
 });
 test('FuelFlow debt and Prime payment share transaction/payment; refund reopens the same debt',async()=>{
  const m=await member();await db.membership.update({where:{id:m.id},data:{balance:0}});
  const dto=body(m,'POSTPAGO');dto.allowDebt=true;
  const a=await auth.create(dto),purchase=(await finish(dto,a.authorization.id)).transaction;
  const request={operationId:randomUUID(),method:'PLIN' as const,transactionId:purchase.id,customer:{first_name:'Test',last_name:'Test',email:'test@example.test',phone_number:'999999999'}};
  const actor={kind:'member' as const,userId:m.userId},order=await orders.create(request,actor);
  await expect(orders.create({...request,operationId:randomUUID()},actor)).rejects.toThrow('cobro activo');
  const pending=await purchases.get(purchase.id,actor);expect(pending.status).toBe('PAYMENT_PENDING');expect(pending.station!.id).toBe(stationId);expect(pending.plate).toBe(m.plate);expect(pending.fuel!.id).toBe(fuelId);expect(pending.createdAt).toBeDefined();
  Object.assign(remote.get(order.providerId!)!,{state:'paid',paid_at:1});
  await Promise.all([orders.status(order.id,actor),orders.status(order.id,actor)]);
  for(const viewer of [actor,{kind:'kiosk' as const}]){const paid=await purchases.get(purchase.id,viewer);expect(paid.status).toBe('PAID');expect(paid.payment!.id).toBe(purchase.payment!.id);expect(paid.amount).toBe('50.00');}
  await orders.refund(order.id,actor);await orders.refund(order.id,actor);
  expect((await purchases.get(purchase.id,actor)).status).toBe('PAYMENT_PENDING');
  expect((await db.membershipDebt.findUniqueOrThrow({where:{transactionId:purchase.id}})).amountPending.toFixed(2)).toBe('50.00');
  expect(await db.payment.count({where:{transactionId:purchase.id}})).toBe(1);
 });
 test('normalized webhook rejects malformed payload and invalid secret',async()=>{
  expect((await validate(plainToInstance(PaymentEventDto,{eventId:'',orderId:'bad',type:'CAPTURED'}))).length).toBe(3);
  const controller=new PaymentWebhookController(orders);process.env.PAYMENT_WEBHOOK_SECRET='fixture';
  expect(()=>controller.receive({eventId:'x',orderId:randomUUID(),type:'PAID'},'wrong')).toThrow();delete process.env.PAYMENT_WEBHOOK_SECRET;
 });
 test('FIFO settlement before provider capture preserves excess and refund does not reopen settled fuel debt',async()=>{
  const m=await member();await db.membership.update({where:{id:m.id},data:{balance:0}});
  const dto=body(m,'POSTPAGO');dto.allowDebt=true;
  const a=await auth.create(dto),purchase=(await finish(dto,a.authorization.id)).transaction;
  const actor={kind:'member' as const,userId:m.userId};
  const order=await orders.create({operationId:randomUUID(),method:'PLIN',transactionId:purchase.id,customer:{first_name:'Test',last_name:'Test',email:'test@example.test',phone_number:'999999999'}},actor);
  // Fixture represents an independently completed FIFO recharge while QR was pending.
  await db.membershipDebt.update({where:{transactionId:purchase.id},data:{amountPaid:50,amountPending:0,status:'SETTLED',settledAt:new Date()}});
  await db.payment.update({where:{transactionId:purchase.id},data:{status:'CAPTURED'}});
  await db.transaction.update({where:{id:purchase.id},data:{status:'PAID'}});
  Object.assign(remote.get(order.providerId!)!,{state:'paid',paid_at:1});await orders.status(order.id,actor);
  expect((await db.membership.findUniqueOrThrow({where:{id:m.id}})).balance.toFixed(2)).toBe('50.00');
  await orders.refund(order.id,actor);
  expect((await db.membership.findUniqueOrThrow({where:{id:m.id}})).balance.toFixed(2)).toBe('0.00');
  expect((await purchases.get(purchase.id,actor)).status).toBe('PAID');
 });
});
