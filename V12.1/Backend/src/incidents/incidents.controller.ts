import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { OperationalIncidentStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentActor, Actor, SupervisorOnly } from '../auth/access';
import { IncidentsService } from './incidents.service';

class ListIncidentsQuery {
  @IsUUID() stationId: string;
  @IsOptional()
  @IsEnum(OperationalIncidentStatus)
  status?: OperationalIncidentStatus;
}

class IncidentStatusDto {
  @IsEnum(OperationalIncidentStatus) status: OperationalIncidentStatus;
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

function userId(actor: Actor) {
  if (actor.kind !== 'member') throw new Error('Supervisor requerido');
  return actor.userId;
}

@SupervisorOnly()
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Query() query: ListIncidentsQuery) {
    return this.service.list(userId(actor), query.stationId, query.status);
  }

  @Get(':id')
  detail(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(userId(actor), id);
  }

  @Post(':id/status')
  changeStatus(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IncidentStatusDto,
  ) {
    return this.service.changeStatus(userId(actor), id, dto.status, dto.reason);
  }
}
