import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TablesService, CreateTableDto, UpdateTableDto, TestTableDto } from './tables.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IotModule } from '../iot/iot.module';

@ApiTags('Tables')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('tables')
export class TablesController {
  constructor(private tablesService: TablesService) {}

  @Get()
  findAll(@Query('includeInactive') includeInactive?: boolean) {
    return this.tablesService.findAll(includeInactive);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tablesService.findOne(id);
  }

  @Post()
  @Roles('DEVELOPER' as any)
  create(@Body() dto: CreateTableDto) {
    return this.tablesService.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER' as any, 'DEVELOPER' as any)
  update(@Param('id') id: string, @Body() dto: UpdateTableDto, @CurrentUser() user: any) {
    return this.tablesService.update(id, dto, user.role);
  }

  @Post(':id/testing')
  @Roles('OWNER' as any, 'DEVELOPER' as any)
  startTesting(@Param('id') id: string, @Body() dto: TestTableDto, @CurrentUser() user: any) {
    return this.tablesService.startTesting(id, user.role, dto);
  }

  @Post(':id/testing/stop')
  @Roles('OWNER' as any, 'DEVELOPER' as any)
  stopTesting(@Param('id') id: string) {
    return this.tablesService.stopTesting(id);
  }


  @Delete(':id')
  @Roles('DEVELOPER' as any)
  remove(@Param('id') id: string) {
    return this.tablesService.remove(id);
  }
}

@Module({
  imports: [IotModule],
  controllers: [TablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
