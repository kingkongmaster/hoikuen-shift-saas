import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { FeatureGuard } from '../features/feature.guard';
import { RequiresFeature } from '../features/requires-feature.decorator';
import { SubscriptionWriteGuard } from '../subscriptions/subscription-write.guard';
import { ShiftStaffingRequirementInputDto } from './staffing-requirement.dto';
import { StaffingRequirementsService } from './staffing-requirements.service';

@Controller('staffing-requirements')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard, SubscriptionWriteGuard, FeatureGuard)
@Roles('ADMIN', 'DIRECTOR')
export class StaffingRequirementsController {
  constructor(private readonly service: StaffingRequirementsService) {}

  @Get()
  list(@Req() request: Request & { user: AuthenticatedUser }) { return this.service.list(request.user); }

  @Post() @Roles('ADMIN') @RequiresFeature('ADVANCED_STAFFING_REQUIREMENTS')
  create(@Req() request: Request & { user: AuthenticatedUser }, @Body() input: ShiftStaffingRequirementInputDto) { return this.service.create(request.user, input); }

  @Put(':id') @Roles('ADMIN') @RequiresFeature('ADVANCED_STAFFING_REQUIREMENTS')
  update(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: ShiftStaffingRequirementInputDto) { return this.service.update(request.user, id, input); }

  @Delete(':id') @Roles('ADMIN') @RequiresFeature('ADVANCED_STAFFING_REQUIREMENTS')
  deactivate(@Req() request: Request & { user: AuthenticatedUser }, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.deactivate(request.user, id); }
}
