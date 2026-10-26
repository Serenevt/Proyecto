import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Request } from 'express';
import { Public } from '../auth/access';
import { KioskService } from './kiosk.service';

class OperatorLogin {
  @IsString() @MinLength(1) @MaxLength(80) username: string;
  @IsString() @MinLength(1) @MaxLength(72) password: string;
}
class TargetOperation {
  @IsIn(['GET', 'POST']) method: string;
  @IsString() @MaxLength(200) path: string;
  @IsOptional() @IsObject() body?: Record<string, unknown>;
}
@Public()
@Controller('kiosk/session')
export class KioskController {
  constructor(private readonly service: KioskService) {}
  @Get() status(@Req() req: Request) {
    return this.service.status(req);
  }
  @Post('login') login(@Req() req: Request, @Body() body: OperatorLogin) {
    return this.service.login(req, body);
  }
  @Post('logout') logout(@Req() req: Request) {
    return this.service.logout(req);
  }
  @Post('authorize') async authorize(
    @Req() req: Request,
    @Body() body: TargetOperation,
  ) {
    const actor = await this.service.authorize(req, body);
    return { allowed: true, stationId: actor.stationId };
  }
}
