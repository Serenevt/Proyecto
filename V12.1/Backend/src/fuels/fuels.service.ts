import { Injectable } from '@nestjs/common';
import { FuelsRepository } from './fuels.repository';
@Injectable()
export class FuelsService {
  constructor(private readonly repo: FuelsRepository) {}
  inventory() { return this.repo.inventory(); }
  list() {
    return this.repo.list();
  }
}
