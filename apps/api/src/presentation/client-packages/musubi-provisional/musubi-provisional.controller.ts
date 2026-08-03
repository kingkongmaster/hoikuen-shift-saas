import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../../infrastructure/auth/jwt-auth.guard';
import { Roles } from '../../../infrastructure/auth/roles.decorator';
import { RolesGuard } from '../../../infrastructure/auth/roles.guard';
import { TenantAccessGuard } from '../../../infrastructure/auth/tenant-access.guard';
import { MusubiProvisionalService } from './musubi-provisional.service';

@Controller('client-packages/musubi-provisional')
@UseGuards(JwtAuthGuard, TenantAccessGuard, RolesGuard)
@Roles('ADMIN', 'DIRECTOR')
export class MusubiProvisionalController {
  constructor(private readonly service: MusubiProvisionalService) {}
  @Get() get(@Req() request: Request & { user: AuthenticatedUser }, @Query('month') month?: string) { return this.service.get(request.user, month); }
}
