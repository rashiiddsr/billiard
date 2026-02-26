import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Injectable,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString } from 'class-validator';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../common/audit/audit.service';

const DEFAULT_COMPANY = {
  id: 'default-company-profile',
  name: 'V-Luxe Billiard',
  address: 'Jl. Hangtuah, Babussalam, Kec. Mandau, Kabupaten Bengkalis, Riau 28784',
  phoneNumber: '085174388234',
  logoUrl: null as string | null,
};

export class UpdateCompanyProfileDto {
  @IsOptional() @IsString() name?: string | null;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phoneNumber?: string;
}

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async getProfile() {
    return this.prisma.companyProfile.upsert({
      where: { id: DEFAULT_COMPANY.id },
      update: {},
      create: DEFAULT_COMPANY,
    });
  }

  async updateProfile(dto: UpdateCompanyProfileDto, updatedById: string) {
    const profile = await this.prisma.companyProfile.upsert({
      where: { id: DEFAULT_COMPANY.id },
      update: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.phoneNumber !== undefined ? { phoneNumber: dto.phoneNumber } : {}),
      },
      create: {
        ...DEFAULT_COMPANY,
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.phoneNumber !== undefined ? { phoneNumber: dto.phoneNumber } : {}),
      },
    });

    await this.audit.log({
      userId: updatedById,
      action: AuditAction.UPDATE,
      entity: 'CompanyProfile',
      entityId: profile.id,
      afterData: dto,
    });

    return profile;
  }

  async updateLogo(logoUrl: string | null, updatedById: string) {
    const profile = await this.prisma.companyProfile.upsert({
      where: { id: DEFAULT_COMPANY.id },
      update: { logoUrl },
      create: { ...DEFAULT_COMPANY, logoUrl },
    });

    await this.audit.log({
      userId: updatedById,
      action: AuditAction.UPDATE,
      entity: 'CompanyProfileLogo',
      entityId: profile.id,
      metadata: { logoUrl },
    });

    return profile;
  }
}

@ApiTags('Company')
@Controller('company')
export class CompanyController {
  constructor(private companyService: CompanyService) {}

  @Get('profile')
  getProfile() {
    return this.companyService.getProfile();
  }

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Roles('OWNER' as any)
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateCompanyProfileDto) {
    return this.companyService.updateProfile(dto, user.id);
  }

  @Post('profile/logo')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Roles('OWNER' as any)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads');
          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 3 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/svg+xml'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
          return;
        }
        cb(new BadRequestException('Format file harus JPG/PNG/SVG'), false);
      },
    }),
  )
  uploadLogo(@CurrentUser() user: any, @UploadedFile() logo?: any) {
    if (!logo) throw new BadRequestException('File logo wajib dipilih');
    return this.companyService.updateLogo(`/uploads/${logo.filename}`, user.id);
  }

  @Patch('profile/logo/reset')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Roles('OWNER' as any)
  resetLogo(@CurrentUser() user: any) {
    return this.companyService.updateLogo(null, user.id);
  }
}

@Module({
  controllers: [CompanyController],
  providers: [CompanyService, AuditService],
  exports: [CompanyService],
})
export class CompanyModule {}
