import { AdminInvitationService } from './admin-invitation.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
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
  constructor(private readonly tenants: TenantsService, private readonly provisioning: ProvisionTenantService, private readonly invitations: AdminInvitationService, private readonly db: PrismaService) {}
  @Get('operator-context') @UseGuards(TenantAccessGuard)
  async context(@Req() req: Request & { user: AuthenticatedUser }) { const user=await this.db.user.findUnique({where:{id:req.user.sub},select:{isPlatformAdmin:true}}); return {isOperator:!!user?.isPlatformAdmin,enabled:process.env.COMMERCIAL_ONBOARDING_ENABLED==='true'}; }
  @Get(':tenantId/invitations') @UseGuards(TenantAccessGuard)
  listInvitations(@Req() req: Request & { user: AuthenticatedUser }, @Param('tenantId',new ParseUUIDPipe()) tenantId:string){return this.invitations.list(req.user,tenantId);}
  @Post(':tenantId/invitations/:id/reissue') @UseGuards(TenantAccessGuard)
  reissue(@Req() req: Request & { user: AuthenticatedUser }, @Param('tenantId',new ParseUUIDPipe()) tenantId:string,@Param('id',new ParseUUIDPipe()) id:string){return this.invitations.reissue(req.user,tenantId,id);}
  @Post()
  create(@Req() req: Request & { user: AuthenticatedUser }, @Body() input: CreateTenantDto) { return this.tenants.create(req.user, input); }
  @Post('provision')
  @UseGuards(TenantAccessGuard)
  provision(@Req() req: Request & { user: AuthenticatedUser }, @Body() input: ProvisionTenantDto) { return this.provisioning.provision(req.user, input); }
}
