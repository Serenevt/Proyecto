import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
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
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly service: KioskService, private readonly jwt: JwtService, private readonly db: PrismaService) {}
  @Get() status(@Req() req: Request) {
    return this.service.status(req);
  }
  @Post('login') login(@Req() req: Request, @Body() body: OperatorLogin) {
    return this.service.login(req, body);
  }
  @Post('supervisor-bootstrap') async supervisorBootstrap(@Req() req: Request) {
    this.service.verifyGateway(req);
    const bearer = req.header('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!bearer) throw new UnauthorizedException('Supervisor requerido');
    let payload: { sub?: string; ver?: number };
    try { payload = await this.jwt.verifyAsync(bearer); }
    catch { throw new UnauthorizedException('Supervisor no autenticado'); }
    if (!payload.sub) throw new UnauthorizedException('Supervisor no autenticado');
    const user = await this.db.user.findUnique({ where: { id: payload.sub } });
    if (!user?.active || user.authVersion !== payload.ver) throw new UnauthorizedException('Supervisor no autenticado');
    return this.service.bootstrapSupervisor(req, user.id);
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
