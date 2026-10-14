import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import { CreateTenantDto } from './tenants.dto';
import { TenantsService } from './tenants.service';
import { ProvisionTenantDto } from './provision-tenant.dto';
import { ProvisionTenantService } from './provision-tenant.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService, private readonly provisioning: ProvisionTenantService) {}
  @Post()
  create(@Req() req: Request & { user: AuthenticatedUser }, @Body() input: CreateTenantDto) { return this.tenants.create(req.user, input); }
  @Post('provision')
  @UseGuards(TenantAccessGuard)
  provision(@Req() req: Request & { user: AuthenticatedUser }, @Body() input: ProvisionTenantDto) { return this.provisioning.provision(req.user, input); }
}
