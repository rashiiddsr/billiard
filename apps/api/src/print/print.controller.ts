import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrintService } from './print.service';

@UseGuards(AuthGuard('jwt'))
@Controller('print')
export class PrintController {
  constructor(private readonly printService: PrintService) {}

  @Get('qz/certificate')
  getQzCertificate() {
    return this.printService.getQzCertificate();
  }

  @Post('qz/sign')
  signQzPayload(
    @Body('payload') payload: string,
    @Headers('x-api-key') apiKey?: string,
  ) {
    return this.printService.signQzPayload(payload, apiKey);
  }
}
