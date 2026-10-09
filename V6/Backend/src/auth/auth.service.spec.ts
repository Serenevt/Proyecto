import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
describe('AuthService', () => {
  const users = { findByEmail: jest.fn() };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };
  const service = new AuthService(
    users as unknown as UsersService,
    jwt as unknown as JwtService,
  );
  beforeAll(async () =>
    users.findByEmail.mockResolvedValue({
      id: 'user',
      name: 'Diego',
      email: 'demo@primaxprime.pe',
      active: true,
      passwordHash: await hash('FixtureOnly123', 4),
    }),
  );
  it('login correcto devuelve JWT sin hash', async () => {
    const result = await service.login({
      email: 'demo@primaxprime.pe',
      password: 'FixtureOnly123',
    });
    expect(result.accessToken).toBe('signed-token');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'user' });
  });
  it('rechaza contraseña incorrecta', async () => {
    await expect(
      service.login({ email: 'demo@primaxprime.pe', password: 'incorrecta' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rechaza correo desconocido', async () => {
    users.findByEmail.mockResolvedValueOnce(null);
    await expect(
      service.login({ email: 'missing@example.com', password: 'FixtureOnly123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rechaza usuario inactivo aunque la contraseña sea correcta', async () => {
    users.findByEmail.mockResolvedValueOnce({
      active: false,
      passwordHash: await hash('FixtureOnly123', 4),
    });
    await expect(
      service.login({ email: 'demo@primaxprime.pe', password: 'FixtureOnly123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
