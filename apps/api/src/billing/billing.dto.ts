import { IsString, IsNumber, IsOptional, Min, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBillingSessionDto {
  @ApiProperty()
  @IsString()
  tableId: string;

  @ApiProperty({ description: 'Duration in minutes', minimum: 30 })
  @IsNumber()
  @Min(30)
  durationMinutes: number;

  @ApiProperty({ enum: ['HOURLY', 'MANUAL'] })
  @IsOptional()
  @IsEnum(['HOURLY', 'MANUAL'])
  rateType?: string;

  @ApiProperty({ description: 'Override rate per hour (MANUAL only)' })
  @IsOptional()
  @IsNumber()
  manualRatePerHour?: number;

  @ApiProperty({ description: 'Re-auth token from /auth/re-auth (OWNER only)', required: false })
  @IsOptional()
  @IsString()
  reAuthToken?: string;
}

export class ExtendBillingSessionDto {
  @ApiProperty({ description: 'Additional minutes to extend' })
  @IsNumber()
  @Min(15)
  additionalMinutes: number;
}
