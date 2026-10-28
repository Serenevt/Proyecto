import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

/** Shared REST Redis state. Never falls back to process memory. */
@Injectable()
export class KioskStore implements OnModuleDestroy {
  private readonly localRedis?: RedisClientType;
  private connecting?: Promise<void>;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('KIOSK_REDIS_URL');
    if (config.get<string>('APP_MODE') === 'local' && url) {
      this.localRedis = createClient({
        url,
        disableOfflineQueue: true,
        socket: {
          connectTimeout: 4000,
          reconnectStrategy: (retries) => retries > 3 ? new Error('Redis local unavailable') : Math.min(retries * 250, 750),
        },
      });
      // Do not log Redis URLs, arguments, credentials or key material.
      this.localRedis.on('error', () => undefined);
    }
  }

  async onModuleDestroy() {
    if (!this.localRedis) return;
    if (this.localRedis.isOpen) await this.localRedis.close().catch(() => this.localRedis?.destroy());
    else this.localRedis.destroy();
  }

  private async connectLocalRedis() {
    if (!this.localRedis || this.localRedis.isReady) return;
    if (!this.connecting) {
      this.connecting = this.localRedis.connect().then(() => undefined).catch((error: unknown) => {
        this.connecting = undefined;
        throw error;
      });
    }
    await this.connecting;
  }

  async command<T>(...command: (string | number)[]): Promise<T> {
    if (this.localRedis) {
      try {
        await this.connectLocalRedis();
        return await this.localRedis.sendCommand(command.map(String)) as T;
      } catch {
        throw new ServiceUnavailableException('Autenticación temporalmente no disponible');
      }
    }
    try {
      const response = await fetch(
        this.config.getOrThrow<string>('KIOSK_REDIS_REST_URL'),
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${this.config.getOrThrow<string>('KIOSK_REDIS_REST_TOKEN')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(command),
          signal: AbortSignal.timeout(4000),
        },
      );
      if (!response.ok) throw Error();
      const value = (await response.json()) as { result: T; error?: string };
      if (value.error || !Object.hasOwn(value, 'result')) throw Error();
      return value.result;
    } catch {
      throw new ServiceUnavailableException(
        'Autenticación temporalmente no disponible',
      );
    }
  }
  key(suffix: string) {
    return `primax:v12:${this.config.getOrThrow<string>('KIOSK_SESSION_NAMESPACE')}:${suffix}`;
  }
  async limit(scope: string, count: number, seconds: number) {
    const total = await this.command<number>(
      'EVAL',
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      this.key(`limit:${scope}`),
      seconds,
    );
    if (!Number.isInteger(total) || total < 1)
      throw new ServiceUnavailableException(
        'Autenticación temporalmente no disponible',
      );
    return total <= count;
  }
}
