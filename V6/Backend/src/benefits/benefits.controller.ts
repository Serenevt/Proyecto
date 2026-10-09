import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BenefitResponseDto } from '../common/response.dto';
import { Public } from '../auth/access';
import { BenefitsService } from './benefits.service';
@ApiTags('benefits')
@Controller('benefits')
export class BenefitsController {
  constructor(private readonly service: BenefitsService) {}
  @Public() @Get() @ApiOkResponse({ type: [BenefitResponseDto] }) list() {
    return this.service.list();
  }
}
