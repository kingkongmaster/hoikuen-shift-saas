import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from './auth.types';

@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const user = request.user;
    const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: user.tenantId, userId: user.sub } } });
    if (!membership?.isActive || membership.role !== user.role) throw new ForbiddenException('園へのアクセス権限がありません。');
    return true;
  }
}

