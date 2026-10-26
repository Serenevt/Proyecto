import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Shared REST Redis state. Never falls back to process memory. */
@Injectable()
export class KioskStore {
  constructor(private readonly config: ConfigService) {}
  async command<T>(...command: (string | number)[]): Promise<T> {
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
