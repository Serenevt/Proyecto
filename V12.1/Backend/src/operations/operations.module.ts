import { Module } from '@nestjs/common';
import {
  OperationalAdminController,
  SupervisorController,
  TerminalController,
} from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  controllers: [
    SupervisorController,
    TerminalController,
    OperationalAdminController,
  ],
  providers: [OperationsService],
})
export class OperationsModule {}
