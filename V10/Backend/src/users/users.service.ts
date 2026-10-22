import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { RegisterDto } from '../auth/register.dto';
@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}
  register(dto: RegisterDto, passwordHash: string) {
    return this.repo.register(dto, passwordHash);
  }
  findByEmail(email: string) {
    return this.repo.findByEmail(email.trim().toLowerCase());
  }
  findByDni(dni: string) {
    return this.repo.findByDni(dni);
  }
  findById(id: string) {
    return this.repo.findById(id);
  }
}
