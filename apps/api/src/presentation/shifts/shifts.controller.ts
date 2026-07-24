import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { SubscriptionWriteGuard } from '../subscriptions/subscription-write.guard';
import { CreateMonthlyShiftDto } from './create-monthly-shift.dto';
import { ListShiftsQueryDto } from './list-shifts-query.dto';
import { SaveAssignmentsDto } from './save-assignments.dto';
import { ShiftsService } from './shifts.service';

@Controller('shifts')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard, SubscriptionWriteGuard)
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}
  @Get() list(@Req() request: Request & { user: AuthenticatedUser }, @Query() query: ListShiftsQueryDto) { return this.shifts.list(request.user, query.month, query.staffId); }
  @Get(':id') get(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string) { return this.shifts.get(request.user, id); }
  @Post() @Roles('ADMIN', 'DIRECTOR') create(@Req() request: Request & { user: AuthenticatedUser }, @Body() input: CreateMonthlyShiftDto) { return this.shifts.create(request.user, input.month); }
  @Put(':id/assignments') @Roles('ADMIN', 'DIRECTOR') save(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: SaveAssignmentsDto) { return this.shifts.save(request.user, id, input.assignments); }
  @Post(':id/confirm') @HttpCode(200) @Roles('ADMIN', 'DIRECTOR') confirm(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string) { return this.shifts.confirm(request.user, id); }
  @Post(':id/reopen') @HttpCode(200) @Roles('ADMIN', 'DIRECTOR') reopen(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string) { return this.shifts.reopen(request.user, id); }
  @Post(':id/generate') @Roles('ADMIN') generate(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string) { return this.shifts.generate(request.user, id); }
  @Post(':id/precheck') @Roles('ADMIN') precheck(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string) { return this.shifts.precheck(request.user, id); }
}
