import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../infrastructure/auth/tenant-access.guard';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AllowPasswordChange } from '../../infrastructure/auth/allow-password-change.decorator';
import { MeService } from './me.service';

@Controller('me')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService, private readonly me: MeService) {}
  @Get() @AllowPasswordChange()
  async getMe(@Req() request: Request & { user: AuthenticatedUser }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: request.user.sub }, select: { id: true, email: true, displayName: true, mustChangePassword: true } });
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: request.user.tenantId }, select: { id: true, name: true, code: true } });
    const { mustChangePassword, ...publicUser } = user;
    return { user: publicUser, tenant, role: request.user.role, mustChangePassword };
  }
  @Get('calendar')
  calendar(@Req() request: Request & { user: AuthenticatedUser }, @Query('month') month: string) {
    return this.me.calendar(request.user, month);
  }
}
