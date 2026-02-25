import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsOptional, Min } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '@prisma/client';

export class CreateMenuCategoryDto {
  @IsString() name: string;
  @IsString() skuPrefix: string;
}

export class UpdateMenuCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() skuPrefix?: string;
}

export class CreateMenuItemDto {
  @IsOptional() @IsString() sku?: string;
  @IsString() name: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsNumber() @Min(0) price: number;
  @IsOptional() @IsNumber() cost?: number;
  @IsOptional() @IsBoolean() taxFlag?: boolean;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsNumber() initialStock?: number;
  @IsOptional() @IsNumber() lowStockThreshold?: number;
}

export class UpdateMenuItemDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsNumber() cost?: number;
  @IsOptional() @IsBoolean() taxFlag?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
}

@Injectable()
export class MenuService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(filters: {
    search?: string;
    category?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};
    if (filters.isActive !== undefined) where.isActive = filters.isActive;
    if (filters.category) where.category = filters.category;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;

    const [data, total] = await Promise.all([
      this.prisma.menuItem.findMany({
        where,
        include: { stock: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.menuItem.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getCategories() {
    return this.prisma.menuCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: CreateMenuCategoryDto, userId: string) {
    const payload = {
      name: dto.name.trim(),
      skuPrefix: dto.skuPrefix.trim().toUpperCase(),
    };

    const category = await this.prisma.menuCategory.create({ data: payload });
    await this.audit.log({
      userId,
      action: AuditAction.CREATE,
      entity: 'MenuCategory',
      entityId: category.id,
      afterData: payload,
    });
    return category;
  }

  async updateCategory(id: string, dto: UpdateMenuCategoryDto, userId: string) {
    const existing = await this.prisma.menuCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kategori tidak ditemukan');

    const payload = {
      name: dto.name?.trim(),
      skuPrefix: dto.skuPrefix?.trim().toUpperCase(),
    };

    const category = await this.prisma.menuCategory.update({
      where: { id },
      data: payload,
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      entity: 'MenuCategory',
      entityId: id,
      beforeData: existing,
      afterData: payload,
    });
    return category;
  }

  private buildSku(prefix: string, number: number) {
    return `${prefix}-${number.toString().padStart(3, '0')}`;
  }

  async getNextSku(categoryId: string) {
    const category = await this.prisma.menuCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Kategori tidak ditemukan');
    return { sku: this.buildSku(category.skuPrefix, category.lastSkuNumber + 1) };
  }

  private async resolveCategory(categoryId?: string, categoryName?: string) {
    if (categoryId) {
      const category = await this.prisma.menuCategory.findUnique({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Kategori tidak ditemukan');
      return category;
    }
    if (categoryName) {
      const category = await this.prisma.menuCategory.findUnique({ where: { name: categoryName } });
      if (category) return category;
    }
    throw new BadRequestException('Kategori wajib dipilih dari Manajemen Kategori');
  }

  async create(dto: CreateMenuItemDto, userId: string) {
    const category = await this.resolveCategory(dto.categoryId, dto.category);

    let sku = dto.sku?.trim().toUpperCase();
    if (!sku) {
      const next = await this.prisma.menuCategory.update({
        where: { id: category.id },
        data: { lastSkuNumber: { increment: 1 } },
      });
      sku = this.buildSku(next.skuPrefix, next.lastSkuNumber);
    }

    const existing = await this.prisma.menuItem.findUnique({ where: { sku } });
    if (existing) throw new ConflictException('SKU already exists');

    const item = await this.prisma.menuItem.create({
      data: {
        sku,
        name: dto.name,
        category: category.name,
        price: dto.price,
        cost: dto.cost,
        taxFlag: dto.taxFlag || false,
        description: dto.description,
        imageUrl: dto.imageUrl,
        changedById: userId,
      },
    });

    await this.prisma.stockFnb.create({
      data: {
        menuItemId: item.id,
        qtyOnHand: dto.initialStock || 0,
        lowStockThreshold: dto.lowStockThreshold || 5,
      },
    });

    await this.audit.log({
      userId,
      action: AuditAction.CREATE,
      entity: 'MenuItem',
      entityId: item.id,
      afterData: dto,
    });

    return item;
  }

  async update(id: string, dto: UpdateMenuItemDto, userId: string) {
    const existing = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Menu item not found');

    let categoryName = dto.category;
    if (dto.categoryId) {
      const category = await this.resolveCategory(dto.categoryId);
      categoryName = category.name;
    }

    const { categoryId, ...restDto } = dto;
    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: { ...restDto, category: categoryName, changedById: userId },
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      entity: 'MenuItem',
      entityId: id,
      beforeData: existing,
      afterData: dto,
    });

    return updated;
  }

  async findOne(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: { stock: true, modifiers: true },
    });
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }
}

@ApiTags('Menu')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('menu')
export class MenuController {
  constructor(private menuService: MenuService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('isActive') isActive?: boolean,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.menuService.findAll({ search, category, isActive, page, limit });
  }

  @Get('categories')
  getCategories() {
    return this.menuService.getCategories();
  }

  @Get('categories/:id/next-sku')
  @Roles('OWNER' as any, 'MANAGER' as any)
  getNextSku(@Param('id') id: string) {
    return this.menuService.getNextSku(id);
  }

  @Post('categories')
  @Roles('OWNER' as any, 'MANAGER' as any)
  createCategory(@Body() dto: CreateMenuCategoryDto, @CurrentUser() user: any) {
    return this.menuService.createCategory(dto, user.id);
  }

  @Patch('categories/:id')
  @Roles('OWNER' as any, 'MANAGER' as any)
  updateCategory(@Param('id') id: string, @Body() dto: UpdateMenuCategoryDto, @CurrentUser() user: any) {
    return this.menuService.updateCategory(id, dto, user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.menuService.findOne(id);
  }

  @Post()
  @Roles('OWNER' as any, 'MANAGER' as any)
  create(@Body() dto: CreateMenuItemDto, @CurrentUser() user: any) {
    return this.menuService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('OWNER' as any, 'MANAGER' as any)
  update(@Param('id') id: string, @Body() dto: UpdateMenuItemDto, @CurrentUser() user: any) {
    return this.menuService.update(id, dto, user.id);
  }
}

@Module({
  controllers: [MenuController],
  providers: [MenuService, AuditService],
  exports: [MenuService],
})
export class MenuModule {}
