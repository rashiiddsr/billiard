import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogData {
  userId?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  beforeData?: any;
  afterData?: any;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(data: AuditLogData) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          beforeData: data.beforeData,
          afterData: data.afterData,
          metadata: data.metadata,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });
    } catch (error) {
      // Never throw from audit log - just log to console
      console.error('Failed to write audit log:', error);
    }
  }
}
