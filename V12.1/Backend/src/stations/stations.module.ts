import { Module } from '@nestjs/common';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationsRepository } from './stations.repository';
@Module({
  controllers: [StationsController],
  providers: [StationsService, StationsRepository],
})
export class StationsModule {}
