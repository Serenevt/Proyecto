import { Module } from '@nestjs/common';
import {
  OperationalAdminController,
  SupervisorController,
  TerminalController,
} from './operations.controller';
import { OperationsService } from './operations.service';
import { IncidentsModule } from '../incidents/incidents.module';

@Module({
  controllers: [
    SupervisorController,
    TerminalController,
    OperationalAdminController,
  ],
  imports: [IncidentsModule],
  providers: [OperationsService],
})
export class OperationsModule {}
