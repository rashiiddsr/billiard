import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { Role, SessionStatus, TableStatus } from '@prisma/client';
import { IotService } from '../iot/iot.service';

export class CreateTableDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) hourlyRate: number;
  @IsString() iotDeviceId: string;
  @IsNumber() relayChannel: number;
  @IsNumber() gpioPin: number;
}

export class UpdateTableDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) hourlyRate?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() iotDeviceId?: string;
  @IsOptional() @IsNumber() relayChannel?: number;
  @IsOptional() @IsNumber() gpioPin?: number;
}

export class TestTableDto {
  @IsOptional() @IsNumber() @Min(1) durationMinutes?: number;
}

@Injectable()
export class TablesService {
  private readonly logger = new Logger(TablesService.name);

  constructor(
    private prisma: PrismaService,
    private iotService: IotService,
  ) {}

  private sortByNameNatural<T extends { name: string }>(items: T[]) {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }));
  }

  private async ensureDeviceAndMapping(
    iotDeviceId: string,
    relayChannel: number,
    gpioPin: number,
    currentTableId?: string,
  ) {
    if (!this.iotService.isAllowedRelayChannel(relayChannel)) {
      throw new BadRequestException('Relay channel tidak valid untuk ESP (gunakan channel 0-15)');
    }

    if (!this.iotService.isAllowedGpioPin(gpioPin)) {
      throw new BadRequestException('GPIO pin tidak valid untuk ESP (gunakan daftar pin standar)');
    }

    const device = await this.prisma.iotDevice.findUnique({ where: { id: iotDeviceId } });
    if (!device) throw new BadRequestException('Device IoT tidak ditemukan');

    const [existingRelay, existingGpio] = await Promise.all([
      this.prisma.table.findFirst({
        where: {
          iotDeviceId,
          relayChannel,
          ...(currentTableId ? { id: { not: currentTableId } } : {}),
        },
      }),
      this.prisma.table.findFirst({
        where: {
          iotDeviceId,
          gpioPin,
          ...(currentTableId ? { id: { not: currentTableId } } : {}),
        },
      }),
    ]);

    if (existingRelay) {
      throw new ConflictException('Relay channel tersebut sudah dipakai meja lain di device ini');
    }

    if (existingGpio) {
      throw new ConflictException('GPIO tersebut sudah dipakai meja lain di device ini');
    }

    return device;
  }

  async findAll(includeInactive = false) {
    const tables = await this.prisma.table.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        iotDevice: { select: { id: true, name: true, isOnline: true, isActive: true, lastSeen: true, signalStrength: true } },
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
        iotDevice: { select: { id: true, name: true, isOnline: true, isActive: true, lastSeen: true, signalStrength: true } },
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

    await this.ensureDeviceAndMapping(dto.iotDeviceId, dto.relayChannel, dto.gpioPin);

    const nextId = await this.generateNextTableId();

    return this.prisma.table.create({
      data: {
        id: nextId,
        name: dto.name,
        description: dto.description,
        hourlyRate: dto.hourlyRate,
        iotDeviceId: dto.iotDeviceId,
        relayChannel: dto.relayChannel,
        gpioPin: dto.gpioPin,
      },
    });
  }

  async update(id: string, dto: UpdateTableDto, actorRole: Role) {
    const existing = await this.findOne(id);

    if (actorRole === Role.OWNER && (dto.name !== undefined || dto.description !== undefined || dto.iotDeviceId !== undefined || dto.relayChannel !== undefined || dto.gpioPin !== undefined)) {
      throw new BadRequestException('Owner can only update hourlyRate and isActive for tables');
    }

    if (dto.name !== undefined) {
      const sameName = await this.prisma.table.findUnique({ where: { name: dto.name } });
      if (sameName && sameName.id !== id) throw new ConflictException('Table name already exists');
    }

    const nextDeviceId = dto.iotDeviceId ?? existing.iotDeviceId;
    const nextRelayChannel = dto.relayChannel ?? existing.relayChannel;
    const nextGpioPin = dto.gpioPin ?? existing.gpioPin;

    if (actorRole === Role.DEVELOPER && (dto.iotDeviceId !== undefined || dto.relayChannel !== undefined || dto.gpioPin !== undefined)) {
      await this.ensureDeviceAndMapping(nextDeviceId, nextRelayChannel, nextGpioPin, id);
    }

    return this.prisma.table.update({ where: { id }, data: dto });
  }

  async startTesting(id: string, actorRole: Role, dto?: TestTableDto) {
    const table = await this.prisma.table.findUnique({
      where: { id },
      include: { billingSessions: { where: { status: SessionStatus.ACTIVE }, select: { id: true }, take: 1 } },
    });
    if (!table) throw new NotFoundException('Table not found');
    if (!table.isActive) throw new BadRequestException('Meja nonaktif tidak bisa ditesting');
    if (table.billingSessions.length > 0 || table.status === TableStatus.OCCUPIED) {
      throw new BadRequestException('Meja sedang dalam sesi billing aktif');
    }
    if (table.status !== TableStatus.AVAILABLE) {
      throw new BadRequestException('Meja sedang dalam proses testing');
    }

    const durationSeconds = actorRole === Role.DEVELOPER
      ? Math.round((dto?.durationMinutes || 0) * 60)
      : 20;

    if (actorRole === Role.DEVELOPER && durationSeconds <= 0) {
      throw new BadRequestException('Durasi testing (menit) wajib diisi');
    }

    await this.prisma.table.update({ where: { id }, data: { status: TableStatus.MAINTENANCE } });

    try {
      await this.iotService.sendCommand(id, 'LIGHT_ON');
    } catch (error) {
      await this.prisma.table.update({ where: { id }, data: { status: TableStatus.AVAILABLE } });
      throw error;
    }

    setTimeout(async () => {
      try {
        await this.iotService.sendCommand(id, 'LIGHT_OFF');
      } catch (error) {
        this.logger.error(`Failed sending LIGHT_OFF for table ${id} after testing`, error as any);
      } finally {
        await this.prisma.table.update({ where: { id }, data: { status: TableStatus.AVAILABLE } });
      }
    }, durationSeconds * 1000);

    return {
      tableId: id,
      status: 'TESTING',
      durationSeconds,
      message: `Testing lampu dimulai selama ${durationSeconds} detik`,
    };
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
