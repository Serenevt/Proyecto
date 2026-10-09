import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { MembershipsRepository } from './memberships.repository';
@Module({
  controllers: [MembershipsController],
  providers: [MembershipsService, MembershipsRepository],
})
export class MembershipsModule {}
