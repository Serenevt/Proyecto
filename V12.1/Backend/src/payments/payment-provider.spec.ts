import { Prisma } from '@prisma/client';
import { verifiedPaid, ProviderOrder } from './payment-provider';
import { OnlineOrdersController, OnlineOrdersService } from './online-orders';
const expected={id:'intent',providerId:'ord_test_1',amount:new Prisma.Decimal(60)};
const paid:ProviderOrder={id:'ord_test_1',order_number:'intent',amount:6000,currency_code:'PEN',state:'paid',paid_at:123};
describe('Provider confirmation boundary',()=>{
 test('accepts authoritative paid order matching amount/currency/reference',()=>expect(verifiedPaid(paid,expected)).toBe(true));
 test.each([{state:'pending'},{paid_at:null},{amount:5999},{currency_code:'USD'},{id:'other'},{order_number:'other'}])('rejects mismatched or unpaid provider response %p',patch=>expect(verifiedPaid({...paid,...patch},expected)).toBe(false));
 test('rejects missing webhook secret before contacting provider',()=>{const service={status:jest.fn()};const controller=new OnlineOrdersController(service as unknown as OnlineOrdersService);delete process.env.PAYMENT_WEBHOOK_SECRET;expect(()=>controller.notify('id','')).toThrow();expect(service.status).not.toHaveBeenCalled();});
 test('valid webhook only triggers authoritative API reconciliation',()=>{process.env.PAYMENT_WEBHOOK_SECRET='test-secret';const service={status:jest.fn()};const controller=new OnlineOrdersController(service as unknown as OnlineOrdersService);controller.notify('id','test-secret');expect(service.status).toHaveBeenCalledWith('id');delete process.env.PAYMENT_WEBHOOK_SECRET;});
});
