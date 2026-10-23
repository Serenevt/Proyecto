import { Injectable, ServiceUnavailableException } from '@nestjs/common';
export interface ProviderOrder { id: string; order_number: string; amount: number; currency_code: string; state: string; paid_at?: number | null; qr?: string | null }
export interface PaymentProvider {
 create(id: string, cents: number, customer: Customer): Promise<ProviderOrder>;
 get(id: string): Promise<ProviderOrder>;
}
export interface Customer { first_name: string; last_name: string; email: string; phone_number: string }
@Injectable()
export class CulqiProvider implements PaymentProvider {
 private async request(path: string, body?: unknown): Promise<ProviderOrder> {
  const key=process.env.CULQI_SECRET_KEY;
  const mode=process.env.PAYMENT_ENV || 'sandbox';
  if (!key || !key.startsWith(mode==='production'?'sk_live_':'sk_test_'))
   throw new ServiceUnavailableException('Configura credenciales Culqi del entorno seleccionado');
  const response=await fetch('https://api.culqi.com/v2/orders'+path,{
   method: body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','x-culqi-product':'online'},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000),
  });
  if(!response.ok) throw new ServiceUnavailableException('No se pudo confirmar la operaci?n con Culqi. Conserva el identificador y reconcilia antes de reintentar.');
  return await response.json() as ProviderOrder;
 }
 create(id:string,cents:number,customer:Customer){return this.request('',{amount:cents,currency_code:'PEN',description:'Abastecimiento FuelFlow',order_number:id,expiration_date:Math.floor(Date.now()/1000)+1800,confirm:true,client_details:customer});}
 get(id:string){return this.request('/'+encodeURIComponent(id));}
}
export function verifiedPaid(order:ProviderOrder,expected:{providerId:string|null;id:string;amount:{mul(n:number):{toNumber():number}}}) {
 return order.id===expected.providerId && order.order_number===expected.id && order.currency_code==='PEN' && order.amount===expected.amount.mul(100).toNumber() && order.state==='paid' && typeof order.paid_at==='number' && order.paid_at>0;
}
