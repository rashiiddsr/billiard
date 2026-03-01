import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getEnvFilePaths, loadEnvFilesIntoProcessEnv, resolveEnvValue } from '../config/env.utils';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      const envPaths = getEnvFilePaths();
      loadEnvFilesIntoProcessEnv(envPaths);
      const resolvedDbUrl = resolveEnvValue('DATABASE_URL', envPaths);
      if (resolvedDbUrl) {
        process.env.DATABASE_URL = resolvedDbUrl;
      }
    }

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
