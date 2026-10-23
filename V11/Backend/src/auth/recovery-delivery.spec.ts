import { ConfigService } from '@nestjs/config';
import { writeFile } from 'node:fs/promises';
import { RecoveryDelivery } from './recovery-delivery';
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));
describe('Recovery delivery has no fake inbox', () => {
  beforeEach(() => jest.clearAllMocks());
  it('disabled mode writes nothing and never simulates an external provider', async () => {
    await new RecoveryDelivery(
      new ConfigService({ PASSWORD_RESET_DELIVERY: 'disabled' }),
    ).send('test@example.test', '12345678', new Date());
    expect(writeFile).not.toHaveBeenCalled();
  });
  it('legacy demo mode rejects fake mailboxes and never writes recovery secrets', async () => {
    await expect(new RecoveryDelivery(new ConfigService({ PASSWORD_RESET_DELIVERY: 'demo' })).send('test@example.test', '12345678', new Date())).rejects.toThrow('fake mailboxes');
    expect(writeFile).not.toHaveBeenCalled();
  });
});
