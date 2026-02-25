import {
  Controller, Get, Post, Patch, Param, Body, UseGuards, Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CreateBillingSessionDto, ExtendBillingSessionDto } from './billing.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionStatus } from '@prisma/client';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Post('sessions')
  @Roles('OWNER' as any, 'CASHIER' as any)
  createSession(@Body() dto: CreateBillingSessionDto, @CurrentUser() user: any) {
    return this.billingService.createSession(dto, user.id, user.role);
  }

  @Get('sessions')
  @Roles('OWNER' as any, 'CASHIER' as any)
  listSessions(
    @Query('status') status?: SessionStatus,
    @Query('tableId') tableId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.billingService.listSessions({
      status,
      tableId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page,
      limit,
    });
  }

  @Get('sessions/active')
  @Roles('OWNER' as any, 'CASHIER' as any)
  getActiveSessions() {
    return this.billingService.getActiveSessions();
  }

  @Get('sessions/:id')
  @Roles('OWNER' as any, 'CASHIER' as any)
  getSession(@Param('id') id: string) {
    return this.billingService.getSession(id);
  }

  @Patch('sessions/:id/extend')
  @Roles('OWNER' as any, 'CASHIER' as any)
  extendSession(
    @Param('id') id: string,
    @Body() dto: ExtendBillingSessionDto,
    @CurrentUser() user: any,
  ) {
    return this.billingService.extendSession(id, dto, user.id, user.role);
  }

  @Patch('sessions/:id/stop')
  @Roles('OWNER' as any, 'CASHIER' as any)
  stopSession(@Param('id') id: string, @CurrentUser() user: any) {
    return this.billingService.stopSession(id, user.id, user.role);
  }
}
