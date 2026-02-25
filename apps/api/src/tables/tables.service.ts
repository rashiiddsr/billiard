import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { Role } from '@prisma/client';

export class CreateTableDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) hourlyRate: number;
  @IsNumber() @Min(0) relayChannel: number;
  @IsNumber() @Min(0) gpioPin: number;
}

export class UpdateTableDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) hourlyRate?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsNumber() @Min(0) relayChannel?: number;
  @IsOptional() @IsNumber() @Min(0) gpioPin?: number;
}

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  private assertRelayChannel(relayChannel: number) {
    if (relayChannel < 0 || relayChannel > 15) {
      throw new BadRequestException('relayChannel must be between 0 and 15');
    }
  }

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
    this.assertRelayChannel(dto.relayChannel);

    const existingName = await this.prisma.table.findUnique({ where: { name: dto.name } });
    if (existingName) throw new ConflictException('Table name already exists');

    const [existingRelay, existingGpio] = await Promise.all([
      this.prisma.table.findUnique({ where: { relayChannel: dto.relayChannel } }),
      this.prisma.table.findUnique({ where: { gpioPin: dto.gpioPin } }),
    ]);

    if (existingRelay) throw new ConflictException('Relay channel already used by another table');
    if (existingGpio) throw new ConflictException('GPIO pin already used by another table');

    const nextId = await this.generateNextTableId();

    return this.prisma.table.create({
      data: {
        id: nextId,
        name: dto.name,
        description: dto.description,
        hourlyRate: dto.hourlyRate,
        relayChannel: dto.relayChannel,
        gpioPin: dto.gpioPin,
      },
    });
  }

  async update(id: string, dto: UpdateTableDto, actorRole: Role) {
    await this.findOne(id);

    if (actorRole === Role.OWNER && (dto.name !== undefined || dto.description !== undefined || dto.relayChannel !== undefined || dto.gpioPin !== undefined)) {
      throw new BadRequestException('Owner can only update hourlyRate and isActive for tables');
    }

    if (dto.relayChannel !== undefined) {
      this.assertRelayChannel(dto.relayChannel);
      const existingRelay = await this.prisma.table.findUnique({ where: { relayChannel: dto.relayChannel } });
      if (existingRelay && existingRelay.id !== id) {
        throw new ConflictException('Relay channel already used by another table');
      }
    }

    if (dto.gpioPin !== undefined) {
      const existingGpio = await this.prisma.table.findUnique({ where: { gpioPin: dto.gpioPin } });
      if (existingGpio && existingGpio.id !== id) {
        throw new ConflictException('GPIO pin already used by another table');
      }
    }

    if (dto.name !== undefined) {
      const existingName = await this.prisma.table.findUnique({ where: { name: dto.name } });
      if (existingName && existingName.id !== id) {
        throw new ConflictException('Table name already exists');
      }
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
