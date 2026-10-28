import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { ControlController } from './control.controller';
import { ControlService } from './control.service';

describe('Primax Control auth cookie transport', () => {
  it.each([
    ['local', false],
    ['academic', true],
    ['production', true],
  ])('uses Secure=%s only when HTTPS is required', async (mode, secure) => {
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;
    const service = { login: jest.fn().mockResolvedValue({ token: 'fixture', context: {} }) } as unknown as ControlService;
    const config = { get: jest.fn().mockReturnValue(mode) } as unknown as ConfigService;
    const controller = new ControlController(service, config);

    await controller.login({ email: 'admin@example.test', password: 'fixture' }, response);
    expect(response.cookie).toHaveBeenCalledWith('primax_control', 'fixture', {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api/v1/control',
      maxAge: 8 * 60 * 60 * 1000,
    });
    controller.logout(response);
    expect(response.clearCookie).toHaveBeenCalledWith('primax_control', {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api/v1/control',
    });
  });
});
