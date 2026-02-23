import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { IoTCommandType, IoTCommandStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// In-memory nonce store (use Redis in production)
const usedNonces = new Map<string, Date>();

@Injectable()
export class IotService {
  private gatewayDeviceOverrideId: string | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    // Clean up old nonces every minute
    setInterval(() => this.cleanupNonces(), 60 * 1000);
  }

  private cleanupNonces() {
    const windowMs = (parseInt(this.config.get('IOT_NONCE_WINDOW_SECONDS') || '300')) * 1000;
    const cutoff = new Date(Date.now() - windowMs);
    for (const [nonce, time] of usedNonces.entries()) {
      if (time < cutoff) usedNonces.delete(nonce);
    }
  }

  private getGatewayDeviceId() {
    return this.gatewayDeviceOverrideId || this.config.get<string>('IOT_GATEWAY_DEVICE_ID') || null;
  }

  private async verifyDeviceRequest(
    deviceId: string,
    token: string,
    timestamp: string,
    nonce: string,
    signature: string,
    body?: string,
  ) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new UnauthorizedException('Device not found');

    // Verify token
    const tokenValid = await bcrypt.compare(token, device.deviceToken);
    if (!tokenValid) throw new UnauthorizedException('Invalid device token');

    // Verify timestamp window
    const ts = parseInt(timestamp);
    const windowSec = parseInt(this.config.get('IOT_NONCE_WINDOW_SECONDS') || '300');
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > windowSec) {
      throw new BadRequestException('Request timestamp out of window');
    }

    // Check nonce
    if (usedNonces.has(nonce)) {
      throw new BadRequestException('Nonce already used (replay attack detected)');
    }

    // Verify HMAC
    const secret = this.config.get('IOT_HMAC_SECRET');
    const message = `${deviceId}:${timestamp}:${nonce}:${body || ''}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(message).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    // Mark nonce as used
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
      data: {
        lastSeen: new Date(),
        signalStrength: signalStrength ?? null,
        isOnline: true,
      },
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

    // Get latest PENDING command
    const command = await this.prisma.iotCommand.findFirst({
      where: { deviceId, status: IoTCommandStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });

    if (!command) return { command: null };

    // Mark as SENT
    await this.prisma.iotCommand.update({
      where: { id: command.id },
      data: { status: IoTCommandStatus.SENT, sentAt: new Date() },
    });

    // Update device last seen
    await this.prisma.iotDevice.update({
      where: { id: deviceId },
      data: { lastSeen: new Date(), isOnline: true },
    });

    return {
      command: {
        id: command.id,
        type: command.command,
        payload: command.payload,
      },
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
    if (!command || command.deviceId !== deviceId) {
      throw new BadRequestException('Command not found');
    }

    return this.prisma.iotCommand.update({
      where: { id: commandId },
      data: {
        status: success ? IoTCommandStatus.ACK : IoTCommandStatus.FAILED,
        ackedAt: new Date(),
      },
    });
  }

  private async resolveCommandTargetDevice() {
    const gatewayDeviceId = this.getGatewayDeviceId();
    if (!gatewayDeviceId) {
      throw new BadRequestException('IOT_GATEWAY_DEVICE_ID is not configured. Set it in Owner > IoT Settings');
    }

    const gateway = await this.prisma.iotDevice.findUnique({ where: { id: gatewayDeviceId } });
    if (!gateway) {
      throw new NotFoundException(`Gateway device ${gatewayDeviceId} not found`);
    }

    return gateway;
  }

  // Internal: single ESP gateway mode only
  async sendCommand(tableId: string, commandType: IoTCommandType | string) {
    const device = await this.resolveCommandTargetDevice();

    const nonce = uuidv4();
    const command = await this.prisma.iotCommand.create({
      data: {
        deviceId: device.id,
        command: commandType as IoTCommandType,
        nonce,
        status: IoTCommandStatus.PENDING,
        payload: { tableId },
      },
    });

    if (!device.isOnline || !device.lastSeen ||
        Date.now() - device.lastSeen.getTime() > 5 * 60 * 1000) {
      console.warn(`Gateway device ${device.id} appears offline, command ${commandType} queued`);
    }

    return command;
  }

  async getGatewaySettings() {
    const gatewayDeviceId = this.getGatewayDeviceId();
    const gatewayDevice = gatewayDeviceId
      ? await this.prisma.iotDevice.findUnique({
          where: { id: gatewayDeviceId },
          include: { table: { select: { id: true, name: true } } },
        })
      : null;

    return {
      mode: 'SINGLE_GATEWAY',
      gatewayDeviceId,
      hasOverride: !!this.gatewayDeviceOverrideId,
      gatewayDevice,
    };
  }

  async setGatewayDevice(deviceId: string) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found');

    this.gatewayDeviceOverrideId = deviceId;
    return this.getGatewaySettings();
  }

  async clearGatewayOverride() {
    this.gatewayDeviceOverrideId = null;
    return this.getGatewaySettings();
  }

  async listDevices() {
    return this.prisma.iotDevice.findMany({
      include: {
        table: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
