import { Module } from '@nestjs/common';
import { FuelsController } from './fuels.controller';
import { FuelsService } from './fuels.service';
import { FuelsRepository } from './fuels.repository';
@Module({
  controllers: [FuelsController],
  providers: [FuelsService, FuelsRepository],
})
export class FuelsModule {}
