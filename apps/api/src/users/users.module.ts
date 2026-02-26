import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString, IsEmail, IsEnum, IsOptional, IsBoolean, MinLength } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export class CreateUserDto {
  @IsString() name: string;
  @IsEmail() email: string;
  @IsString() phoneNumber: string;
  @IsString() @MinLength(6) password: string;
  @IsEnum(Role) role: Role;
  @IsOptional() @IsString() pin?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phoneNumber?: string;
  @IsOptional() @IsString() @MinLength(6) password?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() pin?: string;
}

export class UpdateOwnProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phoneNumber?: string;
  @IsOptional() @IsString() @MinLength(6) password?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, name: true, email: true, phoneNumber: true, role: true, isActive: true, profileImageUrl: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phoneNumber: true, role: true, isActive: true, profileImageUrl: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, createdById: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already exists');

    if (dto.pin && dto.role !== Role.OWNER) {
      throw new BadRequestException('PIN hanya boleh untuk role OWNER');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const pinHash = dto.role === Role.OWNER && dto.pin ? await bcrypt.hash(dto.pin, 12) : undefined;

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        passwordHash,
        pin: pinHash,
        role: dto.role,
        profileImageUrl: null,
      },
      select: { id: true, name: true, email: true, phoneNumber: true, role: true, isActive: true, profileImageUrl: true, createdAt: true },
    });

    await this.audit.log({
      userId: createdById,
      action: AuditAction.CREATE,
      entity: 'User',
      entityId: user.id,
      afterData: { name: dto.name, email: dto.email, phoneNumber: dto.phoneNumber, role: dto.role },
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto, updatedById: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    if (dto.email && dto.email !== existing.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExists) throw new ConflictException('Email already exists');
    }

    const nextRole = dto.role ?? existing.role;
    if (dto.pin && nextRole !== Role.OWNER) {
      throw new BadRequestException('PIN hanya boleh untuk role OWNER');
    }

    const data: any = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
      delete data.password;
    }
    if (dto.pin) {
      data.pin = await bcrypt.hash(dto.pin, 12);
    }
    if (nextRole !== Role.OWNER) {
      data.pin = null;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, phoneNumber: true, role: true, isActive: true, profileImageUrl: true },
    });

    await this.audit.log({
      userId: updatedById,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: id,
      afterData: { name: dto.name, phoneNumber: dto.phoneNumber, role: dto.role, isActive: dto.isActive },
    });

    return updated;
  }

  async getOwnProfile(userId: string, startDate?: Date, endDate?: Date) {
    const activityWhere: any = { userId };
    if (startDate || endDate) {
      activityWhere.createdAt = {};
      if (startDate) activityWhere.createdAt.gte = startDate;
      if (endDate) activityWhere.createdAt.lte = endDate;
    }

    const [profile, activity] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, phoneNumber: true, role: true, profileImageUrl: true, createdAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: activityWhere,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    if (!profile) throw new NotFoundException('User not found');

    return { ...profile, activityLogs: activity };
  }

  async updateOwnProfile(userId: string, dto: UpdateOwnProfileDto) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException('User not found');

    if (dto.email && dto.email !== existing.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExists) throw new ConflictException('Email already exists');
    }

    const data: any = { name: dto.name, email: dto.email, phoneNumber: dto.phoneNumber };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, phoneNumber: true, role: true, profileImageUrl: true },
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      entity: 'Profile',
      entityId: userId,
      metadata: { fields: Object.keys(dto).filter((k) => Boolean((dto as any)[k])) },
    });

    return updated;
  }

  async updateProfilePhoto(userId: string, profileImageUrl: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { profileImageUrl },
      select: { id: true, name: true, email: true, phoneNumber: true, role: true, profileImageUrl: true },
    });

    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      entity: 'ProfilePhoto',
      entityId: userId,
      metadata: { profileImageUrl },
    });

    return updated;
  }
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile/me')
  @Roles('OWNER' as any, 'MANAGER' as any, 'CASHIER' as any, 'DEVELOPER' as any)
  getOwnProfile(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(`${startDate}T00:00:00`) : undefined;
    const end = endDate ? new Date(`${endDate}T23:59:59.999`) : undefined;
    return this.usersService.getOwnProfile(user.id, start, end);
  }

  @Patch('profile/me')
  @Roles('OWNER' as any, 'MANAGER' as any, 'CASHIER' as any, 'DEVELOPER' as any)
  updateOwnProfile(@CurrentUser() user: any, @Body() dto: UpdateOwnProfileDto) {
    return this.usersService.updateOwnProfile(user.id, dto);
  }

  @Post('profile/me/photo')
  @Roles('OWNER' as any, 'MANAGER' as any, 'CASHIER' as any, 'DEVELOPER' as any)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('photo', {
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
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
          return;
        }
        cb(new BadRequestException('Format file harus JPG/PNG'), false);
      },
    }),
  )
  uploadPhoto(@CurrentUser() user: any, @UploadedFile() photo?: any) {
    if (!photo) throw new BadRequestException('File foto wajib dipilih');
    return this.usersService.updateProfilePhoto(user.id, `/uploads/${photo.filename}`);
  }

  @Get()
  @Roles('OWNER' as any)
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Roles('OWNER' as any)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles('OWNER' as any)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    return this.usersService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('OWNER' as any)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: any) {
    return this.usersService.update(id, dto, user.id);
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService, AuditService],
  exports: [UsersService],
})
export class UsersModule {}
