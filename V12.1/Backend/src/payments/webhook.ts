import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/access';
import { OnlineOrdersService } from './online-orders';

export class PaymentEventDto {
 @IsString() @MinLength(1) @MaxLength(100) eventId: string;
 @IsUUID() orderId: string;
 @IsIn(['PAID','FAILED','CANCELLED','REFUNDED']) type: string;
}

// Normalized adapter ingress. A commercial adapter must verify its provider's
// signature before forwarding here. No payload alone is proof of payment.
@Controller('payments')
export class PaymentWebhookController {
 constructor(private readonly service: OnlineOrdersService) {}
 @Public() @Post('webhook')
 receive(@Body() event: PaymentEventDto, @Headers('x-webhook-secret') secret: string) {
  const expected=process.env.PAYMENT_WEBHOOK_SECRET;
  if (!expected || !secret || !timingSafeEqual(createHash('sha256').update(expected).digest(),createHash('sha256').update(secret).digest())) throw new UnauthorizedException();
  return this.service.webhook(event);
 }
}
