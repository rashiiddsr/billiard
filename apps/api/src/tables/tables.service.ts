import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';

export class CreateTableDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) hourlyRate: number;
}

export class UpdateTableDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) hourlyRate?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    const gateway = await this.prisma.iotDevice.findFirst({ orderBy: { createdAt: 'asc' } });

    const tables = await this.prisma.table.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        billingSessions: {
          where: { status: 'ACTIVE' },
          take: 1,
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    return tables.map((table) => ({
      ...table,
      iotDevice: gateway
        ? {
            id: gateway.id,
            isOnline: gateway.isOnline,
            lastSeen: gateway.lastSeen,
            signalStrength: gateway.signalStrength,
          }
        : null,
    }));
  }

  async findOne(id: string) {
    const gateway = await this.prisma.iotDevice.findFirst({ orderBy: { createdAt: 'asc' } });

    const table = await this.prisma.table.findUnique({
      where: { id },
      include: {
        billingSessions: {
          orderBy: { startTime: 'desc' },
          take: 10,
        },
      },
    });
    if (!table) throw new NotFoundException('Table not found');

    return {
      ...table,
      iotDevice: gateway,
    };
  }

  async create(dto: CreateTableDto) {
    const existing = await this.prisma.table.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Table name already exists');

    return this.prisma.table.create({
      data: {
        name: dto.name,
        description: dto.description,
        hourlyRate: dto.hourlyRate,
      },
    });
  }

  async update(id: string, dto: UpdateTableDto) {
    await this.findOne(id);
    return this.prisma.table.update({ where: { id }, data: dto });
  }
}
