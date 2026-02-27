import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { IotService } from '../iot/iot.service';
import { AuditAction, Role, SessionStatus, TableStatus } from '@prisma/client';
import { CreateBillingSessionDto, ExtendBillingSessionDto, MoveBillingSessionDto } from './billing.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private iot: IotService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async createSession(dto: CreateBillingSessionDto, userId: string, userRole: Role) {
    // OWNER must provide re-auth token
    if (userRole === Role.OWNER) {
      if (!dto.reAuthToken) {
        throw new ForbiddenException('OWNER must provide re-auth token to start billing');
      }
      try {
        const payload = this.jwtService.verify(dto.reAuthToken, {
          secret: this.config.get('JWT_SECRET'),
        });
        if (!payload.reAuth || payload.sub !== userId) {
          throw new UnauthorizedException('Invalid re-auth token');
        }
      } catch {
        throw new UnauthorizedException('Re-auth token invalid or expired');
      }
    }

    // Check table
    const table = await this.prisma.table.findUnique({
      where: { id: dto.tableId },
      include: { billingSessions: { where: { status: SessionStatus.ACTIVE } } },
    });

    if (!table) throw new NotFoundException('Table not found');
    if (!table.isActive) throw new BadRequestException('Table is not active');
    if (table.status !== TableStatus.AVAILABLE) {
      throw new BadRequestException('Meja sedang testing atau tidak tersedia untuk billing');
    }
    if (table.billingSessions.length > 0) {
      throw new BadRequestException('Table already has an active session');
    }

    await this.iot.assertTableReadyForBilling(dto.tableId);

    const isOwnerLock = userRole === Role.OWNER;
    if (!isOwnerLock && dto.durationMinutes < 60) {
      throw new BadRequestException('Durasi billing minimal 60 menit');
    }

    if (!isOwnerLock && dto.durationMinutes % 60 !== 0) {
      throw new BadRequestException('Durasi start billing wajib kelipatan 60 menit (per jam)');
    }

    const selectedRateType = dto.rateType || 'HOURLY';
    const isFlexible = !isOwnerLock && selectedRateType === 'FLEXIBLE';

    const ratePerHour = isOwnerLock
      ? new Decimal(0)
      : new Decimal(table.hourlyRate.toString());

    let packageName: string | undefined;
    let packageOriginalPrice: Decimal | undefined;
    let packagePrice: Decimal | undefined;
    if (dto.billingPackageId && !isOwnerLock) {
      const pkg = await this.prisma.billingPackage.findUnique({
        where: { id: dto.billingPackageId },
        include: { items: true },
      });
      if (!pkg || !pkg.isActive) throw new BadRequestException('Paket tidak ditemukan atau tidak aktif');
      if (!pkg.durationMinutes) throw new BadRequestException('Paket harus memiliki durasi billing');
      dto.durationMinutes = pkg.durationMinutes;
      packageName = pkg.name;
      packagePrice = new Decimal(pkg.price.toString());
      const billingOriginal = new Decimal(table.hourlyRate.toString()).mul(pkg.durationMinutes).div(60);
      const fnbOriginal = pkg.items
        .filter((item) => item.type === 'MENU_ITEM')
        .reduce((sum, item) => sum.plus(new Decimal(item.unitPrice.toString()).mul(item.quantity)), new Decimal(0));
      packageOriginalPrice = billingOriginal.plus(fnbOriginal);
    }

    const startTime = new Date();
    const effectiveDuration = isOwnerLock || isFlexible ? 525600 : dto.durationMinutes;
    const endTime = new Date(startTime.getTime() + effectiveDuration * 60 * 1000);
    const totalAmount = dto.billingPackageId && !isOwnerLock
      ? packagePrice || new Decimal(0)
      : isOwnerLock
      ? new Decimal(0)
      : isFlexible
      ? new Decimal(0)
      : ratePerHour.mul(effectiveDuration).div(60).toDecimalPlaces(0);

    const appliedRateType = dto.billingPackageId && !isOwnerLock ? 'PACKAGE' : isOwnerLock ? 'OWNER_LOCK' : selectedRateType;

    const session = await this.prisma.billingSession.create({
      data: {
        tableId: dto.tableId,
        startTime,
        endTime,
        durationMinutes: effectiveDuration,
        rateType: appliedRateType,
        ratePerHour: ratePerHour.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        packageName,
        packageOriginalPrice: packageOriginalPrice?.toFixed(2),
        createdById: userId,
        approvedById: userRole === Role.OWNER ? userId : undefined,
      },
      include: { table: true, createdBy: { select: { id: true, name: true, role: true } } },
    });

    // Update table status
    await this.prisma.table.update({
      where: { id: dto.tableId },
      data: { status: TableStatus.OCCUPIED },
    });

    // Send IoT LIGHT_ON command
    await this.iot.sendCommand(dto.tableId, 'LIGHT_ON');

    if (dto.billingPackageId && !isOwnerLock) {
      await this.applyPackage(session.id, dto.billingPackageId, userId, session.tableId, dto.durationMinutes);
    }

    await this.audit.log({
      userId,
      action: AuditAction.START_BILLING,
      entity: 'BillingSession',
      entityId: session.id,
      afterData: { tableId: dto.tableId, durationMinutes: effectiveDuration, totalAmount },
    });

    return session;
  }

  async extendSession(sessionId: string, dto: ExtendBillingSessionDto, userId: string, _userRole: Role) {
    const session = await this.prisma.billingSession.findUnique({
      where: { id: sessionId },
      include: { table: true },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Session is not active');
    }
    if (session.rateType === 'OWNER_LOCK') {
      throw new ForbiddenException('Sesi owner lock tidak bisa diperpanjang');
    }
    if (session.rateType === 'FLEXIBLE') {
      throw new ForbiddenException('Sesi main bebas tidak memiliki fitur perpanjang');
    }

    if (!dto.billingPackageId && (dto.additionalMinutes < 60 || dto.additionalMinutes % 60 !== 0)) {
      throw new BadRequestException('Perpanjangan billing wajib kelipatan 60 menit (minimal 60 menit)');
    }

    let extensionPackagePrice: Decimal | null = null;
    if (dto.billingPackageId) {
      const pkg = await this.prisma.billingPackage.findUnique({ where: { id: dto.billingPackageId } });
      if (!pkg || !pkg.isActive) throw new BadRequestException('Paket tidak ditemukan atau tidak aktif');
      if (!pkg.durationMinutes) throw new BadRequestException('Paket perpanjang harus memiliki durasi');
      dto.additionalMinutes = pkg.durationMinutes;
      extensionPackagePrice = new Decimal(pkg.price.toString());
    }

    const additionalMs = dto.additionalMinutes * 60 * 1000;
    const newEndTime = new Date(session.endTime.getTime() + additionalMs);
    const additionalAmount = extensionPackagePrice || new Decimal(session.ratePerHour.toString())
      .mul(dto.additionalMinutes)
      .div(60)
      .toDecimalPlaces(0);

    const newTotal = new Decimal(session.totalAmount.toString()).plus(additionalAmount);
    const newDuration = session.durationMinutes + dto.additionalMinutes;

    const updated = await this.prisma.billingSession.update({
      where: { id: sessionId },
      data: {
        endTime: newEndTime,
        durationMinutes: newDuration,
        totalAmount: newTotal.toFixed(2),
        blinkCommandSent: false, // reset blink flag
      },
      include: { table: true },
    });

    await this.audit.log({
      userId,
      action: AuditAction.EXTEND_BILLING,
      entity: 'BillingSession',
      entityId: sessionId,
      beforeData: { endTime: session.endTime, totalAmount: session.totalAmount },
      afterData: {
        endTime: newEndTime,
        totalAmount: newTotal,
        additionalMinutes: dto.additionalMinutes,
        additionalAmount,
      },
    });

    if (dto.billingPackageId) {
      await this.applyPackage(sessionId, dto.billingPackageId, userId, session.tableId, dto.additionalMinutes);
    }

    return updated;
  }

  private async applyPackage(
    sessionId: string,
    billingPackageId: string,
    userId: string,
    tableId: string,
    appliedDurationMinutes?: number,
  ) {
    const pkg = await this.prisma.billingPackage.findUnique({
      where: { id: billingPackageId },
      include: { items: { include: { menuItem: { include: { stock: true } } } } },
    });
    if (!pkg) return;

    const session = await this.prisma.billingSession.findUnique({
      where: { id: sessionId },
      select: { ratePerHour: true },
    });
    const billingOriginalPrice = session && appliedDurationMinutes
      ? new Decimal(session.ratePerHour.toString()).mul(appliedDurationMinutes).div(60).toDecimalPlaces(2)
      : new Decimal(0);

    const packageOriginalPrice = pkg.items.reduce(
      (sum, item) => sum.plus(new Decimal(item.unitPrice.toString()).mul(item.quantity)),
      billingOriginalPrice,
    );

    await this.prisma.sessionPackageUsage.create({
      data: {
        billingSessionId: sessionId,
        billingPackageId: pkg.id,
        packageName: pkg.name,
        packagePrice: pkg.price.toFixed(2),
        originalPrice: packageOriginalPrice.toFixed(2),
        durationMinutes: pkg.durationMinutes,
      },
    });

    const menuItems = pkg.items.filter((item) => item.type === 'MENU_ITEM' && item.menuItemId);
    if (menuItems.length === 0) return;

    await this.prisma.order.create({
      data: {
        orderNumber: `PKG-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        billingSessionId: sessionId,
        tableId,
        status: 'CONFIRMED',
        notes: `AUTO_PACKAGE:${pkg.name}`,
        subtotal: '0.00',
        taxAmount: '0.00',
        total: '0.00',
        createdById: userId,
        items: {
          create: menuItems.map((item) => ({
            menuItemId: item.menuItemId!,
            quantity: item.quantity,
            unitPrice: '0.00',
            subtotal: '0.00',
            taxAmount: '0.00',
            notes: `Included in package ${pkg.name}`,
          })),
        },
      },
    });

    for (const item of menuItems) {
      if (!item.menuItem?.stock?.trackStock) continue;
      await this.prisma.stockFnb.update({
        where: { menuItemId: item.menuItemId! },
        data: { qtyOnHand: { decrement: item.quantity } },
      });
      await this.prisma.stockAdjustment.create({
        data: {
          stockFnbId: item.menuItem.stock.id,
          actionType: 'SALE_DEDUCTION',
          quantityDelta: -item.quantity,
          notes: `Paket ${pkg.name}`,
          performedById: userId,
        },
      });
    }
  }

  async stopSession(sessionId: string, userId: string, _userRole: Role) {
    const session = await this.prisma.billingSession.findUnique({
      where: { id: sessionId },
      include: { table: true, payments: { where: { status: 'PAID' } } },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Session is not active');
    }
    const now = new Date();
    const actualMinutes = Math.ceil((now.getTime() - session.startTime.getTime()) / 60000);
    const finalAmount = session.rateType === 'OWNER_LOCK'
      ? new Decimal(0)
      : session.rateType === 'FLEXIBLE'
      ? new Decimal(session.ratePerHour.toString()).mul(Math.ceil(actualMinutes / 60)).toDecimalPlaces(0)
      : new Decimal(session.totalAmount.toString());

    const updated = await this.prisma.billingSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.COMPLETED,
        actualEndTime: now,
        totalAmount: finalAmount.toFixed(2),
      },
    });

    await this.prisma.table.update({
      where: { id: session.tableId },
      data: { status: TableStatus.AVAILABLE },
    });

    await this.iot.sendCommand(session.tableId, 'LIGHT_OFF');

    await this.audit.log({
      userId,
      action: AuditAction.STOP_BILLING,
      entity: 'BillingSession',
      entityId: sessionId,
      afterData: {
        actualMinutes,
        finalAmount,
        stoppedEarly: now < session.endTime,
        alreadyPaid: session.payments.length > 0,
      },
    });

    return updated;
  }

  async moveSession(sessionId: string, dto: MoveBillingSessionDto, userId: string, userRole: Role) {
    const session = await this.prisma.billingSession.findUnique({
      where: { id: sessionId },
      include: { table: true },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Session is not active');
    }

    if (session.tableId === dto.targetTableId) {
      throw new BadRequestException('Meja tujuan sama dengan meja saat ini');
    }

    const targetTable = await this.prisma.table.findUnique({
      where: { id: dto.targetTableId },
      include: { billingSessions: { where: { status: SessionStatus.ACTIVE } } },
    });

    if (!targetTable) throw new NotFoundException('Target table not found');
    if (!targetTable.isActive) throw new BadRequestException('Target table is not active');
    if (targetTable.status !== TableStatus.AVAILABLE) {
      throw new BadRequestException('Meja tujuan harus tersedia');
    }
    if (targetTable.billingSessions.length > 0) {
      throw new BadRequestException('Meja tujuan sedang digunakan');
    }

    const isOwnerLock = session.rateType === 'OWNER_LOCK';
    if (!isOwnerLock && userRole !== Role.OWNER) {
      const sourceRate = new Decimal(session.table.hourlyRate.toString());
      const targetRate = new Decimal(targetTable.hourlyRate.toString());
      if (!sourceRate.equals(targetRate)) {
        throw new BadRequestException('Pindah meja hanya bisa ke tarif meja yang sama');
      }
    }

    await this.prisma.$transaction([
      this.prisma.billingSession.update({
        where: { id: sessionId },
        data: { tableId: targetTable.id },
      }),
      this.prisma.table.update({
        where: { id: session.tableId },
        data: { status: TableStatus.AVAILABLE },
      }),
      this.prisma.table.update({
        where: { id: targetTable.id },
        data: { status: TableStatus.OCCUPIED },
      }),
    ]);

    try {
      await this.iot.sendCommand(session.tableId, 'LIGHT_OFF');
      await this.iot.sendCommand(targetTable.id, 'LIGHT_ON');
    } catch (error) {
      console.error('Move session IoT command failed:', error);
    }

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      entity: 'BillingSession',
      entityId: sessionId,
      beforeData: { tableId: session.tableId, tableName: session.table.name },
      afterData: { tableId: targetTable.id, tableName: targetTable.name },
    });

    return this.getSession(sessionId);
  }

  async getActiveSessions() {
    return this.prisma.billingSession.findMany({
      where: { status: SessionStatus.ACTIVE },
      include: {
        table: {
          include: {
            iotDevice: { select: { id: true, name: true, isOnline: true, isActive: true, lastSeen: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
        orders: {
          where: { status: { not: 'CANCELLED' } },
          include: { items: true },
        },
        payments: { where: { status: 'PAID' } },
        packageUsages: true,
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async getSession(sessionId: string) {
    const session = await this.prisma.billingSession.findUnique({
      where: { id: sessionId },
      include: {
        table: {
          include: {
            iotDevice: { select: { id: true, name: true, isOnline: true, isActive: true, lastSeen: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
        orders: {
          where: { status: { not: 'CANCELLED' } },
          include: {
            items: { include: { menuItem: true } },
          },
        },
        payments: true,
        packageUsages: true,
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    const extensionLogs = await this.prisma.auditLog.findMany({
      where: {
        entity: 'BillingSession',
        entityId: sessionId,
        action: AuditAction.EXTEND_BILLING,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true, afterData: true },
    });

    const extensionItems = extensionLogs.map((log: any, index: number) => {
      const data = (log.afterData || {}) as any;
      return {
        id: log.id,
        order: index + 1,
        createdAt: log.createdAt,
        additionalMinutes: Number(data.additionalMinutes || 0),
        additionalAmount: Number(data.additionalAmount || 0),
      };
    });

    const extensionTotal = extensionItems.reduce((sum, item) => sum + item.additionalAmount, 0);
    const sessionTotal = Number(session.totalAmount || 0);
    const baseAmount = Math.max(0, sessionTotal - extensionTotal);

    return {
      ...session,
      billingBreakdown: {
        baseAmount,
        extensionTotal,
        extensions: extensionItems,
      },
    };
  }

  async listSessions(filters: {
    status?: SessionStatus;
    tableId?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.tableId) where.tableId = filters.tableId;
    if (filters.startDate || filters.endDate) {
      where.startTime = {};
      if (filters.startDate) where.startTime.gte = filters.startDate;
      if (filters.endDate) where.startTime.lte = filters.endDate;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.billingSession.findMany({
        where,
        include: {
          table: true,
          createdBy: { select: { id: true, name: true } },
          payments: { where: { status: 'PAID' } },
        },
        orderBy: { startTime: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.billingSession.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── Server-side timer (runs every 30 seconds) ────────────────────────────

  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkBillingSessions() {
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    // Sessions that should end
    const expiredSessions = await this.prisma.billingSession.findMany({
      where: {
        status: SessionStatus.ACTIVE,
        rateType: { notIn: ['OWNER_LOCK', 'FLEXIBLE'] },
        endTime: { lte: now },
      },
    });

    for (const session of expiredSessions) {
      try {
        await this.prisma.billingSession.update({
          where: { id: session.id },
          data: { status: SessionStatus.COMPLETED, actualEndTime: now },
        });
        await this.prisma.table.update({
          where: { id: session.tableId },
          data: { status: TableStatus.AVAILABLE },
        });
        await this.iot.sendCommand(session.tableId, 'LIGHT_OFF');
        await this.audit.log({
          action: AuditAction.AUTO_STOP_BILLING,
          entity: 'BillingSession',
          entityId: session.id,
          afterData: { reason: 'session_timeout', autoStoppedAt: now },
        });
        console.log(`⏰ Session ${session.id} auto-completed at ${now.toISOString()}`);
      } catch (err) {
        console.error(`Failed to complete session ${session.id}:`, err);
      }
    }

    // Sessions approaching end (within next 5 minutes, blink not yet sent)
    const nearlyExpiredSessions = await this.prisma.billingSession.findMany({
      where: {
        status: SessionStatus.ACTIVE,
        rateType: { notIn: ['OWNER_LOCK', 'FLEXIBLE'] },
        blinkCommandSent: false,
        endTime: { gte: now, lte: fiveMinutesFromNow },
      },
    });

    for (const session of nearlyExpiredSessions) {
      try {
        await this.iot.sendCommand(session.tableId, 'BLINK_3X');
        await this.prisma.billingSession.update({
          where: { id: session.id },
          data: { blinkCommandSent: true },
        });
        console.log(`🔔 Blink sent for session ${session.id}`);
      } catch (err) {
        console.error(`Failed to send blink for session ${session.id}:`, err);
      }
    }
  }
}
