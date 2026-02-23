import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString, IsNumber, IsBoolean, IsOptional, Min,
  IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '@prisma/client';

export class CreateMenuItemDto {
  @IsString() sku: string;
  @IsString() name: string;
  @IsString() category: string;
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
    const items = await this.prisma.menuItem.findMany({
      select: { category: true },
      distinct: ['category'],
      where: { isActive: true },
    });
    return items.map((i) => i.category);
  }

  async create(dto: CreateMenuItemDto, userId: string) {
    const existing = await this.prisma.menuItem.findUnique({ where: { sku: dto.sku } });
    if (existing) throw new ConflictException('SKU already exists');

    const item = await this.prisma.menuItem.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        category: dto.category,
        price: dto.price,
        cost: dto.cost,
        taxFlag: dto.taxFlag || false,
        description: dto.description,
        imageUrl: dto.imageUrl,
        changedById: userId,
      },
    });

    // Create stock record
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

    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: { ...dto, changedById: userId },
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
