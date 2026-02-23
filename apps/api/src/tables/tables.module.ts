import { Controller, Get, Post, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TablesService, CreateTableDto, UpdateTableDto } from './tables.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

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
  @Roles('OWNER' as any, 'MANAGER' as any)
  create(@Body() dto: CreateTableDto) {
    return this.tablesService.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER' as any, 'MANAGER' as any)
  update(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.tablesService.update(id, dto);
  }
}

@Module({
  controllers: [TablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
