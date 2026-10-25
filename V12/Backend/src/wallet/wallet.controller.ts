import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Actor, CurrentActor } from '../auth/access';
import { RechargeDto } from './recharge.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('memberships/me')
export class WalletController {
  constructor(private readonly service: WalletService) {}
  @Post('recharges')
  @ApiCreatedResponse({
    description: 'Acreditación DEMO de saldo; no ejecuta ningún cobro real.',
  })
  recharge(@CurrentActor() actor: Actor, @Body() dto: RechargeDto) {
    return this.service.recharge((actor as { userId: string }).userId, dto);
  }
  @Get('wallet')
  @ApiOkResponse({
    description: 'Saldo disponible y libro mayor de movimientos.',
  })
  wallet(@CurrentActor() actor: Actor) {
    return this.service.history((actor as { userId: string }).userId);
  }
}
