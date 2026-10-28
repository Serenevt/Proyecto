import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Response } from 'express';
import {
  AdminControlPermission,
  AdminControlRole,
  OperationalIncidentStatus,
} from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Actor, CurrentActor, Public } from '../auth/access';
import { ControlService } from './control.service';

class AccessRequestDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsString() @MinLength(10) @MaxLength(72) password: string;
  @IsIn(['ADMIN', 'ENCARGADO']) role: AdminControlRole;
}
class VerifyDto {
  @IsString() @MinLength(20) @MaxLength(200) token: string;
}
class LoginDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(1) @MaxLength(72) password: string;
}
class ResendDto {
  @IsEmail() @MaxLength(254) email: string;
}
class ApprovalDto {
  @IsEnum(AdminControlRole) role: AdminControlRole;
  @IsArray()
  @IsEnum(AdminControlPermission, { each: true })
  permissions: AdminControlPermission[];
  @IsArray() @IsUUID(undefined, { each: true }) stationIds: string[];
}
class StatusDto {
  @IsString() @MinLength(3) @MaxLength(300) reason: string;
}
class IncidentStatusDto {
  @IsEnum(OperationalIncidentStatus) status: OperationalIncidentStatus;
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}
class ListControlIncidentsQuery {
  @IsUUID() stationId: string;
  @IsOptional()
  @IsEnum(OperationalIncidentStatus)
  status?: OperationalIncidentStatus;
}

@Controller('control')
export class ControlController {
  constructor(
    private readonly service: ControlService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('access-requests')
  @HttpCode(201)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  requestAccess(@Body() dto: AccessRequestDto) {
    return this.service.requestAccess(dto);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verifyEmail(@Body() dto: VerifyDto) {
    return this.service.verifyEmail(dto.token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  resendVerification(@Body() dto: ResendDto) {
    return this.service.resendVerification(dto.email);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.login(dto.email, dto.password);
    response.cookie('primax_control', result.token, {
      httpOnly: true,
      secure: this.config.get('APP_MODE') === 'production',
      sameSite: 'strict',
      path: '/api/v1/control',
      maxAge: 8 * 60 * 60 * 1000,
    });
    return result.context;
  }

  @Post('logout')
  @SetMetadata('access', 'control')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('primax_control', {
      httpOnly: true,
      secure: this.config.get('APP_MODE') === 'production',
      sameSite: 'strict',
      path: '/api/v1/control',
    });
    return { message: 'Sesión cerrada' };
  }

  @Get('session') @SetMetadata('access', 'control') session(
    @CurrentActor() actor: Actor,
  ) {
    return this.service.session(actor as Extract<Actor, { kind: 'control' }>);
  }

  @Get('accounts') @SetMetadata('access', 'control') accounts(
    @CurrentActor() actor: Actor,
  ) {
    return this.service.pending(actor as Extract<Actor, { kind: 'control' }>);
  }
  @Post('accounts/:userId/approve') @SetMetadata('access', 'control') approve(
    @CurrentActor() actor: Actor,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ApprovalDto,
  ) {
    return this.service.approve(
      actor as Extract<Actor, { kind: 'control' }>,
      userId,
      dto,
    );
  }
  @Post('accounts/:userId/access')
  @SetMetadata('access', 'control')
  updateAccess(
    @CurrentActor() actor: Actor,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ApprovalDto,
  ) {
    return this.service.approve(
      actor as Extract<Actor, { kind: 'control' }>,
      userId,
      dto,
      true,
    );
  }
  @Post('accounts/:userId/reject') @SetMetadata('access', 'control') reject(
    @CurrentActor() actor: Actor,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: StatusDto,
  ) {
    return this.service.setStatus(
      actor as Extract<Actor, { kind: 'control' }>,
      userId,
      'REJECTED',
      dto.reason,
    );
  }
  @Post('accounts/:userId/disable') @SetMetadata('access', 'control') disable(
    @CurrentActor() actor: Actor,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: StatusDto,
  ) {
    return this.service.setStatus(
      actor as Extract<Actor, { kind: 'control' }>,
      userId,
      'DISABLED',
      dto.reason,
    );
  }

  @Get('dashboard') @SetMetadata('access', 'control') dashboard(
    @CurrentActor() actor: Actor,
    @Query('stationId') stationId?: string,
  ) {
    return this.service.dashboard(
      actor as Extract<Actor, { kind: 'control' }>,
      stationId,
    );
  }
  @Get('incidents') @SetMetadata('access', 'control') incidents(
    @CurrentActor() actor: Actor,
    @Query() query: ListControlIncidentsQuery,
  ) {
    return this.service.incidents(
      actor as Extract<Actor, { kind: 'control' }>,
      query.stationId,
      query.status,
    );
  }
  @Get('incidents/:id') @SetMetadata('access', 'control') incident(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.incident(
      actor as Extract<Actor, { kind: 'control' }>,
      id,
    );
  }
  @Post('incidents/:id/status')
  @SetMetadata('access', 'control')
  updateIncident(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IncidentStatusDto,
  ) {
    return this.service.incidentStatus(
      actor as Extract<Actor, { kind: 'control' }>,
      id,
      dto.status,
      dto.reason,
    );
  }
}
