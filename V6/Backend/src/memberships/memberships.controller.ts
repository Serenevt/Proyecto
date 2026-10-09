import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  MembershipResponseDto,
  RedemptionResponseDto,
  RewardResponseDto,
  TransactionViewDto,
} from '../common/response.dto';
import { CurrentActor } from '../auth/access';
import { PaginationDto } from '../common/pagination.dto';
import { MembershipsService } from './memberships.service';
@ApiTags('memberships')
@ApiBearerAuth()
@Controller('memberships/me')
export class MembershipsController {
  constructor(private readonly service: MembershipsService) {}
  @Get() @ApiOkResponse({ type: MembershipResponseDto }) me(
    @CurrentActor() actor: { userId: string },
  ) {
    return this.service.me(actor.userId);
  }
  @Get('transactions')
  @ApiOkResponse({ type: [TransactionViewDto] })
  transactions(
    @CurrentActor() actor: { userId: string },
    @Query() query: PaginationDto,
  ) {
    return this.service.transactions(actor.userId, query);
  }
  @Get('rewards') @ApiOkResponse({ type: [RewardResponseDto] }) rewards(
    @CurrentActor() actor: { userId: string },
    @Query() query: PaginationDto,
  ) {
    return this.service.rewards(actor.userId, query);
  }
  @Get('redemptions')
  @ApiOkResponse({ type: [RedemptionResponseDto] })
  redemptions(
    @CurrentActor() actor: { userId: string },
    @Query() query: PaginationDto,
  ) {
    return this.service.redemptions(actor.userId, query);
  }
}
