import { BadRequestException, Body, ConflictException, Controller, Get, Headers, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, UnauthorizedException } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, CurrentActor, MemberOrKiosk, Public } from '../auth/access';
import { CreateAuthorizationDto } from '../transactions/create-authorization.dto';
import { normalizePlate } from '../vehicles/plate.dto';
import { CulqiProvider, verifiedPaid } from './payment-provider';
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
 constructor(private readonly db:PrismaService,private readonly provider:CulqiProvider){}
 async create(dto:OrderDto,actor:Actor){
  if(!dto.customer)throw new BadRequestException('Datos del cliente requeridos');
  if(Boolean(dto.transactionId)===Boolean(dto.authorization))throw new BadRequestException('Indica compra o cobro pendiente');
  const requestHash=createHash('sha256').update(JSON.stringify(dto)).digest('hex');
  const existing=await this.db.onlineOrder.findUnique({where:{operationId:dto.operationId}});
  if(existing){this.owns(existing,actor);if(existing.requestHash!==requestHash)throw new ConflictException('operationId ya usado');return existing;}
  const order=await this.db.atomic(async tx=>{
   let amount:Prisma.Decimal; let paymentId:string|undefined; let userId:string|undefined;
   if(dto.transactionId){
    if(actor.kind!=='member')throw new UnauthorizedException();
    const debt=await tx.membershipDebt.findUnique({where:{transactionId:dto.transactionId},include:{membership:true}});
    if(!debt||debt.membership.userId!==actor.userId||debt.amountPending.lte(0))throw new NotFoundException('Cobro pendiente no encontrado');
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
    const payment=await tx.payment.create({data:{operationId:a.operationId,requestHash:hash,amount,method:dto.method,status:'PENDING',provider:'CULQI',unitPrice:fuel.pricePerGallon}});
    paymentId=payment.id;
   }
   if(amount.lt(6)||amount.gt(7000))throw new BadRequestException('Culqi requiere un monto entre S/6 y S/7000');
   return tx.onlineOrder.create({data:{operationId:dto.operationId,requestHash,amount,method:dto.method,userId,paymentId,transactionId:dto.transactionId}});
  });
  // Persist the intent before the external side effect. An ambiguous timeout remains
  // CREATING for reconciliation; never create a second provider charge automatically.
  const remote=await this.provider.create(order.id,order.amount.mul(100).toNumber(),dto.customer);
  if(remote.order_number!==order.id||remote.amount!==order.amount.mul(100).toNumber()||remote.currency_code!=='PEN')throw new ConflictException('Respuesta de proveedor incompatible');
  const qr=remote.qr&&new URL(remote.qr).protocol==='https:'?remote.qr:null;
  return this.db.onlineOrder.update({where:{id:order.id},data:{providerId:remote.id,qr,status:'PENDING'}});
 }
 private owns(order:{userId:string|null},actor:Actor){if(actor.kind==='member'&&order.userId!==actor.userId)throw new NotFoundException();if(actor.kind==='kiosk'&&order.userId)throw new NotFoundException();}
 async status(id:string,actor?:Actor){
  const order=await this.db.onlineOrder.findUnique({where:{id}});if(!order)throw new NotFoundException();if(actor)this.owns(order,actor);
  if(order.status==='CAPTURED'||!order.providerId)return order;
  const remote=await this.provider.get(order.providerId);
  if(!verifiedPaid(remote,order))return order;
  return this.db.atomic(async tx=>{
   await tx.$queryRaw`SELECT id FROM "OnlineOrder" WHERE id=${id}::uuid FOR UPDATE`;
   const fresh=await tx.onlineOrder.findUniqueOrThrow({where:{id}});if(fresh.status==='CAPTURED')return fresh;
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
    await tx.walletMovement.create({data:{membershipId:debt.membershipId,debtId:debt.id,transactionId:fresh.transactionId,kind:'DEBT_SETTLEMENT',amount:applied.negated(),balanceAfter:member.balance,operationId:fresh.id,note:'Pago Culqi verificado por API'}});
    if(fresh.amount.gt(applied))await tx.walletMovement.create({data:{membershipId:debt.membershipId,kind:'RECHARGE',amount:fresh.amount.minus(applied),balanceAfter:member.balance,operationId:fresh.id,note:'Excedente de pago Culqi'}});
    await tx.payment.update({where:{transactionId:fresh.transactionId},data:{status:pending.isZero()?'CAPTURED':'PARTIAL',provider:'CULQI'}});
    await tx.transaction.update({where:{id:fresh.transactionId},data:{status:pending.isZero()?'PAID':'PAYMENT_PENDING'}});
   }
   return tx.onlineOrder.update({where:{id},data:{status:'CAPTURED'}});
  });
 }
}
@Controller('online-orders')
export class OnlineOrdersController {
 constructor(private readonly service:OnlineOrdersService){}
 @Post() @MemberOrKiosk() create(@Body()dto:OrderDto,@CurrentActor()actor:Actor){return this.service.create(dto,actor);}
 @Get(':id') @MemberOrKiosk() status(@Param('id',new ParseUUIDPipe())id:string,@CurrentActor()actor:Actor){return this.service.status(id,actor);}
 @Post(':id/notify') @Public() notify(@Param('id',new ParseUUIDPipe())id:string,@Headers('x-webhook-secret')secret:string){
  const expected=process.env.PAYMENT_WEBHOOK_SECRET;
  if(!expected||!secret||!timingSafeEqual(createHash('sha256').update(secret).digest(),createHash('sha256').update(expected).digest()))throw new UnauthorizedException();
  // Payload is never evidence of payment: re-fetch authoritative provider state.
  return this.service.status(id);
 }
}
