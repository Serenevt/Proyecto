import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { compare } from 'bcryptjs';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { KioskStore } from './redis-store';
import { kioskRoute } from './policy';

export type KioskSession = {
  authenticated: boolean;
  csrf: string;
  version: string;
  expiresAt: number;
  stationId: string;
};
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const opaque = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class KioskService {
  constructor(
    private readonly config: ConfigService,
    private readonly store: KioskStore,
    private readonly db: PrismaService,
  ) {}
  private version() {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('KIOSK_GATEWAY_SECRET'),
    )
      .update(
        JSON.stringify([
          this.config.get('KIOSK_OPERATOR_USER'),
          this.config.get('KIOSK_OPERATOR_PASSWORD_HASH'),
          this.config.get('KIOSK_STATION_ID'),
          this.config.get('KIOSK_SESSION_VERSION', '1'),
        ]),
      )
      .digest('hex');
  }
  verifyGateway(req: Request) {
    if (this.config.get('APP_MODE') !== 'academic')
      throw new ForbiddenException();
    const timestamp = req.header('x-kiosk-time') || '';
    const signature = req.header('x-kiosk-signature') || '';
    if (
      !/^\d{13}$/.test(timestamp) ||
      Math.abs(Date.now() - Number(timestamp)) > 30000 ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      throw new UnauthorizedException();
    const message = JSON.stringify([
      req.method,
      req.originalUrl,
      timestamp,
      req.body ?? null,
      req.header('x-kiosk-session') || '',
      req.header('x-csrf-token') || '',
      req.header('x-terminal-session') || '',
      req.header('authorization') || '',
    ]);
    const expected = createHmac(
      'sha256',
      this.config.getOrThrow<string>('KIOSK_GATEWAY_SECRET'),
    )
      .update(message)
      .digest('hex');
    if (!equal(expected, signature)) throw new UnauthorizedException();
  }
  async limitTechnical(req: Request) {
    const identity =
      req.header('x-terminal-session') || req.header('authorization') || '';
    if (!(await this.store.limit(`technical:${digest(identity)}`, 240, 60)))
      throw new HttpException('Demasiadas operaciones', 429);
  }
  private sessionKey(token: string) {
    if (!opaque.test(token))
      throw new UnauthorizedException('Sesión de terminal requerida');
    return this.store.key(`session:${digest(token)}`);
  }
  async session(token: string, csrf?: string, authenticated = true) {
    const raw = await this.store.command<string | null>(
      'GET',
      this.sessionKey(token),
    );
    if (!raw) throw new UnauthorizedException('Sesión de terminal vencida');
    let value: KioskSession;
    try {
      value = JSON.parse(raw) as KioskSession;
    } catch {
      throw new UnauthorizedException();
    }
    if (
      value.expiresAt <= Date.now() ||
      value.version !== this.version() ||
      value.stationId !== this.config.get('KIOSK_STATION_ID') ||
      (authenticated && !value.authenticated)
    )
      throw new UnauthorizedException('Sesión de terminal vencida');
    if (csrf !== undefined && !equal(value.csrf, csrf))
      throw new ForbiddenException('Verificación CSRF fallida');
    return value;
  }
  private async create(authenticated: boolean) {
    const token = randomBytes(32).toString('base64url');
    const ttl = authenticated ? 1800 : 300;
    const session: KioskSession = {
      authenticated,
      csrf: randomBytes(32).toString('base64url'),
      version: this.version(),
      expiresAt: Date.now() + ttl * 1000,
      stationId: this.config.getOrThrow<string>('KIOSK_STATION_ID'),
    };
    if (
      (await this.store.command(
        'SET',
        this.sessionKey(token),
        JSON.stringify(session),
        'EX',
        ttl,
        'NX',
      )) !== 'OK'
    )
      throw new UnauthorizedException();
    return { token, ...this.publicSession(session), ttl };
  }
  private publicSession(value: KioskSession) {
    return {
      authenticated: value.authenticated,
      csrfToken: value.csrf,
      expiresAt: value.expiresAt,
      stationId: value.authenticated ? value.stationId : undefined,
    };
  }
  async status(req: Request) {
    this.verifyGateway(req);
    const token = req.header('x-kiosk-session') || '';
    if (token) {
      try {
        return {
          ...this.publicSession(await this.session(token, undefined, false)),
        };
      } catch (error) {
        if (!(error instanceof UnauthorizedException)) throw error;
      }
    }
    if (!(await this.store.limit('preauth', 120, 60)))
      throw new HttpException('Demasiadas solicitudes', 429);
    return this.create(false);
  }
  async login(req: Request, body: { username: string; password: string }) {
    this.verifyGateway(req);
    const token = req.header('x-kiosk-session') || '';
    await this.session(token, req.header('x-csrf-token') || '', false);
    // One configured account: changing usernames/IPs cannot evade this shared cap.
    if (!(await this.store.limit('operator-login', 5, 900)))
      throw new HttpException(
        'Demasiados intentos. Espera quince minutos.',
        429,
      );
    const validPassword = await compare(
      body.password,
      this.config.getOrThrow<string>('KIOSK_OPERATOR_PASSWORD_HASH'),
    );
    if (
      !equal(
        body.username,
        this.config.getOrThrow<string>('KIOSK_OPERATOR_USER'),
      ) ||
      !validPassword
    )
      throw new UnauthorizedException('Credenciales incorrectas');
    const station = await this.db.station.findUnique({
      where: { id: this.config.getOrThrow<string>('KIOSK_STATION_ID') },
    });
    if (!station?.active)
      throw new ForbiddenException('Estación de terminal no disponible');
    // Claim the pre-session once: concurrent logins cannot rotate it twice.
    if ((await this.store.command<number>('DEL', this.sessionKey(token))) !== 1)
      throw new UnauthorizedException();
    return this.create(true);
  }
  async logout(req: Request) {
    this.verifyGateway(req);
    const token = req.header('x-kiosk-session') || '';
    await this.session(token, req.header('x-csrf-token') || '', false);
    await this.store.command('DEL', this.sessionKey(token));
    return { authenticated: false };
  }
  private assertStation(stationId: unknown, expected: string) {
    if (stationId !== expected)
      throw new ForbiddenException('Operación fuera de la estación autorizada');
  }
  private async binding(
    operationId: unknown,
    stationId: string,
    create: boolean,
    purpose = 'operation',
  ) {
    if (typeof operationId !== 'string' || !uuid.test(operationId))
      throw new BadRequestException('operationId inválido');
    const key = this.store.key(`${purpose}:${operationId.toLowerCase()}`);
    if (create)
      await this.store.command('SET', key, stationId, 'EX', 604800, 'NX');
    this.assertStation(
      await this.store.command<string | null>('GET', key),
      stationId,
    );
  }
  private async authorization(id: string, stationId: string) {
    const row = await this.db.fuelAuthorization.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    this.assertStation(row.stationId, stationId);
  }
  async authorize(
    req: Request,
    target?: { method: string; path: string; body?: Record<string, unknown> },
  ) {
    this.verifyGateway(req);
    const session = await this.session(
      req.header('x-kiosk-session') || '',
      req.header('x-csrf-token') || '',
    );
    if (
      !(await this.store.limit(
        `operations:${digest(req.header('x-kiosk-session') || '')}`,
        240,
        60,
      ))
    )
      throw new HttpException('Demasiadas operaciones', 429);
    const method = target?.method ?? req.method;
    const path = target?.path ?? req.originalUrl;
    const body = target?.body ?? req.body ?? {};
    if (!kioskRoute(method, path))
      throw new ForbiddenException('Operación de terminal no permitida');
    const stationId = session.stationId;
    if (method === 'POST' && path === '/api/v1/admin/check-plate') {
      await this.binding(body.operationId, stationId, true, 'plate-check');
    }
    if (
      method === 'POST' &&
      ['/api/v1/authorizations', '/api/v1/transactions'].includes(path)
    ) {
      this.assertStation(body.stationId, stationId);
      if (typeof body.operationId !== 'string' || !uuid.test(body.operationId))
        throw new BadRequestException('operationId inválido');
      const prior = path.endsWith('/transactions')
        ? await this.db.transaction.findUnique({
            where: { operationId: body.operationId as string },
          })
        : await this.db.fuelAuthorization.findUnique({
            where: { operationId: body.operationId as string },
          });
      if (prior) this.assertStation(prior.stationId, stationId);
      // An operation UUID must not attach a pending payment from another station.
      // Check existing order bindings before creating any new trusted association.
      const order = await this.db.onlineOrder.findUnique({
        where: { operationId: body.operationId },
      });
      if (order) {
        if (order.userId || order.transactionId) throw new ForbiddenException();
        await this.binding(body.operationId, stationId, false);
      }
      const payment = await this.db.payment.findUnique({
        where: { operationId: body.operationId },
        include: { authorization: true, transaction: true },
      });
      if (payment) {
        const paymentStation =
          payment.authorization?.stationId ?? payment.transaction?.stationId;
        if (paymentStation) this.assertStation(paymentStation, stationId);
        else if (!order)
          throw new ForbiddenException('Pago sin estación verificable');
      }
      await this.binding(body.operationId, stationId, true);
      if (body.authorizationId) {
        if (
          typeof body.authorizationId !== 'string' ||
          !uuid.test(body.authorizationId)
        )
          throw new BadRequestException();
        await this.authorization(body.authorizationId, stationId);
      }
    }
    if (method === 'POST' && path === '/api/v1/online-orders') {
      const auth = body.authorization as Record<string, unknown> | undefined;
      if (!auth || body.transactionId || auth.operationId !== body.operationId)
        throw new ForbiddenException();
      this.assertStation(auth.stationId, stationId);
      if (typeof body.operationId !== 'string' || !uuid.test(body.operationId))
        throw new BadRequestException();
      const priorOrder = await this.db.onlineOrder.findUnique({
        where: { operationId: body.operationId },
      });
      if (priorOrder?.userId || priorOrder?.transactionId)
        throw new ForbiddenException();
      await this.binding(body.operationId, stationId, !priorOrder);
    }
    const parts = path.split('/');
    const resource = parts[3],
      id = parts[4];
    if (id && uuid.test(id)) {
      if (resource === 'authorizations')
        await this.authorization(id, stationId);
      if (resource === 'transactions') {
        const row = await this.db.transaction.findUnique({ where: { id } });
        if (!row) throw new NotFoundException();
        this.assertStation(row.stationId, stationId);
      }
      if (resource === 'online-orders') {
        const order = await this.db.onlineOrder.findUnique({ where: { id } });
        if (!order || order.userId || order.transactionId)
          throw new ForbiddenException();
        await this.binding(order.operationId, stationId, false);
      }
      if (resource === 'payments') {
        const row = await this.db.payment.findUnique({
          where: { id },
          include: { authorization: true, transaction: true },
        });
        this.assertStation(
          row?.authorization?.stationId ?? row?.transaction?.stationId,
          stationId,
        );
      }
    }
    return { kind: 'kiosk' as const, stationId };
  }
}
