import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import type { AuthenticatedUser } from './auth.types';
import type { MembershipRole } from '../../domain/identity/membership-role';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<MembershipRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    if (!required.includes(request.user.role)) throw new ForbiddenException('この操作に必要なロールではありません。');
    return true;
  }
}

