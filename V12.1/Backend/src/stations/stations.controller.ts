import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { StationResponseDto } from '../common/response.dto';
import { Actor, CurrentActor, Public } from '../auth/access';
import { StationsService } from './stations.service';
@ApiTags('stations')
@Controller('stations')
export class StationsController {
  constructor(private readonly service: StationsService) {}
  @Public() @Get() @ApiOkResponse({ type: [StationResponseDto] }) async list(
    @CurrentActor() actor?: Actor,
  ) {
    const rows = await this.service.list();
    return actor?.kind === 'kiosk' && actor.stationId
      ? rows.filter((row) => row.id === actor.stationId)
      : rows;
  }
}
