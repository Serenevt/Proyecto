import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  SetMetadata,
} from '@nestjs/common';
import {
  InventoryMovementKind,
  PurchaseMode,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Actor, CurrentActor } from '../auth/access';
import { ControlOperationsService } from './control-operations.service';

class ControlOperationFilters {
  @IsOptional() @IsUUID() stationId?: string;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsEnum(PurchaseMode) mode?: PurchaseMode;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

class ControlStationFilter {
  @IsOptional() @IsUUID() stationId?: string;
}

class ControlMovementFilters {
  @IsUUID() stationId: string;
  @IsOptional() @IsUUID() fuelId?: string;
  @IsOptional() @IsEnum(InventoryMovementKind) kind?: InventoryMovementKind;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

class InventoryReceiptDto {
  @IsUUID() requestId: string;
  @IsUUID() stationId: string;
  @IsUUID() fuelId: string;
  @IsString() @Matches(/^\d{1,8}(?:\.\d{1,6})?$/) liters: string;
  @IsOptional() @IsString() @MaxLength(160) reference?: string;
}

class TerminalStatusDto {
  @IsIn(['OUT_OF_SERVICE', 'RESTORE']) action: 'OUT_OF_SERVICE' | 'RESTORE';
}

class AuditFilters {
  @IsOptional() @IsUUID() stationId?: string;
  @IsOptional() @IsUUID() actorUserId?: string;
  @IsOptional() @IsString() @MaxLength(80) action?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

const date = (value?: string) => (value ? new Date(value) : undefined);
const controlActor = (actor: Actor) =>
  actor as Extract<Actor, { kind: 'control' }>;

@Controller('control')
@SetMetadata('access', 'control')
export class ControlOperationsController {
  constructor(private readonly service: ControlOperationsService) {}

  @Get('operations') operations(
    @CurrentActor() actor: Actor,
    @Query() query: ControlOperationFilters,
  ) {
    return this.service.operations(controlActor(actor), {
      stationId: query.stationId,
      status: query.status,
      mode: query.mode,
      from: date(query.from),
      to: date(query.to),
    });
  }

  @Get('operations/:operationId') operationDetail(
    @CurrentActor() actor: Actor,
    @Param('operationId', ParseUUIDPipe) operationId: string,
  ) {
    return this.service.operationDetail(controlActor(actor), operationId);
  }

  @Get('terminals') terminals(
    @CurrentActor() actor: Actor,
    @Query() query: ControlStationFilter,
  ) {
    return this.service.terminals(controlActor(actor), query.stationId);
  }

  @Post('terminals/:id/status') terminalStatus(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminalStatusDto,
  ) {
    return this.service.terminalStatus(controlActor(actor), id, dto.action);
  }

  @Get('inventory') inventory(
    @CurrentActor() actor: Actor,
    @Query() query: ControlStationFilter,
  ) {
    return this.service.inventory(controlActor(actor), query.stationId);
  }

  @Get('inventory/movements') movements(
    @CurrentActor() actor: Actor,
    @Query() query: ControlMovementFilters,
  ) {
    return this.service.movements(controlActor(actor), {
      ...query,
      from: date(query.from),
      to: date(query.to),
    });
  }

  @Post('inventory/receipts') receiveInventory(
    @CurrentActor() actor: Actor,
    @Body() dto: InventoryReceiptDto,
  ) {
    return this.service.receiveInventory(controlActor(actor), dto);
  }

  @Get('inventory/:stationId/:fuelId/reconciliation') reconciliation(
    @CurrentActor() actor: Actor,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Param('fuelId', ParseUUIDPipe) fuelId: string,
  ) {
    return this.service.reconciliation(controlActor(actor), stationId, fuelId);
  }

  @Post('inventory/:stationId/:fuelId/reconcile') reconcile(
    @CurrentActor() actor: Actor,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Param('fuelId', ParseUUIDPipe) fuelId: string,
  ) {
    return this.service.reconcile(controlActor(actor), stationId, fuelId);
  }

  @Get('audit') audit(
    @CurrentActor() actor: Actor,
    @Query() query: AuditFilters,
  ) {
    return this.service.audit(controlActor(actor), {
      stationId: query.stationId,
      actorUserId: query.actorUserId,
      action: query.action,
      from: date(query.from),
      to: date(query.to),
    });
  }
}
