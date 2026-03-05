import { Injectable, NotFoundException } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction, StockActionType } from '@prisma/client';

export class AdjustStockDto {
  @IsNumber() quantityDelta: number;
  @IsEnum(StockActionType) actionType: StockActionType;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAssetDto {
  @IsOptional() @IsNumber() qtyGood?: number;
  @IsOptional() @IsNumber() qtyBad?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateAssetDto {
  @IsString() name: string;
  @IsString() category: string;
  @IsNumber() qtyGood: number;
  @IsNumber() qtyBad: number;
  @IsOptional() @IsString() notes?: string;
}

@Injectable()
export class StockService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async getFnbStock() {
    return this.prisma.stockFnb.findMany({
      include: {
        menuItem: { select: { id: true, name: true, sku: true, category: true, isActive: true } },
      },
      orderBy: { menuItem: { name: 'asc' } },
    });
  }

  async getLowStockAlerts() {
    const stocks = await this.prisma.stockFnb.findMany({
      include: {
        menuItem: { select: { id: true, name: true, sku: true, category: true } },
      },
    });
    return stocks.filter((s) => s.trackStock && s.qtyOnHand <= s.lowStockThreshold);
  }

  async adjustFnbStock(menuItemId: string, dto: AdjustStockDto, userId: string) {
    const stock = await this.prisma.stockFnb.findUnique({ where: { menuItemId } });
    if (!stock) throw new NotFoundException('Stock record not found');

    const before = { qtyOnHand: stock.qtyOnHand };

    const nextQty = stock.qtyOnHand + dto.quantityDelta;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedStock = await tx.stockFnb.update({
        where: { menuItemId },
        data: { qtyOnHand: { increment: dto.quantityDelta } },
        include: { menuItem: true },
      });

      if (nextQty <= 0) {
        await tx.menuItem.update({
          where: { id: menuItemId },
          data: { isActive: false, changedById: userId },
        });
        updatedStock.menuItem.isActive = false;
      }

      await tx.stockAdjustment.create({
        data: {
          stockFnbId: stock.id,
          actionType: dto.actionType,
          quantityDelta: dto.quantityDelta,
          notes: dto.notes,
          performedById: userId,
        },
      });

      return updatedStock;
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      entity: 'StockFnb',
      entityId: stock.id,
      beforeData: before,
      afterData: { qtyOnHand: updated.qtyOnHand, delta: dto.quantityDelta },
    });

    return updated;
  }

  async getStockHistory(menuItemId: string) {
    const stock = await this.prisma.stockFnb.findUnique({ where: { menuItemId } });
    if (!stock) throw new NotFoundException('Stock record not found');

    return this.prisma.stockAdjustment.findMany({
      where: { stockFnbId: stock.id },
      include: { performedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ─── Operational Assets ──────────────────────────────────────────────────

  async getAssets() {
    return this.prisma.operationalAsset.findMany({ orderBy: { category: 'asc' } });
  }

  async createAsset(dto: CreateAssetDto, userId: string) {
    const asset = await this.prisma.operationalAsset.create({ data: dto });
    await this.audit.log({
      userId,
      action: AuditAction.CREATE,
      entity: 'OperationalAsset',
      entityId: asset.id,
      afterData: dto,
    });
    return asset;
  }

  async updateAsset(id: string, dto: UpdateAssetDto, userId: string) {
    const asset = await this.prisma.operationalAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found');

    const qtyGoodChanged = dto.qtyGood !== undefined && dto.qtyGood !== asset.qtyGood;
    const qtyBadChanged = dto.qtyBad !== undefined && dto.qtyBad !== asset.qtyBad;
    const hasStockChange = qtyGoodChanged || qtyBadChanged;

    if (!hasStockChange) {
      return asset;
    }

    const updated = await this.prisma.operationalAsset.update({
      where: { id },
      data: { ...dto, updatedAt: new Date() },
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      entity: 'OperationalAsset',
      entityId: id,
      beforeData: { qtyGood: asset.qtyGood, qtyBad: asset.qtyBad },
      afterData: { qtyGood: updated.qtyGood, qtyBad: updated.qtyBad },
    });

    return updated;
  }
}

@ApiTags('Stock')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('stock')
export class StockController {
  constructor(private stockService: StockService) {}

  @Get('fnb')
  getFnbStock() {
    return this.stockService.getFnbStock();
  }

  @Get('fnb/alerts')
  getLowStockAlerts() {
    return this.stockService.getLowStockAlerts();
  }

  @Get('fnb/:menuItemId/history')
  @Roles('OWNER' as any, 'MANAGER' as any)
  getStockHistory(@Param('menuItemId') menuItemId: string) {
    return this.stockService.getStockHistory(menuItemId);
  }

  @Patch('fnb/:menuItemId/adjust')
  @Roles('OWNER' as any, 'MANAGER' as any)
  adjustStock(
    @Param('menuItemId') menuItemId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: any,
  ) {
    return this.stockService.adjustFnbStock(menuItemId, dto, user.id);
  }

  @Get('assets')
  getAssets() {
    return this.stockService.getAssets();
  }

  @Post('assets')
  @Roles('OWNER' as any, 'MANAGER' as any)
  createAsset(@Body() dto: CreateAssetDto, @CurrentUser() user: any) {
    return this.stockService.createAsset(dto, user.id);
  }

  @Patch('assets/:id')
  @Roles('OWNER' as any, 'MANAGER' as any)
  updateAsset(
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() user: any,
  ) {
    return this.stockService.updateAsset(id, dto, user.id);
  }
}

@Module({
  controllers: [StockController],
  providers: [StockService, AuditService],
  exports: [StockService],
})
export class StockModule {}
