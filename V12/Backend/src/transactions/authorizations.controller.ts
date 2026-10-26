import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AlertsService } from '../alerts/alerts.service';
import { KioskOnly, StagingFuelFlow } from '../auth/access';
import { AuthorizationsService } from './authorizations.service';
import { CreateAuthorizationDto } from './create-authorization.dto';
import { DispenseProgressDto } from './dispense-progress.dto';

@ApiTags('authorizations')
@Controller('authorizations')
export class AuthorizationsController {
  constructor(private readonly service: AuthorizationsService, private readonly alerts: AlertsService) {}
  @Post()
  @KioskOnly()
  @StagingFuelFlow('authorization')
  @ApiSecurity('kiosk')
  @ApiCreatedResponse({
    description: 'Reserva saldo para un abastecimiento postpago.',
  })
  @ApiConflictResponse({
    description: 'operationId reutilizado con datos distintos',
  })
  async create(@Body() dto: CreateAuthorizationDto) {
    if (dto.mode !== 'PREPAGO' && dto.membershipCode) await this.alerts.checkPlate(dto.plate, dto.membershipCode, dto.operationId);
    return this.service.create(dto);
  }
  @Post(':id/intervention')
  @KioskOnly()
  @StagingFuelFlow('write')
  intervention(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.intervention(id);
  }
  @Post(':id/progress')
  @KioskOnly()
  @StagingFuelFlow('write')
  @ApiSecurity('kiosk')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Avance validado del abastecimiento. El cierre debe coincidir con este registro.',
  })
  progress(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DispenseProgressDto,
  ) {
    return this.service.progress(id, dto);
  }
  @Get(':id')
  @KioskOnly()
  @StagingFuelFlow('read')
  @ApiSecurity('kiosk')
  @ApiOkResponse({
    description:
      'Estado de la reserva, para recuperar una operación interrumpida.',
  })
  status(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.status(id);
  }
  @Get()
  @KioskOnly()
  @ApiSecurity('kiosk')
  @ApiOkResponse({
    description:
      'Reservas antiguas sin liquidar, solo para revisión. No las libera.',
  })
  pending(
    @Query('olderThanMinutes', new ParseIntPipe()) olderThanMinutes: number,
  ) {
    if (!Number.isInteger(olderThanMinutes) || olderThanMinutes < 1)
      throw new BadRequestException(
        'olderThanMinutes debe ser un entero positivo',
      );
    return this.service.pendingBefore(olderThanMinutes);
  }
  @Post(':id/release')
  @KioskOnly()
  @StagingFuelFlow('write')
  @ApiSecurity('kiosk')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Reserva liberada sin consumo.' })
  release(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.release(id);
  }
}
