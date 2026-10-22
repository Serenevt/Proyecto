import { Injectable } from '@nestjs/common';
import { BenefitsRepository } from './benefits.repository';
@Injectable()
export class BenefitsService {
  constructor(private readonly repo: BenefitsRepository) {}
  list() {
    return this.repo.list();
  }
}
