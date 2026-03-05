import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'owner@billiard.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'owner123' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class ReAuthDto {
  @ApiProperty({ description: 'Password or 6-digit PIN' })
  @IsString()
  credential: string;

  @IsOptional()
  @IsString()
  type?: 'password' | 'pin';
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
