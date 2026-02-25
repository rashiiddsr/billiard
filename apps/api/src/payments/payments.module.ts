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
import { AuditAction, PaymentMethod, PaymentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export class CreateCheckoutDto {
  @IsOptional() @IsString() billingSessionId?: string;
  @IsOptional() @IsArray() orderIds?: string[];
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsString() discountReason?: string;
  @IsOptional() @IsString() discountApprovedById?: string;
  @IsOptional() @IsString() reference?: string; // for QRIS/TRANSFER
  @IsOptional() @IsNumber() @Min(0) amountPaid?: number;
}

export class ConfirmPaymentDto {
  @IsNumber() @Min(0) amountPaid: number;
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

    // Get billing session charge
    if (dto.billingSessionId) {
      const session = await this.prisma.billingSession.findUnique({
        where: { id: dto.billingSessionId },
      });
      if (!session) throw new NotFoundException('Billing session not found');
      billingAmount = new Decimal(session.totalAmount.toString());
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
    const discount = new Decimal(dto.discountAmount || 0);
    const totalAmount = subtotal.plus(taxAmount).minus(discount);

    if (totalAmount.lessThan(0)) {
      throw new BadRequestException('Discount cannot exceed total amount');
    }

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
            discountAmount: discount.toFixed(2),
            discountReason: dto.discountReason,
            discountApprovedById: dto.discountApprovedById,
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

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { isPrinted: true, printedAt: new Date() },
    });
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
      } : null,
      fnbItems: fullPayment.order?.items?.map((item: any) => ({
        name: item.menuItem.name,
        sku: item.menuItem.sku,
        qty: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        notes: item.notes,
      })) || [],
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
    return this.prisma.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });
  }

  async deletePayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.prisma.payment.delete({ where: { id: paymentId } });
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

  @Patch(':id/print')
  @Roles('OWNER' as any, 'CASHIER' as any)
  markPrinted(@Param('id') id: string, @CurrentUser() user: any) {
    return this.paymentsService.markPrinted(id, user.id);
  }

  @Get(':id/receipt')
  @Roles('OWNER' as any, 'CASHIER' as any)
  getReceipt(@Param('id') id: string) {
    return this.paymentsService.getReceiptData(id);
  }

  @Patch(':id/delete')
  @Roles('OWNER' as any)
  deletePayment(@Param('id') id: string) {
    return this.paymentsService.deletePayment(id);
  }
}

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, AuditService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
