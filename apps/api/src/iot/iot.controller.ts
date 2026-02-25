import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  UseGuards,
  Param,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IotService } from './iot.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

class CreateDeviceDto {
  @IsString()
  name: string;
}

class DeviceActionDto {
  @IsString()
  deviceId: string;
}

@ApiTags('IoT')
@Controller('iot')
export class IotController {
  constructor(private iotService: IotService) {}

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

  @Get('devices/config')
  async getDeviceConfig(
    @Query('deviceId') deviceId: string,
    @Headers('x-device-token') token: string,
    @Headers('x-timestamp') timestamp: string,
    @Headers('x-nonce') nonce: string,
    @Headers('x-signature') signature: string,
  ) {
    return this.iotService.getDeviceConfig(deviceId, token, timestamp, nonce, signature);
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
    return this.iotService.ackCommand(deviceId, token, timestamp, nonce, signature, body.commandId, body.success, rawBody);
  }

  @Get('devices')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('DEVELOPER' as any)
  listDevices() {
    return this.iotService.listDevices();
  }

  @Post('devices')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('DEVELOPER' as any)
  createDevice(@Body() dto: CreateDeviceDto) {
    return this.iotService.createDevice(dto.name);
  }

  @Post('devices/:deviceId/rotate-token')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('DEVELOPER' as any)
  rotateToken(@Param('deviceId') deviceId: string) {
    return this.iotService.rotateDeviceToken(deviceId);
  }

  @Post('test-connection')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('DEVELOPER' as any)
  testConnection(@Body() dto: DeviceActionDto) {
    return this.iotService.testConnection(dto.deviceId);
  }
}
