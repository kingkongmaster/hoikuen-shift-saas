import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { SubscriptionWriteGuard } from '../subscriptions/subscription-write.guard';
import { DepartmentsService } from './departments.service';
import { DepartmentInput, DepartmentAssignmentInput } from './departments.dto';
type UserRequest = Request & { user: AuthenticatedUser };
@Controller('departments')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard, SubscriptionWriteGuard)
@Roles('ADMIN', 'DIRECTOR')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}
  @Get() list(@Req() r: UserRequest) { return this.service.list(r.user); }
  @Post() @Roles('ADMIN') create(@Req() r: UserRequest, @Body() input: DepartmentInput) { return this.service.save(r.user, input); }
  @Put(':id') @Roles('ADMIN') update(@Req() r: UserRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: DepartmentInput) { return this.service.save(r.user, input, id); }
}
@Controller('staff/:staffId/departments')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard, SubscriptionWriteGuard)
@Roles('ADMIN', 'DIRECTOR')
export class StaffDepartmentsController {
  constructor(private readonly service: DepartmentsService) {}
  @Get() list(@Req() r: UserRequest, @Param('staffId', new ParseUUIDPipe()) sid: string) { return this.service.assignments(r.user, sid); }
  @Post() @Roles('ADMIN') assign(@Req() r: UserRequest, @Param('staffId', new ParseUUIDPipe()) sid: string, @Body() input: DepartmentAssignmentInput) { return this.service.assign(r.user, sid, input); }
  @Delete(':id') @Roles('ADMIN') remove(@Req() r: UserRequest, @Param('staffId', new ParseUUIDPipe()) sid: string, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.deactivate(r.user, sid, id); }
}
