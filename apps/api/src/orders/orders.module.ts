import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

class OrderItemDto {
  @IsString() menuItemId: string;
  @IsNumber() @Min(1) quantity: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() modifierIds?: string[];
}

export class CreateOrderDto {
  @IsOptional() @IsString() billingSessionId?: string;
  @IsOptional() @IsString() tableId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto) items: OrderItemDto[];
}

export class AddOrderItemDto {
  @IsString() menuItemId: string;
  @IsNumber() @Min(1) quantity: number;
  @IsOptional() @IsString() notes?: string;
}

let orderCounter = 1;

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private generateOrderNumber() {
    const now = new Date();
    return `ORD-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(orderCounter++).padStart(4, '0')}`;
  }

  async createOrder(dto: CreateOrderDto, userId: string) {
    // Validate billing session exists
    if (dto.billingSessionId) {
      const session = await this.prisma.billingSession.findUnique({
        where: { id: dto.billingSessionId },
      });
      if (!session) throw new NotFoundException('Billing session not found');
      if (session.status !== 'ACTIVE') {
        throw new BadRequestException('Billing session is not active');
      }
    }

    // Calculate totals
    let subtotal = new Decimal(0);
    let taxAmount = new Decimal(0);
    const itemsData = [];

    for (const item of dto.items) {
      const menuItem = await this.prisma.menuItem.findUnique({
        where: { id: item.menuItemId },
        include: { stock: true },
      });
      if (!menuItem) throw new NotFoundException(`Menu item ${item.menuItemId} not found`);
      if (!menuItem.isActive) throw new BadRequestException(`Item ${menuItem.name} is not available`);

      // Stock check
      if (menuItem.stock?.trackStock && menuItem.stock.qtyOnHand < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${menuItem.name}. Available: ${menuItem.stock.qtyOnHand}`,
        );
      }

      const unitPrice = new Decimal(menuItem.price.toString());
      const itemSubtotal = unitPrice.mul(item.quantity);
      const itemTax = menuItem.taxFlag ? itemSubtotal.mul(menuItem.taxRate.toString()) : new Decimal(0);

      subtotal = subtotal.plus(itemSubtotal);
      taxAmount = taxAmount.plus(itemTax);

      itemsData.push({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: unitPrice.toFixed(2),
        subtotal: itemSubtotal.toFixed(2),
        taxAmount: itemTax.toFixed(2),
        notes: item.notes,
      });
    }

    const total = subtotal.plus(taxAmount);

    const order = await this.prisma.order.create({
      data: {
        orderNumber: this.generateOrderNumber(),
        billingSessionId: dto.billingSessionId,
        tableId: dto.tableId,
        notes: dto.notes,
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        createdById: userId,
        status: 'DRAFT',
        items: {
          create: itemsData,
        },
      },
      include: {
        items: { include: { menuItem: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      userId,
      action: AuditAction.CREATE,
      entity: 'Order',
      entityId: order.id,
      afterData: { orderNumber: order.orderNumber, total, itemCount: dto.items.length },
    });

    return order;
  }

  async confirmOrder(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'DRAFT') throw new BadRequestException('Order is not in DRAFT status');

    return this.prisma.order.update({
      where: { id },
      data: { status: 'CONFIRMED' },
      include: { items: { include: { menuItem: true } } },
    });
  }

  async cancelOrder(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED') throw new BadRequestException('Order already cancelled');

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      entity: 'Order',
      entityId: id,
      metadata: { action: 'cancel' },
    });

    return updated;
  }

  async findAll(filters: { billingSessionId?: string; status?: string; page?: number; limit?: number }) {
    const where: any = {};
    if (filters.billingSessionId) where.billingSessionId = filters.billingSessionId;
    if (filters.status) where.status = filters.status;

    const page = filters.page || 1;
    const limit = filters.limit || 20;

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: { include: { menuItem: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { menuItem: true, modifiers: { include: { modifier: true } } } },
        createdBy: { select: { id: true, name: true } },
        billingSession: { include: { table: true } },
        payments: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
}

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  findAll(
    @Query('billingSessionId') billingSessionId?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ordersService.findAll({ billingSessionId, status, page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Post()
  @Roles('OWNER' as any, 'CASHIER' as any)
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: any) {
    return this.ordersService.createOrder(dto, user.id);
  }

  @Patch(':id/confirm')
  @Roles('OWNER' as any, 'CASHIER' as any)
  confirm(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ordersService.confirmOrder(id, user.id);
  }

  @Patch(':id/cancel')
  @Roles('OWNER' as any, 'CASHIER' as any)
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ordersService.cancelOrder(id, user.id);
  }
}

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, AuditService],
  exports: [OrdersService],
})
export class OrdersModule {}
