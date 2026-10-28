import { Controller, Get, Param, ParseUUIDPipe, Query, SetMetadata } from '@nestjs/common';
import { PurchaseMode } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Actor, CurrentActor } from '../auth/access';
import { ControlCustomersService } from './control-customers.service';

class CustomerFilters {
  @IsOptional() @IsUUID() stationId?: string;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
}
class MembershipFilters extends CustomerFilters {
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: 'ACTIVE' | 'SUSPENDED';
}
class TransactionFilters extends CustomerFilters {
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsEnum(PurchaseMode) mode?: PurchaseMode;
  @IsOptional() @IsString() @MaxLength(30) method?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
const date = (value?: string, endOfDay = false) => {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-05:00`);
  const parsed = new Date(value);
  return parsed;
};
const controlActor = (actor: Actor) => actor as Extract<Actor, { kind: 'control' }>;

@Controller('control')
@SetMetadata('access', 'control')
export class ControlCustomersController {
  constructor(private readonly service: ControlCustomersService) {}

  @Get('customers') customers(@CurrentActor() actor: Actor, @Query() query: CustomerFilters) {
    return this.service.customers(controlActor(actor), query);
  }
  @Get('customers/:userId') customer(@CurrentActor() actor: Actor, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.customer(controlActor(actor), userId);
  }
  @Get('memberships') memberships(@CurrentActor() actor: Actor, @Query() query: MembershipFilters) {
    return this.service.memberships(controlActor(actor), query);
  }
  @Get('memberships/:membershipId') membership(@CurrentActor() actor: Actor, @Param('membershipId', ParseUUIDPipe) membershipId: string) {
    return this.service.membership(controlActor(actor), membershipId);
  }
  @Get('vehicles') vehicles(@CurrentActor() actor: Actor, @Query() query: CustomerFilters) {
    return this.service.vehicles(controlActor(actor), query);
  }
  @Get('transactions') transactions(@CurrentActor() actor: Actor, @Query() query: TransactionFilters) {
    return this.service.transactions(controlActor(actor), { ...query, from: date(query.from), to: date(query.to, true) });
  }
  @Get('transactions/:transactionId') transaction(@CurrentActor() actor: Actor, @Param('transactionId', ParseUUIDPipe) transactionId: string) {
    return this.service.transaction(controlActor(actor), transactionId);
  }
  @Get('receipts/:transactionId') receipt(@CurrentActor() actor: Actor, @Param('transactionId', ParseUUIDPipe) transactionId: string) {
    return this.service.receipt(controlActor(actor), transactionId);
  }
}
