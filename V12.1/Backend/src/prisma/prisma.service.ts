import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { documentConflict } from '../common/document-conflict';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Serializable + retry keeps ledger balance checks safe across simultaneous requests.
  async atomic<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { retryUnique?: boolean } = {},
  ): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 10000,
        });
      } catch (error) {
        // Identity conflicts are definitive, unlike operationId races.
        if (documentConflict(error)) throw error;
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !(
            error.code === 'P2034' ||
            (options.retryUnique !== false && error.code === 'P2002') ||
            (error.code === 'P2010' &&
              ['40001', '40P01'].includes(String(error.meta?.code)))
          )
        )
          throw error;
        this.logger.warn(
          `Atomic operation retry ${attempt + 1}: ${error.code} ${JSON.stringify(error.meta?.target ?? '')}`,
        );
        if (attempt === 4)
          throw new ServiceUnavailableException(
            'Conflicto temporal; reintenta con el mismo operationId',
          );
        await new Promise((resolve) =>
          setTimeout(resolve, 50 * 2 ** attempt + Math.random() * 40),
        );
      }
    }
    throw new ServiceUnavailableException();
  }
}
