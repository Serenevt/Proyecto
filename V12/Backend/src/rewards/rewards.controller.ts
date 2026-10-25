import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../auth/access';
import { RedeemResponseDto } from '../common/response.dto';
import { RedeemDto } from './redeem.dto';
import { RewardsService } from './rewards.service';
@ApiTags('rewards')
@ApiBearerAuth()
@Controller('rewards')
export class RewardsController {
  constructor(private readonly service: RewardsService) {}
  @Post('redeem')
  @ApiCreatedResponse({
    type: RedeemResponseDto,
    description:
      'Cupón emitido y débito de puntos atómicos. El id del canje identifica el cupón.',
  })
  redeem(@CurrentActor() actor: { userId: string }, @Body() dto: RedeemDto) {
    return this.service.redeem(actor.userId, dto);
  }
}
