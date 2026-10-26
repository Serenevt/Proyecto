import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/access';
import { HealthService } from './health.service';
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly service: HealthService) {}
  @Get()
  @Public()
  @SkipThrottle()
  @ApiOkResponse({ schema: { example: { status: 'ok', database: 'up' } } })
  check() {
    return this.service.check();
  }
}
