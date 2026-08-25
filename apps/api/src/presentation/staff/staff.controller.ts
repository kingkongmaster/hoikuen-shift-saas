import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { CreateStaffDto } from './create-staff.dto';
import { ListStaffQueryDto } from './list-staff-query.dto';
import { StaffService } from './staff.service';
import { UpdateStaffDto } from './update-staff.dto';
import { CreateStaffLoginAccountDto, ResetStaffPasswordDto, StaffLoginAccountReasonDto } from './staff-login-account.dto';
import { StaffLoginAccountService } from './staff-login-account.service';

@Controller('staff')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
export class StaffController {
  constructor(private readonly staff: StaffService, private readonly accounts: StaffLoginAccountService) {}

  @Get()
  @Roles('ADMIN', 'DIRECTOR')
  list(@Req() request: Request & { user: AuthenticatedUser }, @Query() query: ListStaffQueryDto) {
    return this.staff.list(request.user, query.includeInactive);
  }

  @Get('me')
  mine(@Req() request: Request & { user: AuthenticatedUser }) {
    return this.staff.findMine(request.user);
  }

  @Get(':id')
  @Roles('ADMIN', 'DIRECTOR')
  get(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.staff.get(request.user, id);
  }

  @Post()
  @Roles('ADMIN')
  create(@Req() request: Request & { user: AuthenticatedUser }, @Body() input: CreateStaffDto) {
    return this.staff.create(request.user, input);
  }

  @Get(':id/login-account')
  @Roles('ADMIN')
  accountStatus(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.accounts.status(request.user, id);
  }

  @Post(':id/login-account')
  @Roles('ADMIN')
  createAccount(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: CreateStaffLoginAccountDto) {
    return this.accounts.create(request.user, id, input);
  }

  @Post(':id/login-account/reset-password')
  @Roles('ADMIN')
  resetPassword(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: ResetStaffPasswordDto) {
    return this.accounts.resetPassword(request.user, id, input);
  }

  @Post(':id/login-account/deactivate')
  @Roles('ADMIN')
  deactivateAccount(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: StaffLoginAccountReasonDto) {
    return this.accounts.deactivate(request.user, id, input);
  }

  @Post(':id/login-account/reactivate')
  @Roles('ADMIN')
  reactivateAccount(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: StaffLoginAccountReasonDto) {
    return this.accounts.reactivate(request.user, id, input);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: UpdateStaffDto) {
    return this.staff.update(request.user, id, input);
  }

  @Delete(':id')
  @Roles('ADMIN')
  deactivate(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.staff.deactivate(request.user, id);
  }
}
