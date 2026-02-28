import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class PrintService {
  constructor(private readonly config: ConfigService) {}

  getQzCertificate() {
    const certificate = this.config.get<string>('QZ_CERTIFICATE')?.trim();
    if (!certificate) {
      throw new InternalServerErrorException('QZ certificate belum dikonfigurasi');
    }
    return { certificate };
  }

  signQzPayload(payload: string, apiKey?: string) {
    const configuredApiKey = this.config.get<string>('QZ_SIGN_API_KEY')?.trim();
    if (configuredApiKey && configuredApiKey !== apiKey) {
      throw new UnauthorizedException('Invalid print signing API key');
    }

    const privateKey = this.config.get<string>('QZ_PRIVATE_KEY')?.trim();
    if (!privateKey) {
      throw new InternalServerErrorException('QZ private key belum dikonfigurasi');
    }

    const signature = crypto
      .createSign('RSA-SHA512')
      .update(payload, 'utf8')
      .sign(privateKey, 'base64');

    return { signature };
  }
}
