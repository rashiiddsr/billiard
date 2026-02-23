import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { IotModule } from '../iot/iot.module';
import { AuditService } from '../common/audit/audit.service';

@Module({
  imports: [
    IotModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [BillingController],
  providers: [BillingService, AuditService],
  exports: [BillingService],
})
export class BillingModule {}
