import { Injectable } from '@nestjs/common';
import { AuditAction, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { notificationBus } from '../notifications/notification-bus';

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

  private buildReadableAudit(data: AuditLogData) {
    const after = data.afterData || {};
    const meta = data.metadata || {};

    const titleMap: Record<string, string> = {
      CREATE: `Membuat data ${data.entity}`,
      UPDATE: `Memperbarui data ${data.entity}`,
      DELETE: `Menghapus data ${data.entity}`,
      CONFIRM_ORDER: 'Konfirmasi pesanan F&B',
      CANCEL_ORDER: 'Membatalkan pesanan F&B',
      LOGIN: 'Login ke sistem',
      LOGOUT: 'Logout dari sistem',
      FAILED_AUTH: 'Percobaan autentikasi gagal',
      START_BILLING: 'Memulai sesi billing meja',
      STOP_BILLING: 'Menghentikan sesi billing meja',
      AUTO_STOP_BILLING: 'Sesi billing ditutup otomatis oleh sistem',
      EXTEND_BILLING: 'Memperpanjang sesi billing',
      PAYMENT: 'Mencatat pembayaran',
      PRINT_PAYMENT: 'Menandai struk telah dicetak',
      VOID_PAYMENT: 'Membatalkan transaksi pembayaran',
      DELETE_PAYMENT: 'Menghapus data pembayaran',
    };

    let description = titleMap[data.action] || `${data.action} pada ${data.entity}`;

    if (data.action === AuditAction.START_BILLING) {
      description = `Sesi billing meja dimulai dengan durasi ${after.durationMinutes || '-'} menit.`;
    } else if (data.action === AuditAction.EXTEND_BILLING) {
      description = `Sesi billing diperpanjang ${after.additionalMinutes || 0} menit dengan tambahan Rp${after.additionalAmount || 0}.`;
    } else if (data.action === AuditAction.PAYMENT) {
      description = `Pembayaran tercatat dengan total Rp${after.total || 0} menggunakan metode ${after.method || '-'}.`;
    } else if (data.action === AuditAction.FAILED_AUTH) {
      description = `Terjadi percobaan login/re-auth gagal${meta.email ? ` untuk ${meta.email}` : ''}.`;
    }

    return {
      title: titleMap[data.action] || `${data.action} ${data.entity}`,
      description,
    };
  }

  async log(data: AuditLogData) {
    try {
      const readable = this.buildReadableAudit(data);
      const log = await this.prisma.auditLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          beforeData: data.beforeData,
          afterData: data.afterData,
          metadata: {
            ...(data.metadata || {}),
            readable,
          },
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });

      const owners = await this.prisma.user.findMany({
        where: { role: Role.OWNER, isActive: true },
        select: { id: true },
      });

      for (const owner of owners) {
        const notification = await this.prisma.notification.create({
          data: {
            userId: owner.id,
            title: readable.title,
            message: readable.description,
            entity: data.entity,
            entityId: data.entityId,
            metadata: {
              action: data.action,
              auditLogId: log.id,
            },
          },
        });

        notificationBus.emit('notification', {
          userId: owner.id,
          notificationId: notification.id,
          title: notification.title,
          message: notification.message,
          entity: notification.entity || undefined,
          entityId: notification.entityId || undefined,
          createdAt: notification.createdAt,
        });
      }
    } catch (error) {
      // Never throw from audit log - just log to console
      console.error('Failed to write audit log:', error);
    }
  }
}
