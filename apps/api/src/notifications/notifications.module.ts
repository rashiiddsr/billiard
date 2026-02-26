import {
  BadRequestException,
  Controller,
  Module,
  Get,
  Injectable,
  Patch,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Observable } from 'rxjs';
import { notificationBus, NotificationEventPayload } from '../common/notifications/notification-bus';
import { Prisma } from '@prisma/client';



function isMissingNotificationsTable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2021' &&
    error.meta?.modelName === 'Notification'
  );
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string, page = 1, limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * safeLimit;

    try {
      const [data, total, unread] = await Promise.all([
        this.prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: safeLimit,
          skip,
        }),
        this.prisma.notification.count({ where: { userId } }),
        this.prisma.notification.count({ where: { userId, isRead: false } }),
      ]);

      return {
        data,
        total,
        unread,
        page,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      };
    } catch (error) {
      if (!isMissingNotificationsTable(error)) throw error;

      return {
        data: [],
        total: 0,
        unread: 0,
        page,
        limit: safeLimit,
        totalPages: 0,
      };
    }
  }

  async markRead(userId: string, notificationId?: string) {
    try {
      if (notificationId) {
        const existing = await this.prisma.notification.findFirst({ where: { id: notificationId, userId } });
        if (!existing) throw new BadRequestException('Notifikasi tidak ditemukan');

        await this.prisma.notification.update({
          where: { id: notificationId },
          data: { isRead: true, readAt: new Date() },
        });
      } else {
        await this.prisma.notification.updateMany({
          where: { userId, isRead: false },
          data: { isRead: true, readAt: new Date() },
        });
      }
    } catch (error) {
      if (!isMissingNotificationsTable(error)) throw error;
    }

    return this.list(userId, 1, 20);
  }

  stream(userId: string) {
    return new Observable<MessageEvent>((subscriber) => {
      const onNotification = (payload: NotificationEventPayload) => {
        if (payload.userId !== userId) return;
        subscriber.next({ data: JSON.stringify(payload) } as MessageEvent);
      };

      notificationBus.on('notification', onNotification);
      subscriber.next({ data: JSON.stringify({ type: 'CONNECTED' }) } as MessageEvent);

      return () => {
        notificationBus.off('notification', onNotification);
      };
    });
  }
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: any, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.notificationsService.list(user.id, Number(page || 1), Number(limit || 20));
  }

  @Sse('stream')
  stream(@CurrentUser() user: any) {
    return this.notificationsService.stream(user.id);
  }

  @Patch('read')
  markRead(@CurrentUser() user: any, @Query('id') id?: string) {
    return this.notificationsService.markRead(user.id, id);
  }
}


@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
