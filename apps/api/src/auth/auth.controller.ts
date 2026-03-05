import {
  Controller, Post, Body, UseGuards, Get, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, ReAuthDto } from './auth.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto.email, dto.password, req.ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: any, @Body() dto: Partial<RefreshTokenDto>) {
    return this.authService.logout(user.id, dto.refreshToken);
  }

  @Post('re-auth')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('OWNER' as any)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async reAuth(@CurrentUser() user: any, @Body() dto: ReAuthDto) {
    return this.authService.reAuth(user.id, dto.credential, dto.type || 'pin');
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  getMe(@CurrentUser() user: any) {
    return user;
  }
}
