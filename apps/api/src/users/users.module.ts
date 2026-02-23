import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Param, Body, UseGuards, Delete } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsEmail, IsEnum, IsOptional, IsBoolean, MinLength } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export class CreateUserDto {
  @IsString() name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsEnum(Role) role: Role;
  @IsOptional() @IsString() pin?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(6) password?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() pin?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, createdById: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const pinHash = dto.pin ? await bcrypt.hash(dto.pin, 12) : undefined;

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        pin: pinHash,
        role: dto.role,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });

    await this.audit.log({
      userId: createdById,
      action: AuditAction.CREATE,
      entity: 'User',
      entityId: user.id,
      afterData: { name: dto.name, email: dto.email, role: dto.role },
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

    const data: any = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
      delete data.password;
    }
    if (dto.pin) {
      data.pin = await bcrypt.hash(dto.pin, 12);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    await this.audit.log({
      userId: updatedById,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: id,
      afterData: { name: dto.name, role: dto.role, isActive: dto.isActive },
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
