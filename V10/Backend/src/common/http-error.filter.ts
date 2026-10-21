import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const details: Record<string, unknown> = {};
    let status = 500;
    let message: string | string[] = 'Error interno del servidor';
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      if (typeof body === 'object') {
        const value = body as Record<string, unknown>;
        for (const key of [
          'code',
          'available',
          'amount',
          'amountPending',
          'existingDebt',
          'canRegisterDebt',
        ])
          if (value[key] !== undefined) details[key] = value[key];
      }
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ??
            error.message);
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      status = 409;
      message = 'El registro ya existe';
    } else {
      // Do not log credentials, bodies or SQL parameters.
      this.logger.error(
        `Unhandled ${error instanceof Error ? error.name : 'error'}${error instanceof Prisma.PrismaClientKnownRequestError ? ` (${error.code})` : ''} at ${request.method} ${request.path}`,
      );
    }
    response.status(status).json({
      ...details,
      statusCode: status,
      message,
      path: request.path,
      timestamp: new Date().toISOString(),
    });
  }
}
