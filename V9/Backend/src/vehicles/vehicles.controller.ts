import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { VehicleResponseDto } from '../common/response.dto';
import { Actor, CurrentActor, MemberOrKiosk } from '../auth/access';
import { PaginationDto } from '../common/pagination.dto';
import { PlateDto } from './plate.dto';
import { VehiclesService } from './vehicles.service';
@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly service: VehiclesService) {}
  @Get() @ApiOkResponse({ type: [VehicleResponseDto] }) list(
    @CurrentActor() actor: Actor,
    @Query() query: PaginationDto,
  ) {
    return this.service.list(actor, query);
  }
  @Get(':plate')
  @MemberOrKiosk()
  @ApiSecurity('kiosk')
  @ApiOkResponse({ type: VehicleResponseDto })
  find(@Param() params: PlateDto, @CurrentActor() actor: Actor) {
    return this.service.findByPlate(params.plate, actor);
  }
}
