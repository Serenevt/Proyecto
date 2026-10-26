import {plainToInstance} from 'class-transformer';
import {CreateAuthorizationDto} from '../src/transactions/create-authorization.dto';
import {AuthorizationsService} from '../src/transactions/authorizations.service';
import {AuthorizationsRepository} from '../src/transactions/authorizations.repository';
import {WalletRepository} from '../src/wallet/wallet.repository';
import {PaymentsService} from '../src/payments/payments.service';
import '../src/config/load-env';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {PrismaService} from '../src/prisma/prisma.service';
import {OnlineOrdersService,OnlineOrdersController} from '../src/payments/online-orders';
import {CulqiProvider,ProviderOrder} from '../src/payments/payment-provider';
describe('V11 PostgreSQL + mocked provider contract (NOT provider sandbox)',()=>{
 const original=process.env.DATABASE_URL!; const schema='e2e_v11_'+randomUUID().replaceAll('-','');
 let db:PrismaService, service:OnlineOrdersService,userId:string,memberId:string,stationId:string,fuelId:string;
 const remote=new Map<string,ProviderOrder>();
 const provider={create:jest.fn(async(id:string,amount:number)=>{const value:ProviderOrder={id:'ord_test_'+id,order_number:id,amount,currency_code:'PEN',state:'pending',qr:null};remote.set(value.id,value);return value;}),get:jest.fn(async(id:string)=>remote.get(id)!)};
 beforeAll(async()=>{const url=new URL(original);url.searchParams.set('schema',schema);process.env.DATABASE_URL=url.toString(); process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,stdio:'pipe'});db=new PrismaService();await db.$connect();
 const user=await db.user.create({data:{email:randomUUID()+'@example.test',name:'Provider fixture',passwordHash:'unused',membership:{create:{number:'PRIM001',welcomeAvailable:true}}},include:{membership:true}});userId=user.id;memberId=user.membership!.id;
 stationId=(await db.station.create({data:{code:'TEST',name:'Test',address:'Test'}})).id;
 fuelId=(await db.fuel.create({data:{code:'TEST',name:'Test',pricePerGallon:20}})).id;
 service=new OnlineOrdersService(db,provider as unknown as CulqiProvider);
 },90000);
 afterAll(async()=>{await db?.$disconnect();process.env.DATABASE_URL=original; process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;console.log('V11 evidence schema:',schema);});
 async function debt(){return db.transaction.create({data:{operationId:randomUUID(),requestHash:'a'.repeat(64),plate:'ABC-123',membershipId:memberId,stationId,fuelId,amount:100,unitPrice:20,pointsRate:0.1111,pointsEarned:0,mode:'POSTPAGO',status:'PAYMENT_PENDING',payment:{create:{amount:100,method:'SALDO_PRIME',status:'PENDING'}},debt:{create:{membershipId:memberId,amountOriginal:100,amountPending:100}}}});}
 test.each(['YAPE','PLIN'] as const)('%s pending -> provider paid -> duplicate notification settles exactly once',async method=>{
  const purchase=await debt();const dto={operationId:randomUUID(),method,transactionId:purchase.id,customer:{first_name:'Test',last_name:'Fixture',email:'test@example.test',phone_number:'999999999'}};
  const order=await service.create(dto,{kind:'member',userId});expect(order.status).toBe('PENDING');
  expect((await service.status(order.id,{kind:'member',userId})).status).toBe('PENDING');
  expect((await db.transaction.findUniqueOrThrow({where:{id:purchase.id}})).status).toBe('PAYMENT_PENDING');
  const replay=await service.create(dto,{kind:'member',userId});expect(replay.id).toBe(order.id);
  remote.get(order.providerId!)!.state='paid';remote.get(order.providerId!)!.paid_at=Date.now();
  const result=await Promise.all([service.status(order.id,{kind:'member',userId}),service.status(order.id,{kind:'member',userId})]);expect(result.every(r=>r.status==='CAPTURED')).toBe(true);
  expect(await db.walletMovement.count({where:{operationId:order.id,kind:'DEBT_SETTLEMENT'}})).toBe(1);
  expect((await db.transaction.findUniqueOrThrow({where:{id:purchase.id}})).status).toBe('PAID');
  await expect(service.status(order.id,{kind:'member',userId:randomUUID()})).rejects.toThrow();
 });
 test('prepaid online cannot authorize before provider capture',async()=>{
  await db.fuelInventory.create({data:{stationId,fuelId,liters:100}});
  const operationId=randomUUID();const authorization=plainToInstance(CreateAuthorizationDto,{operationId,plate:'NEW-123',stationId,fuelId,mode:'PREPAGO',paymentMethod:'YAPE',amount:'60.00',unitPrice:'20.00'});
  const orders=await service.create({operationId,method:'YAPE',authorization,customer:{first_name:'Test',last_name:'Fixture',email:'test@example.test',phone_number:'999999999'}},{kind:'kiosk'});
  const auth=new AuthorizationsService(new AuthorizationsRepository(db),new WalletRepository(db),new PaymentsService());
  await expect(auth.create(authorization)).rejects.toThrow();
  remote.get(orders.providerId!)!.state='paid';remote.get(orders.providerId!)!.paid_at=Date.now();await service.status(orders.id,{kind:'kiosk'});
  const approved=await auth.create(authorization);expect(approved.authorization.status).toBe('RESERVED');
 });
 test('invalid webhook does not reconcile',()=>{const controller=new OnlineOrdersController(service);process.env.PAYMENT_WEBHOOK_SECRET='fixture';expect(()=>controller.notify(randomUUID(),'wrong')).toThrow();delete process.env.PAYMENT_WEBHOOK_SECRET;});
 test('concurrent pumps cannot make inventory negative; replay has zero delta',async()=>{
  await db.fuelInventory.update({where:{stationId_fuelId:{stationId,fuelId}},data:{liters:5}});
  const auth=()=>db.fuelAuthorization.create({data:{operationId:randomUUID(),requestHash:'b'.repeat(64),plate:'ABC-123',membershipId:memberId,stationId,fuelId,unitPrice:20,authorizedAmount:100,reservedAmount:0,balanceAfter:0}});
  const a=await auth(),b=await auth();
  const update=(id:string)=>db.fuelAuthorization.update({where:{id},data:{dispensedGallons:1,dispensedAmount:20}});
  const results=await Promise.allSettled([update(a.id),update(b.id)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const winner=results[0].status==='fulfilled'?a:b;await update(winner.id);
  const stock=await db.fuelInventory.findUniqueOrThrow({where:{stationId_fuelId:{stationId,fuelId}}});expect(stock.liters.toFixed(6)).toBe('1.214588');
 });
 test('failed transaction rolls back welcome claim',async()=>{
  await expect(db.atomic(async tx=>{await tx.membership.update({where:{id:memberId},data:{welcomeAvailable:false}});throw new Error('cancelled');})).rejects.toThrow('cancelled');
  expect((await db.membership.findUniqueOrThrow({where:{id:memberId}})).welcomeAvailable).toBe(true);
 });
});
