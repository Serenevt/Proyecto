import { ConflictException, Controller, Injectable, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KioskOnly } from '../auth/access';

@Injectable()
export class PaymentLifecycleService {
 constructor(private readonly db: PrismaService) {}
 // Internal simulated cash/card accounting only. Never claims a bank refund.
 refund(id: string) {
  return this.db.atomic(async tx => {
   await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${id}::uuid FOR UPDATE`;
   const payment=await tx.payment.findUnique({where:{id},include:{authorization:true,transaction:true}});
   if (!payment) throw new NotFoundException('Pago no encontrado');
   if (payment.status==='REFUNDED') return {payment,replayed:true,simulated:true};
   if (payment.status!=='CAPTURED' || payment.provider!=='DEMO' || !['EFECTIVO','TARJETA'].includes(payment.method)) throw new ConflictException('Reembolso requiere pago capturado y confirmación del proveedor correspondiente');
   const auth=payment.authorization;
   if (auth && auth.dispensedAmount.gt(0) && !payment.transaction) throw new ConflictException('Liquida primero el combustible despachado');
   if (auth && !payment.transaction) await tx.fuelAuthorization.update({where:{id:auth.id},data:{status:'RELEASED',outcome:'CANCELLED',releasedAmount:0}});
   if (payment.operationId) await tx.membership.updateMany({where:{welcomeReservedOperationId:payment.operationId},data:{welcomeReservedOperationId:null}});
   if (payment.transaction) {
    const purchase=payment.transaction;
    if (purchase.status!=='PAID') throw new ConflictException('Estado de compra incompatible');
    await tx.transaction.update({where:{id:purchase.id},data:{status:'REFUNDED'}});
    // Append a compensating movement; retain the original earned points audit.
    if (purchase.membershipId && purchase.pointsEarned) await tx.rewardMovement.create({data:{membershipId:purchase.membershipId,kind:'REFUND',refundPaymentId:payment.id,points:-purchase.pointsEarned}});
   }
   const updated=await tx.payment.update({where:{id},data:{status:'REFUNDED',refundedAmount:{increment:payment.amount}}});
   await tx.paymentEvent.create({data:{eventKey:'refund:'+id,paymentId:id,kind:'REFUNDED',detail:'Reembolso interno simulado; no hubo reembolso bancario'}});
   return {payment:updated,replayed:false,simulated:true};
  });
 }
}
@Controller('payments')
export class PaymentLifecycleController {
 constructor(private readonly service:PaymentLifecycleService) {}
 @Post(':id/refund') @KioskOnly()
 refund(@Param('id',new ParseUUIDPipe()) id:string) {return this.service.refund(id);}
}
