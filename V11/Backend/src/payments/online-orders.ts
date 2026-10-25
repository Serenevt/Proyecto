import { reserveWelcome } from './welcome';
import { Inject, ServiceUnavailableException, BadRequestException, Body, ConflictException, Controller, Get, Headers, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, UnauthorizedException } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Prisma, OnlineOrder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, CurrentActor, MemberOrKiosk, Public } from '../auth/access';
import { CreateAuthorizationDto } from '../transactions/create-authorization.dto';
import { normalizePlate } from '../vehicles/plate.dto';
import { PAYMENT_PROVIDER, PaymentProvider, verifiedPaid } from './payment-provider';
class CustomerDto {
 @IsString() @MaxLength(80) first_name: string;
 @IsString() @MaxLength(80) last_name: string;
 @IsEmail() email: string;
 @IsString() @MaxLength(20) phone_number: string;
}
class OrderDto {
 @IsUUID('4') operationId: string;
 @IsIn(['YAPE','PLIN']) method: 'YAPE'|'PLIN';
 @IsOptional() @IsUUID() transactionId?: string;
 @IsOptional() @ValidateNested() @Type(()=>CreateAuthorizationDto) authorization?: CreateAuthorizationDto;
 @ValidateNested() @Type(()=>CustomerDto) customer: CustomerDto;
}
@Injectable()
export class OnlineOrdersService {
 constructor(private readonly db:PrismaService,@Inject(PAYMENT_PROVIDER) private readonly provider:PaymentProvider){}
 async create(dto:OrderDto,actor:Actor){
  if(!dto.customer)throw new BadRequestException('Datos del cliente requeridos');
  if(Boolean(dto.transactionId)===Boolean(dto.authorization))throw new BadRequestException('Indica compra o cobro pendiente');
  const requestHash=createHash('sha256').update(JSON.stringify(dto)).digest('hex');
  const existing=await this.db.onlineOrder.findUnique({where:{operationId:dto.operationId}});
  if(existing){this.owns(existing,actor);if(existing.requestHash!==requestHash)throw new ConflictException('operationId ya usado');return existing;}
  this.provider.assertConfigured?.();
  const intent=await this.db.atomic(async tx=>{
   const prior=await tx.onlineOrder.findUnique({where:{operationId:dto.operationId}});
   if(prior){this.owns(prior,actor);if(prior.requestHash!==requestHash)throw new ConflictException("operationId ya usado");return {order:prior,created:false};}
   let amount:Prisma.Decimal; let paymentId:string|undefined; let userId:string|undefined;
   if(dto.transactionId){
    if(actor.kind!=='member')throw new UnauthorizedException();
    const debt=await tx.membershipDebt.findUnique({where:{transactionId:dto.transactionId},include:{membership:true}});
    if(!debt||debt.membership.userId!==actor.userId||debt.amountPending.lte(0))throw new NotFoundException('Cobro pendiente no encontrado');
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE id=${debt.membershipId}::uuid FOR UPDATE`;
    const active=await tx.onlineOrder.findFirst({where:{transactionId:dto.transactionId,status:{in:['CREATING','PENDING','REFUNDING']}}});
    if(active)throw new ConflictException('Ya existe un cobro activo para esta transaccion');
    amount=debt.amountPending;userId=actor.userId;
   }else{
    if(actor.kind!=='kiosk')throw new UnauthorizedException();
    const a=dto.authorization!;
    if(a.mode!=='PREPAGO'||a.paymentMethod!==dto.method||a.operationId!==dto.operationId)throw new BadRequestException('Compra incompatible');
    amount=new Prisma.Decimal(a.amount);
    const fuel=await tx.fuel.findUnique({where:{id:a.fuelId}});
    const station=await tx.station.findUnique({where:{id:a.stationId}});
    if(!fuel?.active||!station?.active||!fuel.pricePerGallon.eq(a.unitPrice||'0'))throw new BadRequestException('Confirma cat?logo y precio');
    const stock=await tx.fuelInventory.findUnique({where:{stationId_fuelId:{stationId:a.stationId,fuelId:a.fuelId}}});
    if(!stock||stock.liters.lt(amount.div(fuel.pricePerGallon).toDecimalPlaces(3).mul('3.785411784')))throw new BadRequestException('Stock insuficiente');
    if(a.membershipCode){const v=await tx.vehicle.findUnique({where:{plate:normalizePlate(a.plate) as string},include:{membership:true}});if(v?.membership?.number!==a.membershipCode)throw new BadRequestException('Membres?a no corresponde al veh?culo');}
    const hash=createHash('sha256').update(JSON.stringify({...a,plate:normalizePlate(a.plate),amount:amount.toFixed(2)})).digest('hex');
    const pricing=await reserveWelcome(tx,a);
    amount=pricing.amount;
    const payment=await tx.payment.create({data:{operationId:a.operationId,requestHash:hash,...pricing,method:dto.method,status:'PENDING',provider:'CULQI',unitPrice:fuel.pricePerGallon}});
    paymentId=payment.id;
   }
   if(amount.lt(6)||amount.gt(7000))throw new BadRequestException('Culqi requiere un monto entre S/6 y S/7000');
   return {order:await tx.onlineOrder.create({data:{operationId:dto.operationId,requestHash,amount,method:dto.method,userId,paymentId,transactionId:dto.transactionId}}),created:true};
  });
  const order=intent.order;if(!intent.created)return order;
  // Persist the intent before the external side effect. An ambiguous timeout remains
  // CREATING for reconciliation; never create a second provider charge automatically.
  const remote=await this.provider.create(order.id,order.amount.mul(100).toNumber(),dto.customer);
  if(remote.order_number!==order.id||remote.amount!==order.amount.mul(100).toNumber()||remote.currency_code!=='PEN')throw new ConflictException('Respuesta de proveedor incompatible');
  const qr=remote.qr&&new URL(remote.qr).protocol==='https:'?remote.qr:null;
  return this.db.onlineOrder.update({where:{id:order.id},data:{providerId:remote.id,qr,status:'PENDING'}});
 }
 async webhook(event:{eventId:string;orderId:string;type:string}) {
  const eventKey='webhook:'+event.eventId;
  const detail=JSON.stringify({orderId:event.orderId,type:event.type});
  const previous=await this.db.paymentEvent.findUnique({where:{eventKey}});
  if(previous){if(previous.detail!==detail)throw new ConflictException('Evento reutilizado con otros datos');return {accepted:true,replayed:true};}
  const order=event.type==='REFUNDED'?await this.confirmRefund(event.orderId):await this.status(event.orderId);
  const expected:Record<string,string>={PAID:'CAPTURED',FAILED:'FAILED',CANCELLED:'CANCELLED',REFUNDED:'REFUNDED'};
  if(order.status!==expected[event.type])throw new BadRequestException('El proveedor no confirma el evento');
  await this.db.atomic(async tx=>{
   const prior=await tx.paymentEvent.findUnique({where:{eventKey}});
   if(prior){if(prior.detail!==detail)throw new ConflictException('Evento reutilizado');return;}
   await tx.paymentEvent.create({data:{eventKey,orderId:order.id,paymentId:order.paymentId,kind:event.type,detail}});
  });
  return {accepted:true,replayed:false};
 }
 async refund(id:string,actor:Actor) {
  const order=await this.status(id,actor);
  if(order.status==='REFUNDED')return order;
  if(!['CAPTURED','REFUNDING'].includes(order.status)||!order.providerId)throw new ConflictException('Solo un pago capturado admite reembolso');
  if(!this.provider.refund)throw new ServiceUnavailableException('Reembolso externo pendiente de adapter comercial');
  if(order.paymentId){
   const paid=await this.db.payment.findUniqueOrThrow({where:{id:order.paymentId},include:{authorization:true}});
   if(paid.authorization?.dispensedAmount.gt(0)&&!paid.transactionId)throw new ConflictException('Liquida primero el combustible entregado');
  }
  // Persist uncertainty before side effect; retries use the same provider key.
  await this.db.atomic(async tx=>{
   await tx.onlineOrder.updateMany({where:{id,status:'CAPTURED'},data:{status:'REFUNDING'}});
   if(order.paymentId)await tx.fuelAuthorization.updateMany({where:{paymentId:order.paymentId,status:{in:['RESERVED','DISPENSING']},dispensedAmount:0},data:{status:'INTERVENTION_REQUIRED',interventionReason:'Reembolso en conciliacion; despacho bloqueado'}});
  });
  await this.provider.refund(order.providerId,'refund:'+order.id);
  return this.confirmRefund(id);
 }
 async confirmRefund(id:string) {
  const order=await this.db.onlineOrder.findUnique({where:{id}});
  if(!order)throw new NotFoundException();
  if(order.status==='REFUNDED')return order;
  if(!['CAPTURED','REFUNDING'].includes(order.status)||!order.providerId)throw new ConflictException('Pago no capturado');
  const remote=await this.provider.get(order.providerId);
  if(remote.id!==order.providerId||remote.order_number!==order.id||remote.amount!==order.amount.mul(100).toNumber()||remote.currency_code!=='PEN'||remote.state!=='refunded'||typeof remote.refunded_at!=='number'||!Number.isFinite(remote.refunded_at)||remote.refunded_at<=0)throw new ConflictException('Proveedor no confirma reembolso');
  return this.db.atomic(async tx=>{
   await tx.$queryRaw`SELECT id FROM "OnlineOrder" WHERE id=${id}::uuid FOR UPDATE`;
   const fresh=await tx.onlineOrder.findUniqueOrThrow({where:{id}});
   if(fresh.status==='REFUNDED')return fresh;
   if(!['CAPTURED','REFUNDING'].includes(fresh.status))throw new ConflictException('Estado incompatible');
   if(fresh.paymentId){
    const paid=await tx.payment.findUniqueOrThrow({where:{id:fresh.paymentId},include:{authorization:true,transaction:true}});
    if(paid.status!=='CAPTURED')throw new ConflictException('Pago incompatible');
    if(paid.authorization && !paid.transaction){
     if(paid.authorization.dispensedAmount.gt(0))throw new ConflictException('Liquida primero el combustible entregado');
     await tx.fuelAuthorization.update({where:{id:paid.authorization.id},data:{status:'RELEASED',outcome:'CANCELLED',releasedAmount:0}});
    }
    if(paid.transaction){
     await tx.transaction.update({where:{id:paid.transaction.id},data:{status:'REFUNDED'}});
     if(paid.transaction.membershipId&&paid.transaction.pointsEarned)await tx.rewardMovement.create({data:{membershipId:paid.transaction.membershipId,kind:'REFUND',refundPaymentId:paid.id,points:-paid.transaction.pointsEarned}});
    }
    await tx.payment.update({where:{id:paid.id},data:{status:'REFUNDED',refundedAmount:{increment:paid.amount}}});
   }
   if(fresh.transactionId){
    const debt=await tx.membershipDebt.findUniqueOrThrow({where:{transactionId:fresh.transactionId}});
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE id=${debt.membershipId}::uuid FOR UPDATE`;
    const applied=await tx.walletMovement.findUnique({where:{operationId_kind:{operationId:id,kind:'DEBT_SETTLEMENT'}}});
    const restored=applied?.amount.negated() ?? new Prisma.Decimal(0);
    const credit=fresh.amount.minus(restored);
    const member=await tx.membership.findUniqueOrThrow({where:{id:debt.membershipId}});
    // A spent overpayment becomes debt rather than making wallet balance negative.
    const debit=Prisma.Decimal.min(member.balance,credit);
    const reopened=restored.plus(credit.minus(debit));
    const balanceAfter=member.balance.minus(debit);
    await tx.membership.update({where:{id:member.id},data:{balance:balanceAfter}});
    await tx.membershipDebt.update({where:{id:debt.id},data:{amountOriginal:{increment:credit.minus(debit)},amountPaid:{decrement:restored},amountPending:{increment:reopened},status:debt.amountPending.plus(reopened).isZero()?'SETTLED':debt.amountPaid.minus(restored).isZero()?'PENDING':'PARTIAL',settledAt:debt.amountPending.plus(reopened).isZero()?new Date():null}});
    if(debit.gt(0))await tx.walletMovement.create({data:{membershipId:member.id,debtId:debt.id,transactionId:fresh.transactionId,operationId:id,kind:'RESERVE',amount:debit.negated(),balanceAfter,note:'Reembolso confirmado: deuda reabierta; combustible no devuelto'}});
    await tx.payment.update({where:{transactionId:fresh.transactionId},data:{status:debt.amountPending.plus(reopened).isZero()?'CAPTURED':'PENDING',refundedAmount:{increment:fresh.amount}}});
    await tx.transaction.update({where:{id:fresh.transactionId},data:{status:debt.amountPending.plus(reopened).isZero()?'PAID':'PAYMENT_PENDING'}});
   }
   await tx.membership.updateMany({where:{welcomeReservedOperationId:fresh.operationId},data:{welcomeReservedOperationId:null}});
   await tx.paymentEvent.create({data:{eventKey:'refund:'+id,orderId:id,paymentId:fresh.paymentId,kind:'REFUNDED',detail:'Reembolso confirmado mediante adapter del proveedor'}});
   return tx.onlineOrder.update({where:{id},data:{status:'REFUNDED'}});
  });
 }
 async cancel(id:string,actor:Actor) {
  const order=await this.status(id,actor);
  if(order.status==='CANCELLED')return order;
  if(order.status!=='PENDING'||!order.providerId)throw new ConflictException('Solo una orden pendiente puede cancelarse');
  if(!this.provider.cancel)throw new ServiceUnavailableException('Cancelacion externa pendiente de adapter comercial');
  await this.provider.cancel(order.providerId,'cancel:'+order.id);
  const confirmed=await this.status(id,actor);
  if(confirmed.status!=='CANCELLED')throw new ConflictException('Proveedor aun no confirma cancelacion');
  return confirmed;
 }

 private owns(order:{userId:string|null},actor:Actor){if(actor.kind==='member'&&order.userId!==actor.userId)throw new NotFoundException();if(actor.kind==='kiosk'&&order.userId)throw new NotFoundException();}
 async status(id:string,actor?:Actor):Promise<OnlineOrder>{
  const order=await this.db.onlineOrder.findUnique({where:{id}});if(!order)throw new NotFoundException();if(actor)this.owns(order,actor);
  if(['CAPTURED','REFUNDING','FAILED','CANCELLED','REFUNDED'].includes(order.status))return order;
  if(!order.providerId){
   if(!this.provider.findByReference)throw new ServiceUnavailableException('Reconciliacion por referencia pendiente de adapter comercial');
   const recovered=await this.provider.findByReference(order.id);
   if(!recovered)return order;
   if(recovered.order_number!==order.id||recovered.amount!==order.amount.mul(100).toNumber()||recovered.currency_code!=='PEN')throw new ConflictException('Referencia recuperada incompatible');
   await this.db.onlineOrder.update({where:{id},data:{providerId:recovered.id,status:'PENDING'}});
   return this.status(id,actor);
  }
  const remote=await this.provider.get(order.providerId);
  if(remote.id!==order.providerId||remote.order_number!==order.id||remote.amount!==order.amount.mul(100).toNumber()||remote.currency_code!=='PEN')throw new ConflictException('Evento del proveedor incompatible');
  if(['failed','rejected','expired','cancelled'].includes(remote.state))return this.db.atomic(async tx=>{
   await tx.$queryRaw`SELECT id FROM "OnlineOrder" WHERE id=${id}::uuid FOR UPDATE`;
   const fresh=await tx.onlineOrder.findUniqueOrThrow({where:{id}});
   if(!['PENDING','CREATING'].includes(fresh.status))return fresh;
   const status=['cancelled','expired'].includes(remote.state)?'CANCELLED':'FAILED';
   if(fresh.paymentId)await tx.payment.update({where:{id:fresh.paymentId},data:{status:status==='FAILED'?'REJECTED':'CANCELLED'}});
   await tx.membership.updateMany({where:{welcomeReservedOperationId:fresh.operationId},data:{welcomeReservedOperationId:null}});
   await tx.paymentEvent.create({data:{eventKey:'terminal:'+id,orderId:id,paymentId:fresh.paymentId,kind:status,detail:'Estado confirmado consultando proveedor'}});
   return tx.onlineOrder.update({where:{id},data:{status}});
  });
  if(!verifiedPaid(remote,order))return order;
  return this.db.atomic(async tx=>{
   await tx.$queryRaw`SELECT id FROM "OnlineOrder" WHERE id=${id}::uuid FOR UPDATE`;
   const fresh=await tx.onlineOrder.findUniqueOrThrow({where:{id}});if(fresh.status==='CAPTURED')return fresh;if(!['PENDING','CREATING'].includes(fresh.status))throw new ConflictException('Orden terminal no admite captura');
   if(fresh.paymentId)await tx.payment.update({where:{id:fresh.paymentId},data:{status:'CAPTURED'}});
   if(fresh.transactionId){
    const debt=await tx.membershipDebt.findUniqueOrThrow({where:{transactionId:fresh.transactionId}});
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE id=${debt.membershipId}::uuid FOR UPDATE`;
    const latest=await tx.membershipDebt.findUniqueOrThrow({where:{id:debt.id}});
    const applied=Prisma.Decimal.min(fresh.amount,latest.amountPending);
    const pending=latest.amountPending.minus(applied);
    // A concurrent FIFO recharge may have settled some debt. Preserve the overpayment as wallet credit.
    const member=await tx.membership.update({where:{id:debt.membershipId},data:{balance:{increment:fresh.amount.minus(applied)}}});
    await tx.membershipDebt.update({where:{id:debt.id},data:{amountPaid:{increment:applied},amountPending:pending,status:pending.isZero()?'SETTLED':'PARTIAL',settledAt:pending.isZero()?new Date():null}});
    if(applied.gt(0))await tx.walletMovement.create({data:{membershipId:debt.membershipId,debtId:debt.id,transactionId:fresh.transactionId,kind:'DEBT_SETTLEMENT',amount:applied.negated(),balanceAfter:member.balance,operationId:fresh.id,note:'Pago Culqi verificado por API'}});
    if(fresh.amount.gt(applied))await tx.walletMovement.create({data:{membershipId:debt.membershipId,kind:'RECHARGE',amount:fresh.amount.minus(applied),balanceAfter:member.balance,operationId:fresh.id,note:'Excedente de pago Culqi'}});
    await tx.payment.update({where:{transactionId:fresh.transactionId},data:{status:pending.isZero()?'CAPTURED':'PARTIAL',provider:'CULQI'}});
    await tx.transaction.update({where:{id:fresh.transactionId},data:{status:pending.isZero()?'PAID':'PAYMENT_PENDING'}});
   }
   await tx.paymentEvent.create({data:{eventKey:'capture:'+id,orderId:id,paymentId:fresh.paymentId,kind:'CAPTURED',detail:'Pago verificado mediante API del proveedor'}});
   return tx.onlineOrder.update({where:{id},data:{status:'CAPTURED'}});
  });
 }
}
@Controller('online-orders')
export class OnlineOrdersController {
 constructor(private readonly service:OnlineOrdersService){}
 @Post() @MemberOrKiosk() create(@Body()dto:OrderDto,@CurrentActor()actor:Actor){return this.service.create(dto,actor);}
 @Post(':id/cancel') @MemberOrKiosk() cancel(@Param('id',new ParseUUIDPipe())id:string,@CurrentActor()actor:Actor){return this.service.cancel(id,actor);}
 @Post(':id/refund') @MemberOrKiosk() refund(@Param('id',new ParseUUIDPipe())id:string,@CurrentActor()actor:Actor){return this.service.refund(id,actor);}
 @Get(':id') @MemberOrKiosk() status(@Param('id',new ParseUUIDPipe())id:string,@CurrentActor()actor:Actor){return this.service.status(id,actor);}
 @Post(':id/notify') @Public() notify(@Param('id',new ParseUUIDPipe())id:string,@Headers('x-webhook-secret')secret:string){
  const expected=process.env.PAYMENT_WEBHOOK_SECRET;
  if(!expected||!secret||!timingSafeEqual(createHash('sha256').update(secret).digest(),createHash('sha256').update(expected).digest()))throw new UnauthorizedException();
  // Payload is never evidence of payment: re-fetch authoritative provider state.
  return this.service.status(id);
 }
}
