import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly maxConnectRetries = 5;

  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'stdout', level: 'query' }, { emit: 'stdout', level: 'error' }]
          : [{ emit: 'stdout', level: 'error' }],
    });
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async connectWithRetry() {
    for (let attempt = 1; attempt <= this.maxConnectRetries; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        const isLastAttempt = attempt === this.maxConnectRetries;
        console.error(`[Prisma] Koneksi gagal (${attempt}/${this.maxConnectRetries})`, error);

        if (isLastAttempt) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
}
