import { ConfigService } from '@nestjs/config';
import { KioskStore } from './redis-store';
describe('Redis REST storage', () => {
  const store = new KioskStore(
    new ConfigService({
      KIOSK_REDIS_REST_URL: 'https://redis.example',
      KIOSK_REDIS_REST_TOKEN: 'fictional-token',
      KIOSK_SESSION_NAMESPACE: 'test',
    }),
  );
  afterEach(() => jest.restoreAllMocks());
  it('uses an atomic increment with expiry for cross-instance throttling', async () => {
    const fetcher = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ result: 6 }));
    expect(await store.limit('operator-login', 5, 900)).toBe(false);
    const options = fetcher.mock.calls[0][1]!;
    const command = JSON.parse(options.body as string);
    expect(command[0]).toBe('EVAL');
    expect(command[1]).toContain("redis.call('EXPIRE'");
    expect(command.slice(2)).toEqual([
      1,
      'primax:v12:test:limit:operator-login',
      900,
    ]);
  });
  it('never accepts malformed counters or falls back when Redis is unavailable', async () => {
    const fetcher = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ result: null }));
    await expect(store.limit('operator-login', 5, 900)).rejects.toThrow();
    fetcher.mockRejectedValue(Error('offline'));
    await expect(store.command('GET', 'fixture')).rejects.toThrow(
      'temporalmente',
    );
  });
});
