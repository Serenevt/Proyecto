import { assertDemoWallet, DemoWalletProvider } from './demo-provider';
import { Matches } from 'class-validator';
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
import { terminalOperationFor } from '../transactions/operational-context';
import {
  releaseInventoryReservation,
  reserveInventory,
  reviewInventoryReservation,
} from '../inventory/inventory-reservations';
import { PAYMENT_PROVIDER, PaymentProvider, ProviderOrder, verifiedPaid } from './payment-provider';
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
 @IsOptional() @ValidateNested() @Type(()=>CustomerDto) customer?: CustomerDto;
}
class DemoConfirmationDto {
 @IsString() @Matches(/^\d{1,4}\.\d{2}$/) amount:string;
 @IsIn(['PEN']) currency:'PEN';
}
@Injectable()
export class OnlineOrdersService {
 constructor(private readonly db:PrismaService,@Inject(PAYMENT_PROVIDER) private readonly provider:PaymentProvider){}
 async create(dto:OrderDto,actor:Actor){
  const demo=this.provider instanceof DemoWalletProvider;
  if(!demo&&!dto.customer)throw new BadRequestException('Datos del cliente requeridos');
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
    const operation=await terminalOperationFor(tx,dto.operationId,a.stationId);
    if(a.membershipCode){const v=await tx.vehicle.findUnique({where:{plate:normalizePlate(a.plate) as string},include:{membership:true}});if(v?.membership?.number!==a.membershipCode)throw new BadRequestException('Membresía no corresponde al veh?culo');}
    const hash=createHash('sha256').update(JSON.stringify({...a,plate:normalizePlate(a.plate),amount:amount.toFixed(2)})).digest('hex');
    const pricing=await reserveWelcome(tx,a);
    amount=pricing.amount;
    const maxGallons=new Prisma.Decimal(a.amount).div(fuel.pricePerGallon).toDecimalPlaces(3);
    if(maxGallons.lte(0))throw new BadRequestException('El monto no cubre el mínimo de volumen');
    await reserveInventory(tx,{
     operationId:dto.operationId,stationId:a.stationId,fuelId:a.fuelId,
     terminalOperationId:operation?.id??null,source:operation?'TERMINAL':'LEGACY',
     maxGallons,requestHash:hash,status:'PENDING_PAYMENT',
    });
    const payment=await tx.payment.create({data:{operationId:a.operationId,requestHash:hash,...pricing,method:dto.method,status:'PENDING',provider:demo?'DEMO':'CULQI',unitPrice:fuel.pricePerGallon}});
    paymentId=payment.id;
   }
   if(amount.lt(6)||amount.gt(7000))throw new BadRequestException('Culqi requiere un monto entre S/6 y S/7000');
   return {order:await tx.onlineOrder.create({data:{operationId:dto.operationId,requestHash,amount,method:dto.method,userId,paymentId,transactionId:dto.transactionId}}),created:true};
  });
  const order=intent.order;if(!intent.created)return order;
  // Persist the intent before the external side effect. An ambiguous timeout remains
  // CREATING for reconciliation; never create a second provider charge automatically.
  let remote:ProviderOrder;
  try {
   remote=await this.provider.create(order.id,order.amount.mul(100).toNumber(),dto.customer!);
  } catch(error) {
   await this.db.atomic(async tx=>{
    const reservation=await tx.inventoryReservation.findUnique({where:{operationId:order.operationId}});
    if(reservation)await reviewInventoryReservation(tx,reservation.id,'Payment provider result is ambiguous');
   });
   throw error;
  }
  if(remote.order_number!==order.id||remote.amount!==order.amount.mul(100).toNumber()||remote.currency_code!=='PEN') {
   await this.db.atomic(async tx=>{
    const reservation=await tx.inventoryReservation.findUnique({where:{operationId:order.operationId}});
    if(reservation)await reviewInventoryReservation(tx,reservation.id,'Payment provider response did not match the intent');
   });
   throw new ConflictException('Respuesta de proveedor incompatible');
  }
  const qr=remote.qr&&new URL(remote.qr).protocol==='https:'?remote.qr:null;
  return this.db.onlineOrder.update({where:{id:order.id},data:{providerId:remote.id,qr,status:'PENDING'}});
 }
 async confirmDemo(id:string,dto:DemoConfirmationDto,actor:Actor){
  assertDemoWallet();
  if(!(this.provider instanceof DemoWalletProvider))throw new ConflictException('Proveedor comercial no admite simulación');
  const order=await this.db.onlineOrder.findUniqueOrThrow({where:{id}});this.owns(order,actor);
  if(dto.currency!=='PEN'||!order.amount.eq(dto.amount))throw new ConflictException('Importe o moneda incompatible');
  if(!order.providerId?.startsWith('demo:')||!['PENDING','CAPTURED'].includes(order.status))throw new ConflictException('Orden no disponible para simulación');
  await this.provider.confirm(order.providerId,order.amount.mul(100).toNumber());
  return this.status(id,actor);
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
   if(paid.authorization?.dispensedAmount.gt(0))throw new ConflictException('El reembolso total no está permitido después del despacho; concilia solo el excedente financiero');
  }
  // Persist uncertainty before side effect; retries use the same provider key.
  await this.db.atomic(async tx=>{
   await tx.onlineOrder.updateMany({where:{id,status:'CAPTURED'},data:{status:'REFUNDING'}});
   if(order.paymentId) {
    const auth=await tx.fuelAuthorization.findFirst({where:{paymentId:order.paymentId,status:{in:['RESERVED','DISPENSING']},dispensedAmount:0}});
    if(auth) {
     await tx.fuelAuthorization.update({where:{id:auth.id},data:{status:'INTERVENTION_REQUIRED',interventionReason:'Reembolso en conciliacion; despacho bloqueado'}});
     if(auth.inventoryManaged) {
      const reservation=await tx.inventoryReservation.findUnique({where:{authorizationId:auth.id}});
      if(reservation)await reviewInventoryReservation(tx,reservation.id,'Payment refund is being reconciled');
     }
    }
   }
  });
  await this.provider.refund(order.providerId,'refund:'+order.id);
  return this.confirmRefund(id);
 }
 async confirmRefund(id:string) {
  const order=await this.db.onlineOrder.findUnique({where:{id}});
  if(!order)throw new NotFoundException();
  if(order.status==='REFUNDED')return order;
  if(!['CAPTURED','REFUNDING'].includes(order.status)||!order.providerId)throw new ConflictException('Pago no capturado');
  let remote:ProviderOrder;
  try { remote=await this.provider.get(order.providerId); }
  catch(error) {
   if(order.paymentId)await this.db.atomic(async tx=>{
    const reservation=await tx.inventoryReservation.findUnique({where:{operationId:order.operationId}});
    if(reservation&&reservation.status!=='CANCELLED'&&reservation.status!=='CLOSED')
     await reviewInventoryReservation(tx,reservation.id,'Payment status could not be confirmed');
   });
   throw error;
  }
  if(remote.id!==order.providerId||remote.order_number!==order.id||remote.amount!==order.amount.mul(100).toNumber()||remote.currency_code!=='PEN'||remote.state!=='refunded'||typeof remote.refunded_at!=='number'||!Number.isFinite(remote.refunded_at)||remote.refunded_at<=0)throw new ConflictException('Proveedor no confirma reembolso');
  return this.db.atomic(async tx=>{
   await tx.$queryRaw`SELECT id FROM "OnlineOrder" WHERE id=${id}::uuid FOR UPDATE`;
   const fresh=await tx.onlineOrder.findUniqueOrThrow({where:{id}});
   if(fresh.status==='REFUNDED')return fresh;
   if(!['CAPTURED','REFUNDING'].includes(fresh.status))throw new ConflictException('Estado incompatible');
   if(fresh.paymentId){
    const paid=await tx.payment.findUniqueOrThrow({where:{id:fresh.paymentId},include:{authorization:true,transaction:true}});
    if(paid.status!=='CAPTURED')throw new ConflictException('Pago incompatible');
    if(paid.authorization?.dispensedAmount.gt(0))
     throw new ConflictException('El combustible despachado solo admite conciliación del excedente financiero');
    if(paid.authorization && !paid.transaction){
     if(paid.authorization.inventoryManaged) {
      const reservation=await tx.inventoryReservation.findUnique({where:{authorizationId:paid.authorization.id}});
      if(reservation)await releaseInventoryReservation(tx,reservation,`refund:${id}`,'Provider confirmed refund before dispense');
     }
     await tx.fuelAuthorization.update({where:{id:paid.authorization.id},data:{status:'RELEASED',outcome:'CANCELLED',releasedAmount:0}});
    }
    // A refund can be confirmed while the prepaid order still has no
    // FuelAuthorization. The payment intent already owns a PENDING_PAYMENT
    // reservation, so release that commitment only now that the provider's
    // refund is confirmed.
    if(!paid.transaction && !paid.authorization) {
     const reservation=await tx.inventoryReservation.findUnique({where:{operationId:fresh.operationId}});
     if(reservation && !['CANCELLED','CLOSED'].includes(reservation.status))
      await releaseInventoryReservation(tx,reservation,`refund:${id}`,'Provider confirmed refund before authorization');
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
   let recovered:ProviderOrder|null;
   try { recovered=await this.provider.findByReference(order.id); }
   catch(error) {
    if(order.paymentId)await this.db.atomic(async tx=>{
     const reservation=await tx.inventoryReservation.findUnique({where:{operationId:order.operationId}});
     if(reservation&&reservation.status!=='CANCELLED'&&reservation.status!=='CLOSED')
      await reviewInventoryReservation(tx,reservation.id,'Payment reference result is ambiguous');
    });
    throw error;
   }
   if(!recovered) {
    if(order.paymentId)await this.db.atomic(async tx=>{
     const reservation=await tx.inventoryReservation.findUnique({where:{operationId:order.operationId}});
     if(reservation&&reservation.status!=='CANCELLED'&&reservation.status!=='CLOSED')
      await reviewInventoryReservation(tx,reservation.id,'Payment provider has not resolved the order reference');
    });
    return order;
   }
   if(recovered.order_number!==order.id||recovered.amount!==order.amount.mul(100).toNumber()||recovered.currency_code!=='PEN')throw new ConflictException('Referencia recuperada incompatible');
   await this.db.onlineOrder.update({where:{id},data:{providerId:recovered.id,status:'PENDING'}});
   return this.status(id,actor);
  }
  let remote:ProviderOrder;
  try { remote=await this.provider.get(order.providerId); }
  catch(error) {
   if(order.paymentId)await this.db.atomic(async tx=>{
    const reservation=await tx.inventoryReservation.findUnique({where:{operationId:order.operationId}});
    if(reservation&&reservation.status!=='CANCELLED'&&reservation.status!=='CLOSED')
     await reviewInventoryReservation(tx,reservation.id,'Payment status could not be confirmed');
   });
   throw error;
  }
  if(remote.id!==order.providerId||remote.order_number!==order.id||remote.amount!==order.amount.mul(100).toNumber()||remote.currency_code!=='PEN')throw new ConflictException('Evento del proveedor incompatible');
  if(['failed','rejected','expired','cancelled'].includes(remote.state))return this.db.atomic(async tx=>{
   await tx.$queryRaw`SELECT id FROM "OnlineOrder" WHERE id=${id}::uuid FOR UPDATE`;
   const fresh=await tx.onlineOrder.findUniqueOrThrow({where:{id}});
   if(!['PENDING','CREATING'].includes(fresh.status))return fresh;
   const status=['cancelled','expired'].includes(remote.state)?'CANCELLED':'FAILED';
   if(fresh.paymentId)await tx.payment.update({where:{id:fresh.paymentId},data:{status:status==='FAILED'?'REJECTED':'CANCELLED'}});
   const reservation=await tx.inventoryReservation.findUnique({where:{operationId:fresh.operationId}});
   if(reservation)await releaseInventoryReservation(tx,reservation,`payment-rejected:${fresh.operationId}`,'Provider confirmed payment rejection');
   await tx.membership.updateMany({where:{welcomeReservedOperationId:fresh.operationId},data:{welcomeReservedOperationId:null}});
   await tx.paymentEvent.create({data:{eventKey:'terminal:'+id,orderId:id,paymentId:fresh.paymentId,kind:status,detail:'Estado confirmado consultando proveedor'}});
   return tx.onlineOrder.update({where:{id},data:{status}});
  });
  if(!verifiedPaid(remote,order)) {
   if(order.paymentId)await this.db.atomic(async tx=>{
    const reservation=await tx.inventoryReservation.findUnique({where:{operationId:order.operationId}});
    if(reservation&&reservation.status!=='CANCELLED'&&reservation.status!=='CLOSED')
     await reviewInventoryReservation(tx,reservation.id,'Payment provider returned an unrecognized state');
   });
   return order;
  }
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
    if(applied.gt(0))await tx.walletMovement.create({data:{membershipId:debt.membershipId,debtId:debt.id,transactionId:fresh.transactionId,kind:'DEBT_SETTLEMENT',amount:applied.negated(),balanceAfter:member.balance,operationId:fresh.id,note:fresh.providerId?.startsWith('demo:')?'Pago simulado DEMO':'Pago Culqi verificado por API'}});
    if(fresh.amount.gt(applied))await tx.walletMovement.create({data:{membershipId:debt.membershipId,kind:'RECHARGE',amount:fresh.amount.minus(applied),balanceAfter:member.balance,operationId:fresh.id,note:'Excedente de pago Culqi'}});
    await tx.payment.update({where:{transactionId:fresh.transactionId},data:{status:pending.isZero()?'CAPTURED':'PARTIAL',provider:fresh.providerId?.startsWith('demo:')?'DEMO':'CULQI'}});
    await tx.transaction.update({where:{id:fresh.transactionId},data:{status:pending.isZero()?'PAID':'PAYMENT_PENDING'}});
   }
   await tx.paymentEvent.create({data:{eventKey:'capture:'+id,orderId:id,paymentId:fresh.paymentId,kind:'CAPTURED',detail:fresh.providerId?.startsWith('demo:')?'Pago simulado DEMO confirmado en backend':'Pago verificado mediante API del proveedor'}});
   return tx.onlineOrder.update({where:{id},data:{status:'CAPTURED'}});
  });
 }
}
@Controller('online-orders')
export class OnlineOrdersController {
 constructor(private readonly service:OnlineOrdersService){}
 @Post() @MemberOrKiosk() create(@Body()dto:OrderDto,@CurrentActor()actor:Actor){return this.service.create(dto,actor);}
 @Post(':id/demo-confirm') @MemberOrKiosk() confirmDemo(@Param('id',new ParseUUIDPipe())id:string,@Body()dto:DemoConfirmationDto,@CurrentActor()actor:Actor){return this.service.confirmDemo(id,dto,actor);}
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
