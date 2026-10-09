import { Injectable } from '@nestjs/common';
import { FuelsRepository } from './fuels.repository';
@Injectable()
export class FuelsService {
  constructor(private readonly repo: FuelsRepository) {}
  list() {
    return this.repo.list();
  }
}
