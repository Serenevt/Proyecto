import { Injectable } from '@nestjs/common';
import { StationsRepository } from './stations.repository';
@Injectable()
export class StationsService {
  constructor(private readonly repo: StationsRepository) {}
  list() {
    return this.repo.list();
  }
}
