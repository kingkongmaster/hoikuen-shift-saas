import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Controller('me')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  async getMe(@Req() request: Request & { user: AuthenticatedUser }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: request.user.sub }, select: { id: true, email: true, displayName: true } });
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: request.user.tenantId }, select: { id: true, name: true } });
    return { user, tenant, role: request.user.role };
  }
}

