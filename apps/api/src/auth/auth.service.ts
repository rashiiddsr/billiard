import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import * as bcrypt from 'bcrypt';
import { AuditAction, Role } from '@prisma/client';

// Simple in-memory failed attempt tracker (use Redis in production)
const failedAttempts = new Map<string, { count: number; lastAt: Date }>();
const MAX_FAILED = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  async login(email: string, password: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check lockout
    const attempts = failedAttempts.get(user.id);
    if (attempts && attempts.count >= MAX_FAILED) {
      const lockoutEnd = new Date(attempts.lastAt.getTime() + LOCKOUT_MINUTES * 60 * 1000);
      if (new Date() < lockoutEnd) {
        throw new ForbiddenException(
          `Account temporarily locked. Try again after ${lockoutEnd.toLocaleTimeString()}`,
        );
      }
      failedAttempts.delete(user.id);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const current = failedAttempts.get(user.id) || { count: 0, lastAt: new Date() };
      failedAttempts.set(user.id, { count: current.count + 1, lastAt: new Date() });

      await this.audit.log({
        userId: user.id,
        action: AuditAction.FAILED_AUTH,
        entity: 'User',
        entityId: user.id,
        metadata: { email, ipAddress, attemptCount: current.count + 1 },
        ipAddress,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    failedAttempts.delete(user.id);

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    await this.audit.log({
      userId: user.id,
      action: AuditAction.LOGIN,
      entity: 'User',
      entityId: user.id,
      metadata: { email, ipAddress },
      ipAddress,
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      ...tokens,
    };
  }

  async reAuth(userId: string, credential: string, type: 'password' | 'pin' = 'pin') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    if (user.role !== Role.OWNER) {
      throw new ForbiddenException('Re-auth only required for OWNER role');
    }

    let valid = false;
    if (type === 'pin' && user.pin) {
      valid = await bcrypt.compare(credential, user.pin);
    } else {
      valid = await bcrypt.compare(credential, user.passwordHash);
    }

    if (!valid) {
      await this.audit.log({
        userId,
        action: AuditAction.FAILED_AUTH,
        entity: 'ReAuth',
        metadata: { type, reason: 'billing_start' },
      });
      throw new UnauthorizedException('Invalid PIN/password');
    }

    // Return short-lived re-auth token
    const token = this.jwtService.sign(
      { sub: userId, reAuth: true, exp: Math.floor(Date.now() / 1000) + 300 },
      { secret: this.config.get('JWT_SECRET') },
    );

    return { reAuthToken: token, expiresIn: 300 };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });

      const stored = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });

      if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Rotate: delete old, create new
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });

      return this.generateTokens(stored.user.id, stored.user.email, stored.user.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    await this.audit.log({
      userId,
      action: AuditAction.LOGOUT,
      entity: 'User',
      entityId: userId,
    });
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') || '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { token: refreshToken, userId, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
