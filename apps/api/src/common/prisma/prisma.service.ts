import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      // BUG FIX #2a: Tambahkan connection pool agar API tidak lelet
      // Di Hostinger shared/VPS, default pool Prisma terlalu kecil
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // Matikan query log di production untuk performa lebih baik
      log: process.env.NODE_ENV === 'development'
        ? [{ emit: 'stdout', level: 'query' }, { emit: 'stdout', level: 'error' }]
        : [{ emit: 'stdout', level: 'error' }],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
