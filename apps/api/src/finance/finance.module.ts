import { Injectable, BadRequestException } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsDateString, Min, IsIn } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export const EXPENSE_CATEGORIES = ['Operasional', 'Gaji', 'Listrik', 'Air', 'Perlengkapan', 'Perawatan', 'Lainnya'] as const;

export class CreateExpenseDto {
  @IsString() @IsIn(EXPENSE_CATEGORIES as unknown as string[]) category: string;
  @IsDateString() date: string;
  @IsNumber() @Min(0) amount: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() proofUrl?: string;
}

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async getReport(startDate: Date, endDate: Date) {
    // Revenue from billiard
    const billingRevenue = await this.prisma.payment.aggregate({
      where: {
        status: 'PAID',
        paidAt: { gte: startDate, lte: endDate },
      },
      _sum: { billingAmount: true, fnbAmount: true, totalAmount: true, discountAmount: true, taxAmount: true },
    });

    // Revenue per table
    const perTableRevenue = await this.prisma.payment.findMany({
      where: {
        status: 'PAID',
        paidAt: { gte: startDate, lte: endDate },
        billingSessionId: { not: null },
      },
      include: {
        billingSession: { include: { table: { select: { id: true, name: true } } } },
      },
    });

    const tableRevMap: Record<string, { tableName: string; revenue: Decimal; sessions: number }> = {};
    for (const p of perTableRevenue) {
      const tableId = p.billingSession?.tableId;
      const tableName = p.billingSession?.table?.name || 'Unknown';
      if (tableId) {
        if (!tableRevMap[tableId]) {
          tableRevMap[tableId] = { tableName, revenue: new Decimal(0), sessions: 0 };
        }
        tableRevMap[tableId].revenue = tableRevMap[tableId].revenue.plus(
          new Decimal(p.billingAmount.toString()),
        );
        tableRevMap[tableId].sessions += 1;
      }
    }

    // Expenses
    const expenseData = await this.prisma.expense.aggregate({
      where: { date: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
    });

    const expenses = await this.prisma.expense.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });

    const totalRevenue = new Decimal(billingRevenue._sum.totalAmount?.toString() || '0');
    const totalExpenses = new Decimal(expenseData._sum.amount?.toString() || '0');
    const netProfit = totalRevenue.minus(totalExpenses);

    // Payment method breakdown
    const paymentMethods = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { status: 'PAID', paidAt: { gte: startDate, lte: endDate } },
      _sum: { totalAmount: true },
      _count: true,
    });

    return {
      period: { startDate, endDate },
      revenue: {
        billiard: billingRevenue._sum.billingAmount?.toString() || '0',
        fnb: billingRevenue._sum.fnbAmount?.toString() || '0',
        total: totalRevenue.toFixed(2),
        discount: billingRevenue._sum.discountAmount?.toString() || '0',
        tax: billingRevenue._sum.taxAmount?.toString() || '0',
      },
      perTable: Object.entries(tableRevMap).map(([id, v]) => ({
        tableId: id,
        tableName: v.tableName,
        revenue: v.revenue.toFixed(2),
        sessions: v.sessions,
      })),
      expenses: {
        total: totalExpenses.toFixed(2),
        items: expenses,
      },
      netProfit: netProfit.toFixed(2),
      paymentMethods: paymentMethods.map((p) => ({
        method: p.method,
        total: p._sum.totalAmount?.toString() || '0',
        count: p._count,
      })),
    };
  }

  async getDailyRevenue(date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return this.getReport(start, end);
  }

  async createExpense(dto: CreateExpenseDto, userId: string) {
    if (dto.category === 'Lainnya' && !dto.notes?.trim()) {
      throw new BadRequestException('Catatan wajib diisi untuk kategori Lainnya');
    }

    const expense = await this.prisma.expense.create({
      data: {
        category: dto.category,
        date: new Date(dto.date),
        amount: dto.amount,
        notes: dto.notes,
        proofUrl: dto.proofUrl,
        createdById: userId,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    await this.audit.log({
      userId,
      action: AuditAction.CREATE,
      entity: 'Expense',
      entityId: expense.id,
      afterData: dto,
    });

    return expense;
  }

  async listExpenses(filters: {
    startDate?: Date;
    endDate?: Date;
    category?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};
    if (filters.category) where.category = filters.category;
    if (filters.startDate || filters.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = filters.startDate;
      if (filters.endDate) where.date.lte = filters.endDate;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getExpenseCategories() {
    return [...EXPENSE_CATEGORIES];
  }
}

@ApiTags('Finance')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(private financeService: FinanceService) {}

  @Get('report')
  @Roles('OWNER' as any, 'MANAGER' as any)
  getReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = endDate ? new Date(endDate) : new Date(new Date().setHours(23, 59, 59, 999));
    return this.financeService.getReport(start, end);
  }

  @Get('report/daily')
  @Roles('OWNER' as any, 'MANAGER' as any)
  getDailyReport(@Query('date') date?: string) {
    return this.financeService.getDailyRevenue(date ? new Date(date) : new Date());
  }

  @Post('expenses')
  @Roles('OWNER' as any, 'MANAGER' as any)
  createExpense(@Body() dto: CreateExpenseDto, @CurrentUser() user: any) {
    return this.financeService.createExpense(dto, user.id);
  }

  @Get('expenses')
  @Roles('OWNER' as any, 'MANAGER' as any)
  listExpenses(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.financeService.listExpenses({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      category,
      page,
      limit,
    });
  }

  @Get('expenses/categories')
  @Roles('OWNER' as any, 'MANAGER' as any)
  getCategories() {
    return this.financeService.getExpenseCategories();
  }
}

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, AuditService],
  exports: [FinanceService],
})
export class FinanceModule {}
