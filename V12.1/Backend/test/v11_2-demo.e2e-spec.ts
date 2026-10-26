import '../src/config/load-env';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {plainToInstance} from 'class-transformer';
import {ConfigService} from '@nestjs/config';
import {PrismaService} from '../src/prisma/prisma.service';
import {DemoWalletProvider,assertDemoWallet} from '../src/payments/demo-provider';
import {OnlineOrdersService} from '../src/payments/online-orders';
import {AuthorizationsService} from '../src/transactions/authorizations.service';
import {AuthorizationsRepository} from '../src/transactions/authorizations.repository';
import {TransactionsService} from '../src/transactions/transactions.service';
import {TransactionsRepository} from '../src/transactions/transactions.repository';
import {CreateAuthorizationDto} from '../src/transactions/create-authorization.dto';
import {CreateTransactionDto} from '../src/transactions/create-transaction.dto';
import {WalletRepository} from '../src/wallet/wallet.repository';
import {PaymentsService} from '../src/payments/payments.service';
import {PointsPolicyService} from '../src/rewards/points-policy.service';
import {validateEnvironment} from '../src/config/environment';
describe('V11_4 DEMO persisted in exclusive PostgreSQL',()=>{
 const original=process.env.DATABASE_URL!;const schema='e2e_v11_4_'+randomUUID().replaceAll('-','');
 let db:PrismaService,orders:OnlineOrdersService,auth:AuthorizationsService,purchases:TransactionsService,stationId:string,fuelId:string,memberId:string,userId:string;
 beforeAll(async()=>{
  if(new URL(original).pathname!=='/primax_v11_1')throw Error('Publication test requires the isolated primax_v11_1 database');
  const url=new URL(original);url.searchParams.set('schema',schema);process.env.DATABASE_URL=url.toString(); process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
  process.env.APP_MODE='local';process.env.PAYMENT_ENV='demo';process.env.DEMO_WALLET_ENABLED='true';
  execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,stdio:'pipe'});
  db=new PrismaService();await db.$connect();orders=new OnlineOrdersService(db,new DemoWalletProvider(db));
  const repo=new AuthorizationsRepository(db),wallet=new WalletRepository(db),payments=new PaymentsService();auth=new AuthorizationsService(repo,wallet,payments);purchases=new TransactionsService(new TransactionsRepository(db),new PointsPolicyService(new ConfigService({SOLES_PER_POINT:'9'})),payments,repo,wallet);
  stationId=(await db.station.create({data:{code:'DEMO',name:'V11_4 test',address:'Fixture'}})).id;
  fuelId=(await db.fuel.create({data:{code:'DEMO',name:'V11_4 fuel',pricePerGallon:20}})).id;
  await db.fuelInventory.create({data:{stationId,fuelId,liters:1000}});
  const user=await db.user.create({data:{email:randomUUID()+'@example.test',name:'Fixture',passwordHash:'unused',membership:{create:{number:'PRIM999',welcomeAvailable:false}}},include:{membership:true}});userId=user.id;memberId=user.membership!.id;
 },90000);
 afterAll(async()=>{await db?.$disconnect();process.env.DATABASE_URL=original; process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;console.log('Retained V11_4 schema',schema);});
 test.each(['YAPE','PLIN'] as const)('prepaid %s: no personal fields, stock guard, capture, replay and one receipt',async method=>{
  const operationId=randomUUID(),authorization=plainToInstance(CreateAuthorizationDto,{operationId,mode:'PREPAGO',paymentMethod:method,plate:'NEW-123',stationId,fuelId,unitPrice:'20.00',amount:'60.00'});
  const dto={operationId,method,authorization};const order=await orders.create(dto,{kind:'kiosk'});
  expect((await orders.status(order.id,{kind:'kiosk'})).status).toBe('PENDING');await expect(auth.create(authorization)).rejects.toThrow();
  await expect(orders.confirmDemo(order.id,{amount:'59.00',currency:'PEN'},{kind:'kiosk'})).rejects.toThrow();
  await expect(orders.confirmDemo(order.id,{amount:'60.00',currency:'PEN'},{kind:'member',userId})).rejects.toThrow();
  const confirmations=await Promise.all([1,2].map(()=>orders.confirmDemo(order.id,{amount:'60.00',currency:'PEN'},{kind:'kiosk'})));expect(confirmations.every(x=>x.status==='CAPTURED')).toBe(true);
  expect((await orders.create(dto,{kind:'kiosk'})).id).toBe(order.id);
  const a=await auth.create(authorization);await auth.progress(a.authorization.id,{amount:'60.00',gallons:'3.000'});
  const body=plainToInstance(CreateTransactionDto,{...authorization,operationId:randomUUID(),authorizationId:a.authorization.id,gallons:'3.000',outcome:'AUTO',receiptDni:'70123456'});
  const purchase=await purchases.create(body),again=await purchases.create(body);expect(again.transaction.id).toBe(purchase.transaction.id);expect(purchase.transaction.payment!.provider).toBe('DEMO');
  expect(await db.paymentEvent.count({where:{eventKey:'capture:'+order.id}})).toBe(1);expect(await db.paymentEvent.count({where:{eventKey:'demo-confirm:'+order.id}})).toBe(1);expect(await db.transaction.count({where:{authorizationId:a.authorization.id}})).toBe(1);
 });
 test.each(['YAPE','PLIN'] as const)('postpaid %s settles original debt once; wrong owner rejected',async method=>{
  const purchase=await db.transaction.create({data:{operationId:randomUUID(),requestHash:'a'.repeat(64),plate:'NEW-123',membershipId:memberId,stationId,fuelId,amount:100,unitPrice:20,pointsRate:.1111,pointsEarned:0,mode:'POSTPAGO',status:'PAYMENT_PENDING',payment:{create:{amount:100,method:'SALDO_PRIME',status:'PENDING'}},debt:{create:{membershipId:memberId,amountOriginal:100,amountPending:100}}}});
  const dto={operationId:randomUUID(),method,transactionId:purchase.id};const actor={kind:'member' as const,userId};const order=await orders.create(dto,actor);
  await expect(orders.confirmDemo(order.id,{amount:'100.00',currency:'PEN'},{kind:'member',userId:randomUUID()})).rejects.toThrow();
  expect((await db.transaction.findUniqueOrThrow({where:{id:purchase.id}})).status).toBe('PAYMENT_PENDING');
  await Promise.all([1,2].map(()=>orders.confirmDemo(order.id,{amount:'100.00',currency:'PEN'},actor)));
  expect((await db.membershipDebt.findUniqueOrThrow({where:{transactionId:purchase.id}})).amountPending.toString()).toBe('0');expect(await db.walletMovement.count({where:{operationId:order.id,kind:'DEBT_SETTLEMENT'}})).toBe(1);expect(await db.transaction.count({where:{id:purchase.id}})).toBe(1);
  expect((await db.transaction.findUniqueOrThrow({where:{id:purchase.id}})).status).toBe('PAID');
 });
 test('insufficient stock cannot create wallet intent',async()=>{
  const operationId=randomUUID();await expect(orders.create({operationId,method:'YAPE',authorization:plainToInstance(CreateAuthorizationDto,{operationId,mode:'PREPAGO',paymentMethod:'YAPE',plate:'NEW-123',stationId,fuelId,unitPrice:'20.00',amount:'7000.00'})},{kind:'kiosk'})).rejects.toThrow('Stock');expect(await db.onlineOrder.count({where:{operationId}})).toBe(0);
 });
 test('cancel is replayable and prevents confirmation; refund is explicitly DEMO',async()=>{
  const operationId=randomUUID(),authorization=plainToInstance(CreateAuthorizationDto,{operationId,mode:'PREPAGO',paymentMethod:'PLIN',plate:'NEW-123',stationId,fuelId,unitPrice:'20.00',amount:'20.00'});
  const order=await orders.create({operationId,method:'PLIN',authorization},{kind:'kiosk'});
  expect((await orders.cancel(order.id,{kind:'kiosk'})).status).toBe('CANCELLED');expect((await orders.cancel(order.id,{kind:'kiosk'})).status).toBe('CANCELLED');await expect(orders.confirmDemo(order.id,{amount:'20.00',currency:'PEN'},{kind:'kiosk'})).rejects.toThrow();
  const nextId=randomUUID(),next=await orders.create({operationId:nextId,method:'PLIN',authorization:plainToInstance(CreateAuthorizationDto,{...authorization,operationId:nextId})},{kind:'kiosk'});await orders.confirmDemo(next.id,{amount:'20.00',currency:'PEN'},{kind:'kiosk'});expect((await orders.refund(next.id,{kind:'kiosk'})).status).toBe('REFUNDED');expect((await orders.refund(next.id,{kind:'kiosk'})).status).toBe('REFUNDED');
 });
 test('interrupted DEMO intent recovers without second order or payment',async()=>{
  const provider=new DemoWalletProvider(db),service=new OnlineOrdersService(db,provider);jest.spyOn(provider,'create').mockRejectedValueOnce(Error('interrupted'));
  const operationId=randomUUID(),authorization=plainToInstance(CreateAuthorizationDto,{operationId,mode:'PREPAGO',paymentMethod:'YAPE',plate:'NEW-123',stationId,fuelId,unitPrice:'20.00',amount:'20.00'});
  await expect(service.create({operationId,method:'YAPE',authorization},{kind:'kiosk'})).rejects.toThrow('interrupted');const pending=await db.onlineOrder.findUniqueOrThrow({where:{operationId}});
  expect((await orders.status(pending.id,{kind:'kiosk'})).status).toBe('PENDING');expect(await db.onlineOrder.count({where:{operationId}})).toBe(1);expect(await db.payment.count({where:{operationId}})).toBe(1);
 });
 test('production and non-demo payment environment reject simulation',()=>{
  const old=process.env.APP_MODE;process.env.APP_MODE='production';expect(assertDemoWallet).toThrow();expect(()=>validateEnvironment({DATABASE_URL:original,JWT_SECRET:'x'.repeat(32),KIOSK_API_KEY:'y'.repeat(32),APP_MODE:'production',PAYMENT_ENV:'demo',DEMO_WALLET_ENABLED:'true'})).toThrow();process.env.APP_MODE=old;
  process.env.PAYMENT_ENV='production';expect(assertDemoWallet).toThrow();process.env.PAYMENT_ENV='demo';
 });
});
