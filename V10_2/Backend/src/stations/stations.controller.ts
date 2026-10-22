import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { StationResponseDto } from '../common/response.dto';
import { Public } from '../auth/access';
import { StationsService } from './stations.service';
@ApiTags('stations')
@Controller('stations')
export class StationsController {
  constructor(private readonly service: StationsService) {}
  @Public() @Get() @ApiOkResponse({ type: [StationResponseDto] }) list() {
    return this.service.list();
  }
}
