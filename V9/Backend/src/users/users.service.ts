import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';
@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}
  findByEmail(email: string) {
    return this.repo.findByEmail(email.trim().toLowerCase());
  }
  findById(id: string) {
    return this.repo.findById(id);
  }
}
