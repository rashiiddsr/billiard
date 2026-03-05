import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../common/prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

type PackageItemType = 'BILLING' | 'MENU_ITEM';

class BillingPackageItemDto {
  @IsIn(['BILLING', 'MENU_ITEM'])
  type: PackageItemType;

  @IsOptional()
  @IsString()
  menuItemId?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

class UpsertBillingPackageDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BillingPackageItemDto)
  items: BillingPackageItemDto[];
}

@Injectable()
export class PackagesService {
  constructor(private prisma: PrismaService) {}

  private normalizeName(name: string) {
    return name.trim().replace(/\s+/g, ' ');
  }

  private async validateItems(dto: UpsertBillingPackageDto) {
    const billingItems = dto.items.filter((item) => item.type === 'BILLING');
    if (billingItems.length > 1) throw new BadRequestException('Item billing maksimal 1 per paket');

    if (billingItems.length === 1) {
      if (!dto.durationMinutes || dto.durationMinutes < 1) {
        throw new BadRequestException('Durasi wajib diisi bila paket memiliki komponen billing');
      }
      if (billingItems[0].quantity !== 1) {
        throw new BadRequestException('Kuantitas item billing harus 1');
      }
    }

    const menuItems = dto.items.filter((item) => item.type === 'MENU_ITEM');
    for (const item of menuItems) {
      if (!item.menuItemId) {
        throw new BadRequestException('Menu wajib dipilih untuk item F&B');
      }
      const menu = await this.prisma.menuItem.findUnique({
        where: { id: item.menuItemId },
        select: { id: true, isActive: true, name: true },
      });
      if (!menu) throw new BadRequestException(`Menu item ${item.menuItemId} tidak ditemukan`);
      if (!menu.isActive) throw new BadRequestException(`Menu ${menu.name} sedang nonaktif`);
    }

    for (const item of dto.items) {
      if (item.type === 'BILLING' && item.menuItemId) {
        throw new BadRequestException('Item BILLING tidak boleh memiliki menuItemId');
      }
      if (item.type === 'MENU_ITEM' && item.quantity < 1) {
        throw new BadRequestException('Kuantitas item F&B minimal 1');
      }
    }
  }

  async list() {
    return this.prisma.billingPackage.findMany({
      include: { items: { include: { menuItem: true }, orderBy: { createdAt: 'asc' } } },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async activeForCashier() {
    return this.prisma.billingPackage.findMany({
      where: { isActive: true },
      include: { items: { include: { menuItem: true }, orderBy: { createdAt: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: UpsertBillingPackageDto) {
    const normalizedName = this.normalizeName(dto.name || '');
    if (!normalizedName) throw new BadRequestException('Nama paket wajib diisi');

    await this.validateItems(dto);

    return this.prisma.billingPackage.create({
      data: {
        name: normalizedName,
        durationMinutes: dto.durationMinutes,
        price: dto.price,
        isActive: dto.isActive ?? true,
        items: {
          create: dto.items.map((item) => ({
            type: item.type,
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: { items: { include: { menuItem: true }, orderBy: { createdAt: 'asc' } } },
    });
  }

  async update(id: string, dto: UpsertBillingPackageDto) {
    const existing = await this.prisma.billingPackage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Paket tidak ditemukan');

    const normalizedName = this.normalizeName(dto.name || '');
    if (!normalizedName) throw new BadRequestException('Nama paket wajib diisi');

    await this.validateItems(dto);

    await this.prisma.billingPackage.update({
      where: { id },
      data: {
        name: normalizedName,
        durationMinutes: dto.durationMinutes,
        price: dto.price,
        isActive: dto.isActive ?? existing.isActive,
        items: {
          deleteMany: {},
          create: dto.items.map((item) => ({
            type: item.type,
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
    });

    return this.prisma.billingPackage.findUnique({
      where: { id },
      include: { items: { include: { menuItem: true }, orderBy: { createdAt: 'asc' } } },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.billingPackage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Paket tidak ditemukan');
    await this.prisma.billingPackage.delete({ where: { id } });
    return { success: true };
  }
}

@ApiTags('Packages')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('packages')
export class PackagesController {
  constructor(private readonly service: PackagesService) {}

  @Get()
  @Roles('OWNER' as any, 'MANAGER' as any)
  list() {
    return this.service.list();
  }

  @Get('active')
  @Roles('OWNER' as any, 'MANAGER' as any, 'CASHIER' as any)
  active() {
    return this.service.activeForCashier();
  }

  @Post()
  @Roles('OWNER' as any, 'MANAGER' as any)
  create(@Body() dto: UpsertBillingPackageDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER' as any, 'MANAGER' as any)
  update(@Param('id') id: string, @Body() dto: UpsertBillingPackageDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER' as any, 'MANAGER' as any)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({
  controllers: [PackagesController],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
