import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FuelResponseDto } from '../common/response.dto';
import { Actor, CurrentActor, Public } from '../auth/access';
import { FuelsService } from './fuels.service';
@ApiTags('fuels')
@Controller('fuels')
export class FuelsController {
  constructor(private readonly service: FuelsService) {}
  @Public() @Get('inventory') async inventory(@CurrentActor() actor?: Actor) {
    const rows = await this.service.inventory();
    return actor?.kind === 'kiosk' && actor.stationId
      ? rows.filter((row) => row.stationId === actor.stationId)
      : rows;
  }
  @Public() @Get() @ApiOkResponse({ type: [FuelResponseDto] }) list() {
    return this.service.list();
  }
}
