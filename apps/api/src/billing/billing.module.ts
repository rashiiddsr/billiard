import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { IotModule } from '../iot/iot.module';
import { AuditService } from '../common/audit/audit.service';
import { resolveEnvValue } from '../common/config/env.utils';

@Module({
  imports: [
    IotModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || resolveEnvValue('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [BillingController],
  providers: [BillingService, AuditService],
  exports: [BillingService],
})
export class BillingModule {}
