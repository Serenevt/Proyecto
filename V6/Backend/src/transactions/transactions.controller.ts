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
import { Actor, CurrentActor, KioskOnly, MemberOrKiosk } from '../auth/access';
import { CreateTransactionDto } from './create-transaction.dto';
import { TransactionResponseDto } from './transaction-response.dto';
import { TransactionsService } from './transactions.service';
@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}
  @Post()
  @KioskOnly()
  @ApiSecurity('kiosk')
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @ApiConflictResponse({
    description: 'operationId reutilizado con datos distintos',
  })
  create(@Body() dto: CreateTransactionDto) {
    return this.service.create(dto);
  }
  @Get(':id')
  @MemberOrKiosk()
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
