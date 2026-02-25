import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { IoTCommandType, IoTCommandStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const usedNonces = new Map<string, Date>();

@Injectable()
export class IotService {
  // ESP GPIO mapping (16 channel)
  static readonly ALLOWED_GPIO_PINS = [23, 19, 18, 27, 26, 25, 33, 32, 14, 13, 12, 5, 17, 16, 4, 15];
  static readonly ALLOWED_RELAY_CHANNELS = Array.from({ length: 16 }, (_, i) => i);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    setInterval(() => this.cleanupNonces(), 60 * 1000);
  }

  isAllowedGpioPin(pin: number) {
    return IotService.ALLOWED_GPIO_PINS.includes(pin);
  }

  isAllowedRelayChannel(channel: number) {
    return IotService.ALLOWED_RELAY_CHANNELS.includes(channel);
  }

  private cleanupNonces() {
    const windowMs = parseInt(this.config.get('IOT_NONCE_WINDOW_SECONDS') || '300', 10) * 1000;
    const cutoff = new Date(Date.now() - windowMs);
    for (const [nonce, time] of usedNonces.entries()) {
      if (time < cutoff) usedNonces.delete(nonce);
    }
  }

  private async verifyDeviceRequest(
    deviceId: string,
    token: string,
    timestamp: string,
    nonce: string,
    signature: string,
    body?: string,
  ) {
    if (!deviceId || !token || !timestamp || !nonce || !signature) {
      throw new BadRequestException('Missing required device auth headers');
    }

    const device = await this.prisma.iotDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new UnauthorizedException('Device not found');

    const tokenValid = await bcrypt.compare(token, device.deviceToken);
    if (!tokenValid) throw new UnauthorizedException('Invalid device token');

    const ts = parseInt(timestamp, 10);
    const windowSec = parseInt(this.config.get('IOT_NONCE_WINDOW_SECONDS') || '300', 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > windowSec) {
      throw new BadRequestException('Request timestamp out of window');
    }

    if (usedNonces.has(nonce)) {
      throw new BadRequestException('Nonce already used (replay attack detected)');
    }

    const secret = this.config.get<string>('IOT_HMAC_SECRET');
    if (!secret) {
      throw new BadRequestException('IOT_HMAC_SECRET is not configured');
    }

    if (!/^[a-fA-F0-9]{64}$/.test(signature)) {
      throw new UnauthorizedException('Invalid HMAC signature format');
    }

    const message = `${deviceId}:${timestamp}:${nonce}:${body || ''}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(message).digest('hex');
    if (signature.length !== expectedSig.length) {
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    if (!crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSig, 'utf8'))) {
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    usedNonces.set(nonce, new Date());
    return device;
  }

  async heartbeat(
    deviceId: string,
    token: string,
    timestamp: string,
    nonce: string,
    signature: string,
    signalStrength?: number,
  ) {
    await this.verifyDeviceRequest(deviceId, token, timestamp, nonce, signature);

    return this.prisma.iotDevice.update({
      where: { id: deviceId },
      data: { lastSeen: new Date(), signalStrength: signalStrength ?? null, isOnline: true },
    });
  }

  async pullCommand(
    deviceId: string,
    token: string,
    timestamp: string,
    nonce: string,
    signature: string,
  ) {
    await this.verifyDeviceRequest(deviceId, token, timestamp, nonce, signature);

    const command = await this.prisma.iotCommand.findFirst({
      where: { deviceId, status: IoTCommandStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });

    if (!command) return { command: null };

    await this.prisma.iotCommand.update({
      where: { id: command.id },
      data: { status: IoTCommandStatus.SENT, sentAt: new Date() },
    });

    await this.prisma.iotDevice.update({ where: { id: deviceId }, data: { lastSeen: new Date(), isOnline: true } });

    return { command: { id: command.id, type: command.command, payload: command.payload } };
  }

  async getDeviceConfig(
    deviceId: string,
    token: string,
    timestamp: string,
    nonce: string,
    signature: string,
  ) {
    const device = await this.verifyDeviceRequest(deviceId, token, timestamp, nonce, signature);

    await this.prisma.iotDevice.update({
      where: { id: deviceId },
      data: { lastSeen: new Date(), isOnline: true },
    });

    const tablesRaw = await this.prisma.table.findMany({
      where: { iotDeviceId: deviceId, isActive: true },
      select: {
        id: true,
        name: true,
        relayChannel: true,
        gpioPin: true,
        isActive: true,
      },
    });

    const tables = tablesRaw.sort((a, b) =>
      a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }),
    );

    return {
      device: {
        id: device.id,
        name: device.name,
        isOnline: true,
      },
      relayChannels: IotService.ALLOWED_RELAY_CHANNELS,
      gpioPins: IotService.ALLOWED_GPIO_PINS,
      tables,
      generatedAt: new Date().toISOString(),
    };
  }

  async ackCommand(
    deviceId: string,
    token: string,
    timestamp: string,
    nonce: string,
    signature: string,
    commandId: string,
    success: boolean,
    body: string,
  ) {
    await this.verifyDeviceRequest(deviceId, token, timestamp, nonce, signature, body);

    const command = await this.prisma.iotCommand.findUnique({ where: { id: commandId } });
    if (!command || command.deviceId !== deviceId) throw new BadRequestException('Command not found');

    return this.prisma.iotCommand.update({
      where: { id: commandId },
      data: { status: success ? IoTCommandStatus.ACK : IoTCommandStatus.FAILED, ackedAt: new Date() },
    });
  }

  async sendCommand(tableId: string, commandType: IoTCommandType | string) {
    const table = await this.prisma.table.findUnique({
      where: { id: tableId },
      include: { iotDevice: true },
    });
    if (!table) throw new NotFoundException('Table not found');

    const nonce = uuidv4();
    const command = await this.prisma.iotCommand.create({
      data: {
        deviceId: table.iotDeviceId,
        command: commandType as IoTCommandType,
        nonce,
        status: IoTCommandStatus.PENDING,
        payload: {
          tableId,
          tableName: table.name,
          relayChannel: table.relayChannel,
          gpioPin: table.gpioPin,
        },
      },
    });

    if (!table.iotDevice.isOnline || !table.iotDevice.lastSeen || Date.now() - table.iotDevice.lastSeen.getTime() > 5 * 60 * 1000) {
      console.warn(`IoT device ${table.iotDevice.id} appears offline, command ${commandType} queued`);
    }

    return command;
  }

  async listDevices() {
    return this.prisma.iotDevice.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { tables: true } } },
    });
  }

  async createDevice(name: string) {
    const exists = await this.prisma.iotDevice.findUnique({ where: { name } });
    if (exists) throw new ConflictException('Nama device sudah dipakai');

    const rawToken = `iot-${crypto.randomBytes(16).toString('hex')}`;
    const tokenHash = await bcrypt.hash(rawToken, 10);

    const device = await this.prisma.iotDevice.create({
      data: {
        name,
        deviceToken: tokenHash,
        isOnline: false,
      },
      include: { _count: { select: { tables: true } } },
    });

    return {
      device,
      privateToken: rawToken,
      relayChannels: IotService.ALLOWED_RELAY_CHANNELS,
      gpioPins: IotService.ALLOWED_GPIO_PINS,
      note: 'Simpan private token ini sekarang. Token tidak bisa dilihat lagi.',
    };
  }

  async rotateDeviceToken(deviceId: string) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found');

    const rawToken = `iot-${crypto.randomBytes(16).toString('hex')}`;
    const tokenHash = await bcrypt.hash(rawToken, 10);

    await this.prisma.iotDevice.update({
      where: { id: deviceId },
      data: { deviceToken: tokenHash },
    });

    return {
      deviceId,
      privateToken: rawToken,
      note: 'Token lama tidak berlaku. Simpan token baru ini sekarang.',
    };
  }

  async testConnection(deviceId: string) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found');

    const online = !!device.isOnline && !!device.lastSeen && Date.now() - device.lastSeen.getTime() <= 5 * 60 * 1000;

    return {
      deviceId,
      online,
      lastSeen: device.lastSeen,
      signalStrength: device.signalStrength,
      message: online ? 'Perangkat IoT terhubung' : 'Perangkat IoT masih offline/tidak heartbeat',
    };
  }
}
