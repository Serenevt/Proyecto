import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  SetMetadata,
} from '@nestjs/common';
import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  Actor,
  CurrentActor,
  SupervisorOnly,
  TerminalOnly,
} from '../auth/access';
import { OperationsService } from './operations.service';

class StationDto {
  @IsUUID() stationId: string;
}
class ShiftDto {
  @IsUUID() shiftId: string;
}
class OperationDto {
  @IsUUID('4') operationId: string;
}
class ResolutionDto {
  @IsString() @MinLength(3) @MaxLength(200) reason: string;
}
class GrantDto {
  @IsUUID() userId: string;
  @IsString() @MinLength(3) @MaxLength(200) reason: string;
}
class AssignSupervisorDto extends GrantDto {
  @IsUUID() stationId: string;
}
class PumpDto {
  @IsUUID() stationId: string;
  @Matches(/^[A-Z0-9-]{2,30}$/) code: string;
  @IsString() @MinLength(2) @MaxLength(80) name: string;
}
class TerminalDto {
  @IsUUID() stationId: string;
  @Matches(/^[A-Z0-9-]{2,30}$/) code: string;
}
class TerminalPumpDto {
  @IsUUID() pumpId: string;
}

const userId = (actor: Actor) => {
  if (actor.kind !== 'member') throw new Error('Usuario requerido');
  return actor.userId;
};
const terminalId = (actor: Actor) => {
  if (actor.kind !== 'terminal') throw new Error('Terminal requerida');
  return actor.terminalId;
};
const adminId = (actor: Actor) =>
  actor.kind === 'member' ? actor.userId : undefined;

@SupervisorOnly()
@Controller('supervisor')
export class SupervisorController {
  constructor(private readonly service: OperationsService) {}
  @Get('me/stations') stations(@CurrentActor() actor: Actor) {
    return this.service.stations(userId(actor));
  }
  @Get('shifts/current') currentShift(@CurrentActor() actor: Actor) {
    return this.service.currentShift(userId(actor));
  }
  @Post('shifts') open(@CurrentActor() actor: Actor, @Body() dto: StationDto) {
    return this.service.openShift(userId(actor), dto.stationId);
  }
  @Post('shifts/:id/suspend') suspend(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.shiftState(userId(actor), id, 'suspend');
  }
  @Post('shifts/:id/resume') resume(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.shiftState(userId(actor), id, 'resume');
  }
  @Post('shifts/:id/close') close(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.shiftState(userId(actor), id, 'close');
  }
  @Get('stations/:id/terminals') terminals(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.terminals(userId(actor), id);
  }
  @Post('terminals/:id/enable') enable(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShiftDto,
  ) {
    return this.service.enable(userId(actor), id, dto.shiftId);
  }
  @Post('terminals/:id/block') block(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.block(userId(actor), id);
  }
  @Post('terminals/:id/restore') restore(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.restore(userId(actor), id);
  }
  @Post('operations/:id/resolve') resolveOperation(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolutionDto,
  ) {
    return this.service.resolveOperation(userId(actor), id, dto.reason);
  }
  @Post('terminals/:id/pair') async pair(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.issueCredential(userId(actor), id);
  }
  @Post('terminals/:id/rotate') async rotate(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.issueCredential(userId(actor), id, true);
  }
  @Post('terminals/:id/revoke-session') async revoke(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revokeCredential(userId(actor), id);
  }
}

@TerminalOnly()
@Controller('terminal')
export class TerminalController {
  constructor(private readonly service: OperationsService) {}
  @Get('me') me(@CurrentActor() actor: Actor) {
    return this.service.terminalMe(terminalId(actor));
  }
  @Post('operations') open(
    @CurrentActor() actor: Actor,
    @Body() dto: OperationDto,
  ) {
    return this.service.startOperation(terminalId(actor), dto.operationId);
  }
  @Get('operations/:id') operation(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.operation(terminalId(actor), id);
  }
  @Post('operations/:id/close') close(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.closeOperation(terminalId(actor), id);
  }
}

@SetMetadata('access', 'admin')
@Controller('operational-admin')
export class OperationalAdminController {
  constructor(private readonly service: OperationsService) {}
  @Post('permissions/admin') grant(
    @CurrentActor() actor: Actor,
    @Body() dto: GrantDto,
  ) {
    return this.service.grantAdmin(dto.userId, dto.reason, adminId(actor));
  }
  @Post('permissions/admin/:id/revoke') revokeGrant(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revokeAdminGrant(id, adminId(actor));
  }
  @Post('supervisor-assignments') assign(
    @CurrentActor() actor: Actor,
    @Body() dto: AssignSupervisorDto,
  ) {
    return this.service.assignSupervisor(
      dto.userId,
      dto.stationId,
      dto.reason,
      adminId(actor),
    );
  }
  @Post('supervisor-assignments/:id/end') end(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.endSupervisorAssignment(id, adminId(actor));
  }
  @Post('pumps') pump(@CurrentActor() actor: Actor, @Body() dto: PumpDto) {
    return this.service.createPump(
      dto.stationId,
      dto.code,
      dto.name,
      adminId(actor),
    );
  }
  @Post('terminals') terminal(
    @CurrentActor() actor: Actor,
    @Body() dto: TerminalDto,
  ) {
    return this.service.createTerminal(dto.stationId, dto.code, adminId(actor));
  }
  @Post('terminals/:id/assign-pump') assignPump(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminalPumpDto,
  ) {
    return this.service.assignTerminal(id, dto.pumpId, adminId(actor));
  }
  @Post('terminal-pump-assignments/:id/end') endPump(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.endTerminalAssignment(id, adminId(actor));
  }
  @Post('terminals/:id/revoke') revoke(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revokeTerminal(id, adminId(actor));
  }
}
