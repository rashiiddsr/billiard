import { Controller, Post, Get, Body, Query, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IotService } from './iot.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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

  // Admin endpoints
  @Get('devices')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('OWNER' as any, 'MANAGER' as any)
  listDevices() {
    return this.iotService.listDevices();
  }
}
