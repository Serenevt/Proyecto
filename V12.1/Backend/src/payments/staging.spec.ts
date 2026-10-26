import { PrismaService } from '../prisma/prisma.service';
import { DemoWalletProvider } from './demo-provider';
import { CulqiProvider } from './payment-provider';

const keys = ['APP_MODE', 'PAYMENT_ENV', 'DEMO_WALLET_ENABLED', 'CULQI_SECRET_KEY'] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  jest.restoreAllMocks();
});

describe('staging payment provider boundary', () => {
  it('creates a demo order without contacting Culqi', async () => {
    Object.assign(process.env, {
      APP_MODE: 'staging', PAYMENT_ENV: 'demo', DEMO_WALLET_ENABLED: 'true',
    });
    delete process.env.CULQI_SECRET_KEY;
    const fetcher = jest.spyOn(globalThis, 'fetch');
    const order = {
      id: 'demo:order-1', order_number: 'order-1', amount: 600,
      currency_code: 'PEN', state: 'pending',
    };
    const upsert = jest.fn().mockResolvedValue(null);
    const findUnique = jest.fn().mockImplementation(({ where }) =>
      where.eventKey === 'demo-intent:order-1'
        ? Promise.resolve({ detail: JSON.stringify(order) })
        : Promise.resolve(null));
    const db = {
      atomic: (work: (tx: unknown) => Promise<unknown>) => work({ paymentEvent: { upsert } }),
      paymentEvent: { findUnique, findUniqueOrThrow: findUnique },
    } as unknown as PrismaService;
    const provider = new DemoWalletProvider(db);
    expect(provider.assertConfigured()).toBeUndefined();
    expect(await provider.create('order-1', 600)).toEqual(order);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('Culqi refuses staging before any external request, even with a live key', async () => {
    Object.assign(process.env, {
      APP_MODE: 'staging', PAYMENT_ENV: 'production',
      CULQI_SECRET_KEY: 'sk_live_forbidden',
    });
    const fetcher = jest.spyOn(globalThis, 'fetch');
    const provider = new CulqiProvider();
    expect(() => provider.assertConfigured()).toThrow('Culqi deshabilitado en staging');
    await expect(provider.get('order-1')).rejects.toThrow('Culqi deshabilitado en staging');
    await expect(provider.create('order-1', 600, {
      first_name: 'Test', last_name: 'User', email: 'test@example.test',
      phone_number: '999999999',
    })).rejects.toThrow('Culqi deshabilitado en staging');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps local demo and the production Culqi adapter selectable', () => {
    Object.assign(process.env, {
      APP_MODE: 'local', PAYMENT_ENV: 'demo', DEMO_WALLET_ENABLED: 'true',
    });
    expect(new DemoWalletProvider({} as PrismaService).assertConfigured()).toBeUndefined();
    Object.assign(process.env, {
      APP_MODE: 'production', PAYMENT_ENV: 'production',
      DEMO_WALLET_ENABLED: 'false', CULQI_SECRET_KEY: 'sk_live_fixture',
    });
    expect(new CulqiProvider().assertConfigured()).toBeUndefined();
    expect(() => new DemoWalletProvider({} as PrismaService).assertConfigured())
      .toThrow('Simulación deshabilitada fuera del DEMO local');
  });
});
