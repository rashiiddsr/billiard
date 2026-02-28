import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString, IsNumber, IsOptional, IsEnum, Min, IsArray,
} from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction, PaymentMethod, PaymentStatus, VoidRequestStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export class CreateCheckoutDto {
  @IsOptional() @IsString() billingSessionId?: string;
  @IsOptional() @IsArray() orderIds?: string[];
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() reference?: string; // for QRIS/TRANSFER
  @IsOptional() @IsNumber() @Min(0) amountPaid?: number;
}

export class ConfirmPaymentDto {
  @IsNumber() @Min(0) amountPaid: number;
}

export class RequestVoidDto {
  @IsOptional() @IsString() reason?: string;
}

export class RejectVoidDto {
  @IsOptional() @IsString() reason?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private generatePaymentNumber() {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const timePart = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const randPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `PAY-${datePart}-${timePart}${randPart}`;
  }

  private normalizePaymentStatus(status?: string): PaymentStatus | undefined {
    if (!status) return undefined;
    if (status === 'PENDING') return 'PENDING_PAYMENT';
    if (status === 'PENDING_PAYMENT' || status === 'PAID' || status === 'REFUNDED') return status;
    return undefined;
  }

  async createCheckout(dto: CreateCheckoutDto, userId: string) {
    let billingAmount = new Decimal(0);
    let fnbAmount = new Decimal(0);
    let taxAmount = new Decimal(0);
    let discountAmount = new Decimal(0);
    let discountReason: string | null = null;

    // Get billing session charge
    if (dto.billingSessionId) {
      const session = await this.prisma.billingSession.findUnique({
        where: { id: dto.billingSessionId },
        include: { packageUsages: true },
      });
      if (!session) throw new NotFoundException('Billing session not found');
      billingAmount = new Decimal(session.totalAmount.toString());

      const packageOriginal = session.packageUsages.reduce(
        (sum, usage) => sum.plus(new Decimal(usage.originalPrice.toString())),
        new Decimal(0),
      );
      const packagePaid = session.packageUsages.reduce(
        (sum, usage) => sum.plus(new Decimal(usage.packagePrice.toString())),
        new Decimal(0),
      );
      if (packageOriginal.greaterThan(packagePaid)) {
        discountAmount = packageOriginal.minus(packagePaid).toDecimalPlaces(2);
        discountReason = 'Diskon paket billing + F&B';
      }
    }

    // Get orders charge
    if (dto.orderIds && dto.orderIds.length > 0) {
      for (const orderId of dto.orderIds) {
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException(`Order ${orderId} not found`);
        fnbAmount = fnbAmount.plus(new Decimal(order.subtotal.toString()));
        taxAmount = taxAmount.plus(new Decimal(order.taxAmount.toString()));
      }
    }

    const subtotal = billingAmount.plus(fnbAmount);
    const totalAmount = subtotal.plus(taxAmount).minus(discountAmount);

    let payment: any = null;
    for (let i = 0; i < 5; i += 1) {
      try {
        payment = await this.prisma.payment.create({
          data: {
            paymentNumber: this.generatePaymentNumber(),
            billingSessionId: dto.billingSessionId,
            method: dto.method,
            status: 'PAID',
            billingAmount: billingAmount.toFixed(2),
            fnbAmount: fnbAmount.toFixed(2),
            subtotal: subtotal.toFixed(2),
            discountAmount: discountAmount.toFixed(2),
            discountReason,
            discountApprovedById: null,
            taxAmount: taxAmount.toFixed(2),
            totalAmount: totalAmount.toFixed(2),
            reference: dto.reference,
            amountPaid: (dto.amountPaid || totalAmount).toFixed(2),
            changeAmount: new Decimal(dto.amountPaid || totalAmount).minus(totalAmount).toFixed(2),
            paidById: userId,
            paidAt: new Date(),
            ...(dto.orderIds && dto.orderIds.length > 0 ? {
              orderId: dto.orderIds[0],
            } : {}),
          },
        });
        break;
      } catch (error: any) {
        if (error?.code !== 'P2002') {
          throw error;
        }
      }
    }

    if (!payment) {
      throw new BadRequestException('Gagal membuat nomor transaksi unik, silakan coba lagi');
    }

    // Also link all orders to this payment by updating them
    if (dto.orderIds) {
      for (const orderId of dto.orderIds) {
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: 'CONFIRMED' },
        });
        await this.deductStock(orderId, userId);
      }
    }

    await this.audit.log({
      userId,
      action: AuditAction.PAYMENT,
      entity: 'Payment',
      entityId: payment.id,
      afterData: {
        paymentNumber: payment.paymentNumber,
        method: payment.method,
        total: totalAmount.toFixed(2),
        discount: '0.00',
        packageDiscount: discountAmount.toFixed(2),
      },
    });

    return payment;
  }

  async confirmPayment(paymentId: string, dto: ConfirmPaymentDto, userId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'PAID') throw new BadRequestException('Payment already confirmed');

    const amountPaid = new Decimal(dto.amountPaid);
    const total = new Decimal(payment.totalAmount.toString());

    if (amountPaid.lessThan(total)) {
      throw new BadRequestException('Amount paid is less than total amount');
    }

    const change = amountPaid.minus(total);

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PAID',
        amountPaid: amountPaid.toFixed(2),
        changeAmount: change.toFixed(2),
        paidById: userId,
        paidAt: new Date(),
      },
    });

    // Deduct stock for F&B items
    if (payment.orderId) {
      await this.deductStock(payment.orderId, userId);
    }

    // Generate receipt data
    const receiptData = await this.generateReceiptData(updated);

    await this.audit.log({
      userId,
      action: AuditAction.PAYMENT,
      entity: 'Payment',
      entityId: paymentId,
      afterData: { method: payment.method, total, amountPaid, change },
    });

    return { payment: updated, receipt: receiptData };
  }

  async markPrinted(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PAID') throw new BadRequestException('Payment must be PAID to print');

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { isPrinted: true, printedAt: new Date() },
    });

    await this.audit.log({
      userId,
      action: AuditAction.PRINT_PAYMENT,
      entity: 'Payment',
      entityId: paymentId,
      afterData: { paymentNumber: payment.paymentNumber },
    });

    return updated;
  }

  async getReceiptData(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        paidBy: { select: { id: true, name: true } },
        billingSession: { include: { table: true } },
        order: { include: { items: { include: { menuItem: true } } } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return this.generateReceiptData(payment);
  }

  private async generateReceiptData(payment: any) {
    const fullPayment = payment.paidBy ? payment : await this.prisma.payment.findUnique({
      where: { id: payment.id },
      include: {
        paidBy: { select: { id: true, name: true } },
        billingSession: { include: { table: true } },
        order: { include: { items: { include: { menuItem: true } } } },
      },
    });

    let billingBreakdown = null;
    let packageUsages: any[] = [];
    let receiptFnbItems: any[] = fullPayment.order?.items?.map((item: any) => ({
      name: item.menuItem.name,
      sku: item.menuItem.sku,
      qty: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      notes: item.notes,
    })) || [];

    if (fullPayment.billingSessionId) {
      packageUsages = await this.prisma.sessionPackageUsage.findMany({
        where: { billingSessionId: fullPayment.billingSessionId },
        include: {
          billingPackage: {
            include: {
              items: { include: { menuItem: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const allOrders = await this.prisma.order.findMany({
        where: { billingSessionId: fullPayment.billingSessionId, status: { not: 'CANCELLED' } },
        include: { items: { include: { menuItem: true } } },
      });
      receiptFnbItems = allOrders.flatMap((order: any) =>
        (order.items || []).map((item: any) => ({
          name: item.menuItem.name,
          sku: item.menuItem.sku,
          qty: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          notes: item.notes,
        })),
      );

      const extensionLogs = await this.prisma.auditLog.findMany({
        where: {
          entity: 'BillingSession',
          entityId: fullPayment.billingSessionId,
          action: 'EXTEND_BILLING',
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, createdAt: true, afterData: true },
      });

      const extensions = extensionLogs.map((log: any, index: number) => ({
        id: log.id,
        order: index + 1,
        createdAt: log.createdAt,
        additionalMinutes: Number((log.afterData as any)?.additionalMinutes || 0),
        additionalAmount: Number((log.afterData as any)?.additionalAmount || 0),
      }));
      const extensionTotal = extensions.reduce((sum, item) => sum + item.additionalAmount, 0);
      const billed = Number(fullPayment.billingAmount || 0);

      billingBreakdown = {
        baseAmount: Math.max(0, billed - extensionTotal),
        extensionTotal,
        extensions,
      };
    }

    return {
      paymentNumber: fullPayment.paymentNumber,
      printedAt: new Date().toISOString(),
      cashier: fullPayment.paidBy?.name || 'N/A',
      table: fullPayment.billingSession?.table?.name || 'Standalone',
      billingSession: fullPayment.billingSession ? {
        startTime: fullPayment.billingSession.startTime,
        endTime: fullPayment.billingSession.endTime || fullPayment.billingSession.actualEndTime,
        duration: fullPayment.billingSession.durationMinutes,
        rate: fullPayment.billingSession.ratePerHour,
        amount: fullPayment.billingAmount,
        breakdown: billingBreakdown,
      } : null,
      packageUsages: packageUsages.map((usage) => ({
        id: usage.id,
        packageName: usage.packageName,
        packagePrice: usage.packagePrice,
        originalPrice: usage.originalPrice,
        durationMinutes: usage.durationMinutes,
        billingEquivalent: usage.durationMinutes
          ? new Decimal(fullPayment.billingSession?.ratePerHour?.toString() || '0').mul(usage.durationMinutes).div(60).toFixed(2)
          : '0.00',
        fnbItems: (usage.billingPackage?.items || [])
          .filter((x: any) => x.type === 'MENU_ITEM')
          .map((x: any) => ({
            name: x.menuItem?.name || 'Menu',
            qty: x.quantity,
            unitPrice: x.unitPrice,
            subtotal: new Decimal(x.unitPrice.toString()).mul(x.quantity).toFixed(2),
          })),
      })),
      fnbItems: receiptFnbItems,
      subtotal: fullPayment.subtotal,
      discount: fullPayment.discountAmount,
      discountReason: fullPayment.discountReason,
      tax: fullPayment.taxAmount,
      total: fullPayment.totalAmount,
      amountPaid: fullPayment.amountPaid,
      change: fullPayment.changeAmount,
      method: fullPayment.method,
      reference: fullPayment.reference,
      paidAt: fullPayment.paidAt,
    };
  }

  private async deductStock(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { menuItem: { include: { stock: true } } } } },
    });

    if (!order) return;

    for (const item of order.items) {
      if (item.menuItem.stock?.trackStock) {
        await this.prisma.stockFnb.update({
          where: { menuItemId: item.menuItemId },
          data: { qtyOnHand: { decrement: item.quantity } },
        });
        await this.prisma.stockAdjustment.create({
          data: {
            stockFnbId: item.menuItem.stock.id,
            actionType: 'SALE_DEDUCTION',
            quantityDelta: -item.quantity,
            notes: `Sale from order ${orderId}`,
            performedById: userId,
          },
        });
      }
    }
  }

  async voidPayment(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PAID') throw new BadRequestException('Hanya transaksi lunas yang bisa di-void');
    const updated = await this.prisma.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });
    await this.audit.log({
      userId,
      action: AuditAction.VOID_PAYMENT,
      entity: 'Payment',
      entityId: paymentId,
      beforeData: { status: payment.status },
      afterData: { status: 'REFUNDED', paymentNumber: payment.paymentNumber },
    });
    return updated;
  }

  async requestVoid(paymentId: string, userId: string, reason?: string) {
    const [payment, requester] = await Promise.all([
      this.prisma.payment.findUnique({ where: { id: paymentId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } }),
    ]);

    if (!payment) throw new NotFoundException('Payment not found');
    if (!requester) throw new NotFoundException('User not found');
    if (requester.role !== 'MANAGER') throw new BadRequestException('Hanya manager yang dapat mengajukan void');
    if (payment.status !== 'PAID') throw new BadRequestException('Hanya transaksi lunas yang bisa diajukan void');

    const existingPending = await this.prisma.voidRequest.findFirst({
      where: { paymentId, status: 'PENDING' },
      select: { id: true },
    });
    if (existingPending) throw new BadRequestException('Transaksi ini sudah memiliki pengajuan void aktif');

    const request = await this.prisma.voidRequest.create({
      data: {
        paymentId,
        requestedById: userId,
        reason,
      },
      include: {
        payment: { select: { id: true, paymentNumber: true, totalAmount: true } },
        requestedBy: { select: { id: true, name: true, role: true } },
      },
    });

    const owners = await this.prisma.user.findMany({
      where: { role: 'OWNER', isActive: true },
      select: { id: true },
    });

    await Promise.all(owners.map((owner) => this.prisma.notification.create({
      data: {
        userId: owner.id,
        title: 'Permintaan Void Baru',
        message: `${requester.name} mengajukan void transaksi ${payment.paymentNumber}`,
        entity: 'VOID_REQUEST',
        entityId: request.id,
        metadata: {
          paymentId,
          paymentNumber: payment.paymentNumber,
          requestedById: requester.id,
          requestedByName: requester.name,
          reason: reason || null,
        },
      },
    })));

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      entity: 'VoidRequest',
      entityId: request.id,
      afterData: {
        status: 'PENDING',
        paymentId,
        paymentNumber: payment.paymentNumber,
        reason: reason || null,
      },
    });

    return request;
  }

  async listVoidRequests(status?: VoidRequestStatus) {
    return this.prisma.voidRequest.findMany({
      where: status ? { status } : undefined,
      include: {
        payment: { select: { id: true, paymentNumber: true, totalAmount: true, method: true, status: true } },
        requestedBy: { select: { id: true, name: true, role: true } },
        approvedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async approveVoidRequest(voidRequestId: string, ownerId: string) {
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, role: true, name: true } });
    if (!owner || owner.role !== 'OWNER') throw new BadRequestException('Hanya owner yang dapat menyetujui void');

    const voidRequest = await this.prisma.voidRequest.findUnique({
      where: { id: voidRequestId },
      include: { payment: true, requestedBy: { select: { id: true, name: true } } },
    });
    if (!voidRequest) throw new NotFoundException('Pengajuan void tidak ditemukan');
    if (voidRequest.status !== 'PENDING') throw new BadRequestException('Pengajuan void sudah diproses');
    if (voidRequest.payment.status !== 'PAID') throw new BadRequestException('Status transaksi tidak valid untuk approval void');

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({ where: { id: voidRequest.paymentId }, data: { status: 'REFUNDED' } });
      const updatedRequest = await tx.voidRequest.update({
        where: { id: voidRequestId },
        data: { status: 'APPROVED', approvedById: ownerId, decidedAt: new Date() },
        include: {
          payment: { select: { id: true, paymentNumber: true, totalAmount: true, status: true } },
          requestedBy: { select: { id: true, name: true, role: true } },
          approvedBy: { select: { id: true, name: true, role: true } },
        },
      });

      await tx.notification.create({
        data: {
          userId: voidRequest.requestedBy.id,
          title: 'Permintaan Void Disetujui',
          message: `Void transaksi ${voidRequest.payment.paymentNumber} disetujui oleh ${owner.name}`,
          entity: 'VOID_REQUEST',
          entityId: voidRequestId,
          metadata: { paymentId: voidRequest.paymentId, paymentNumber: voidRequest.payment.paymentNumber, status: 'APPROVED' },
        },
      });

      return { updatedPayment, updatedRequest };
    });

    await this.audit.log({
      userId: ownerId,
      action: AuditAction.VOID_PAYMENT,
      entity: 'Payment',
      entityId: voidRequest.paymentId,
      beforeData: { status: 'PAID' },
      afterData: { status: 'REFUNDED', paymentNumber: voidRequest.payment.paymentNumber, approvedBy: owner.name, voidRequestId },
    });

    return result.updatedRequest;
  }

  async rejectVoidRequest(voidRequestId: string, ownerId: string, reason?: string) {
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, role: true, name: true } });
    if (!owner || owner.role !== 'OWNER') throw new BadRequestException('Hanya owner yang dapat menolak void');

    const voidRequest = await this.prisma.voidRequest.findUnique({
      where: { id: voidRequestId },
      include: { payment: true, requestedBy: { select: { id: true, name: true } } },
    });
    if (!voidRequest) throw new NotFoundException('Pengajuan void tidak ditemukan');
    if (voidRequest.status !== 'PENDING') throw new BadRequestException('Pengajuan void sudah diproses');

    const updatedRequest = await this.prisma.voidRequest.update({
      where: { id: voidRequestId },
      data: {
        status: 'REJECTED',
        approvedById: ownerId,
        decidedAt: new Date(),
        rejectReason: reason || null,
      },
      include: {
        payment: { select: { id: true, paymentNumber: true, totalAmount: true, status: true } },
        requestedBy: { select: { id: true, name: true, role: true } },
        approvedBy: { select: { id: true, name: true, role: true } },
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: voidRequest.requestedBy.id,
        title: 'Permintaan Void Ditolak',
        message: `Void transaksi ${voidRequest.payment.paymentNumber} ditolak oleh ${owner.name}`,
        entity: 'VOID_REQUEST',
        entityId: voidRequestId,
        metadata: { paymentId: voidRequest.paymentId, paymentNumber: voidRequest.payment.paymentNumber, status: 'REJECTED', reason: reason || null },
      },
    });

    await this.audit.log({
      userId: ownerId,
      action: AuditAction.UPDATE,
      entity: 'VoidRequest',
      entityId: voidRequestId,
      beforeData: { status: 'PENDING' },
      afterData: { status: 'REJECTED', paymentNumber: voidRequest.payment.paymentNumber, reason: reason || null },
    });

    return updatedRequest;
  }

  async deletePayment(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.prisma.payment.delete({ where: { id: paymentId } });

    await this.audit.log({
      userId,
      action: AuditAction.DELETE_PAYMENT,
      entity: 'Payment',
      entityId: paymentId,
      beforeData: { paymentNumber: payment.paymentNumber, totalAmount: payment.totalAmount },
    });

    return { success: true };
  }

  async findAll(filters: { status?: string; page?: number; limit?: number; startDate?: Date; endDate?: Date; paidById?: string }) {
    const where: any = {};
    const normalizedStatus = this.normalizePaymentStatus(filters.status);
    if (filters.status && !normalizedStatus) {
      throw new BadRequestException('Status pembayaran tidak valid');
    }
    if (normalizedStatus) where.status = normalizedStatus;
    if (filters.paidById) where.paidById = filters.paidById;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          paidBy: { select: { id: true, name: true } },
          billingSession: { include: { table: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('paidById') paidById?: string,
  ) {
    return this.paymentsService.findAll({
      status,
      page,
      limit,
      paidById: user.role === 'CASHIER' ? user.id : paidById,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Post('checkout')
  @Roles('OWNER' as any, 'CASHIER' as any)
  createCheckout(@Body() dto: CreateCheckoutDto, @CurrentUser() user: any) {
    return this.paymentsService.createCheckout(dto, user.id);
  }

  @Patch(':id/confirm')
  @Roles('OWNER' as any, 'CASHIER' as any)
  confirmPayment(
    @Param('id') id: string,
    @Body() dto: ConfirmPaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.confirmPayment(id, dto, user.id);
  }

  @Patch(':id/void')
  @Roles('MANAGER' as any, 'OWNER' as any)
  voidPayment(@Param('id') id: string, @CurrentUser() user: any) {
    return this.paymentsService.voidPayment(id, user.id);
  }

  @Patch(':id/void-request')
  @Roles('MANAGER' as any)
  requestVoid(
    @Param('id') id: string,
    @Body() dto: RequestVoidDto,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.requestVoid(id, user.id, dto.reason);
  }

  @Get('void-requests/list')
  @Roles('OWNER' as any, 'MANAGER' as any)
  listVoidRequests(@Query('status') status?: VoidRequestStatus) {
    return this.paymentsService.listVoidRequests(status);
  }

  @Patch('void-requests/:id/approve')
  @Roles('OWNER' as any)
  approveVoidRequest(@Param('id') id: string, @CurrentUser() user: any) {
    return this.paymentsService.approveVoidRequest(id, user.id);
  }

  @Patch('void-requests/:id/reject')
  @Roles('OWNER' as any)
  rejectVoidRequest(
    @Param('id') id: string,
    @Body() dto: RejectVoidDto,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.rejectVoidRequest(id, user.id, dto.reason);
  }

  @Patch(':id/print')
  @Roles('OWNER' as any, 'CASHIER' as any)
  markPrinted(@Param('id') id: string, @CurrentUser() user: any) {
    return this.paymentsService.markPrinted(id, user.id);
  }

  @Get(':id/receipt')
  @Roles('OWNER' as any, 'MANAGER' as any, 'CASHIER' as any)
  getReceipt(@Param('id') id: string) {
    return this.paymentsService.getReceiptData(id);
  }

  @Patch(':id/delete')
  @Roles('OWNER' as any)
  deletePayment(@Param('id') id: string, @CurrentUser() user: any) {
    return this.paymentsService.deletePayment(id, user.id);
  }
}

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, AuditService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
