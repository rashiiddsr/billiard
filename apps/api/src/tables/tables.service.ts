import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { Role } from '@prisma/client';
import { IotService } from '../iot/iot.service';

export class CreateTableDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) hourlyRate: number;
  @IsString() iotDeviceId: string;
  @IsNumber() gpioPin: number;
}

export class UpdateTableDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) hourlyRate?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() iotDeviceId?: string;
  @IsOptional() @IsNumber() gpioPin?: number;
}

@Injectable()
export class TablesService {
  constructor(
    private prisma: PrismaService,
    private iotService: IotService,
  ) {}

  private sortByNameNatural<T extends { name: string }>(items: T[]) {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }));
  }

  private async ensureDeviceAndPin(iotDeviceId: string, gpioPin: number, currentTableId?: string) {
    if (!this.iotService.isAllowedGpioPin(gpioPin)) {
      throw new BadRequestException('GPIO pin tidak valid untuk ESP (gunakan daftar pin standar)');
    }

    const device = await this.prisma.iotDevice.findUnique({ where: { id: iotDeviceId } });
    if (!device) throw new BadRequestException('Device IoT tidak ditemukan');

    const existing = await this.prisma.table.findFirst({
      where: {
        iotDeviceId,
        gpioPin,
        ...(currentTableId ? { id: { not: currentTableId } } : {}),
      },
    });

    if (existing) {
      throw new ConflictException('GPIO tersebut sudah dipakai meja lain di device ini');
    }

    return device;
  }

  async findAll(includeInactive = false) {
    const tables = await this.prisma.table.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        iotDevice: { select: { id: true, name: true, isOnline: true, lastSeen: true, signalStrength: true } },
        billingSessions: {
          where: { status: 'ACTIVE' },
          take: 1,
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
    });

    return this.sortByNameNatural(tables);
  }

  async findOne(id: string) {
    const table = await this.prisma.table.findUnique({
      where: { id },
      include: {
        iotDevice: { select: { id: true, name: true, isOnline: true, lastSeen: true, signalStrength: true } },
        billingSessions: {
          orderBy: { startTime: 'desc' },
          take: 10,
        },
      },
    });
    if (!table) throw new NotFoundException('Table not found');
    return table;
  }

  async create(dto: CreateTableDto) {
    const existingName = await this.prisma.table.findUnique({ where: { name: dto.name } });
    if (existingName) throw new ConflictException('Table name already exists');

    await this.ensureDeviceAndPin(dto.iotDeviceId, dto.gpioPin);

    const nextId = await this.generateNextTableId();

    return this.prisma.table.create({
      data: {
        id: nextId,
        name: dto.name,
        description: dto.description,
        hourlyRate: dto.hourlyRate,
        iotDeviceId: dto.iotDeviceId,
        gpioPin: dto.gpioPin,
      },
    });
  }

  async update(id: string, dto: UpdateTableDto, actorRole: Role) {
    const existing = await this.findOne(id);

    if (actorRole === Role.OWNER && (dto.name !== undefined || dto.description !== undefined || dto.iotDeviceId !== undefined || dto.gpioPin !== undefined)) {
      throw new BadRequestException('Owner can only update hourlyRate and isActive for tables');
    }

    if (dto.name !== undefined) {
      const sameName = await this.prisma.table.findUnique({ where: { name: dto.name } });
      if (sameName && sameName.id !== id) throw new ConflictException('Table name already exists');
    }

    const nextDeviceId = dto.iotDeviceId ?? existing.iotDeviceId;
    const nextGpioPin = dto.gpioPin ?? existing.gpioPin;

    if (actorRole === Role.DEVELOPER && (dto.iotDeviceId !== undefined || dto.gpioPin !== undefined)) {
      await this.ensureDeviceAndPin(nextDeviceId, nextGpioPin, id);
    }

    return this.prisma.table.update({ where: { id }, data: dto });
  }

  private async generateNextTableId() {
    const tables = await this.prisma.table.findMany({
      select: { id: true },
      where: { id: { startsWith: 'table-' } },
      orderBy: { id: 'asc' },
    });

    let maxNumber = 0;
    for (const t of tables) {
      const match = /^table-(\d+)$/.exec(t.id);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!Number.isNaN(num)) maxNumber = Math.max(maxNumber, num);
      }
    }

    return `table-${String(maxNumber + 1).padStart(2, '0')}`;
  }
}
