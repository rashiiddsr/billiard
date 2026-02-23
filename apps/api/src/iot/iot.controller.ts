import { Controller, Post, Get, Body, Query, Headers, UseGuards, Patch, Delete } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IotService } from './iot.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

class GatewaySettingsDto {
  @IsString()
  deviceId: string;
}

@ApiTags('IoT')
@Controller('iot')
export class IotController {
  constructor(private iotService: IotService) {}

  // Device endpoints (auth via HMAC, not JWT)
  @Post('devices/heartbeat')
  async heartbeat(
    @Headers('x-device-id') deviceId: string,
    @Headers('x-device-token') token: string,
    @Headers('x-timestamp') timestamp: string,
    @Headers('x-nonce') nonce: string,
    @Headers('x-signature') signature: string,
    @Body() body: { signalStrength?: number },
  ) {
    return this.iotService.heartbeat(deviceId, token, timestamp, nonce, signature, body.signalStrength);
  }

  @Get('commands/pull')
  async pullCommand(
    @Query('deviceId') deviceId: string,
    @Headers('x-device-token') token: string,
    @Headers('x-timestamp') timestamp: string,
    @Headers('x-nonce') nonce: string,
    @Headers('x-signature') signature: string,
  ) {
    return this.iotService.pullCommand(deviceId, token, timestamp, nonce, signature);
  }

  @Post('commands/ack')
  async ackCommand(
    @Headers('x-device-id') deviceId: string,
    @Headers('x-device-token') token: string,
    @Headers('x-timestamp') timestamp: string,
    @Headers('x-nonce') nonce: string,
    @Headers('x-signature') signature: string,
    @Body() body: { commandId: string; success: boolean },
  ) {
    const rawBody = JSON.stringify(body);
    return this.iotService.ackCommand(
      deviceId, token, timestamp, nonce, signature,
      body.commandId, body.success, rawBody,
    );
  }

  // Owner IoT settings (single ESP gateway)
  @Get('settings')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('OWNER' as any)
  getSettings() {
    return this.iotService.getGatewaySettings();
  }

  @Patch('settings/gateway')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('OWNER' as any)
  setGateway(@Body() dto: GatewaySettingsDto) {
    return this.iotService.setGatewayDevice(dto.deviceId);
  }

  @Delete('settings/gateway')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('OWNER' as any)
  clearGatewayOverride() {
    return this.iotService.clearGatewayOverride();
  }

  @Get('devices')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('OWNER' as any)
  listDevices() {
    return this.iotService.listDevices();
  }
}
