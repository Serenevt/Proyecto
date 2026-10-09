import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FuelResponseDto } from '../common/response.dto';
import { Public } from '../auth/access';
import { FuelsService } from './fuels.service';
@ApiTags('fuels')
@Controller('fuels')
export class FuelsController {
  constructor(private readonly service: FuelsService) {}
  @Public() @Get() @ApiOkResponse({ type: [FuelResponseDto] }) list() {
    return this.service.list();
  }
}
