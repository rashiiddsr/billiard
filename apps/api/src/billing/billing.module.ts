import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { IotModule } from '../iot/iot.module';
import { AuditService } from '../common/audit/audit.service';
import { JWT_CONFIG } from '../common/config/jwt.config';

@Module({
  imports: [
    IotModule,
    JwtModule.register({
      secret: JWT_CONFIG.secret,
    }),
  ],
  controllers: [BillingController],
  providers: [BillingService, AuditService],
  exports: [BillingService],
})
export class BillingModule {}
