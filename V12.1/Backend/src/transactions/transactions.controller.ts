import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { TransactionViewDto } from '../common/response.dto';
import { Actor, CurrentActor, KioskOnly, MemberOrKiosk, StagingFuelFlow } from '../auth/access';
import { CreateTransactionDto } from './create-transaction.dto';
import { TransactionResponseDto } from './transaction-response.dto';
import { TransactionsService } from './transactions.service';
import { AlertsService } from '../alerts/alerts.service';
@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService, private readonly alerts: AlertsService) {}
  @Post()
  @KioskOnly()
  @StagingFuelFlow('transaction')
  @ApiSecurity('kiosk')
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @ApiConflictResponse({
    description: 'operationId reutilizado con datos distintos',
  })
  async create(@Body() dto: CreateTransactionDto, @CurrentActor() actor: Actor) {
    if (dto.mode === 'POSTPAGO' && dto.authorizationId)
      await this.alerts.checkAuthorization(dto.plate, dto.authorizationId, dto.operationId);
    return this.service.create(dto, actor);
  }
  @Get(':id')
  @MemberOrKiosk()
  @StagingFuelFlow('read')
  @ApiBearerAuth()
  @ApiSecurity('kiosk')
  @ApiOkResponse({ type: TransactionViewDto })
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.service.get(id, actor);
  }
}
