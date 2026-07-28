import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { ALLOW_PASSWORD_CHANGE_KEY } from './allow-password-change.decorator';
import type { AuthenticatedUser } from './auth.types';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) { super(); }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = await super.canActivate(context);
    if (!authenticated) return false;
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const user = await this.prisma.user.findUnique({ where: { id: request.user.sub }, select: { isActive: true, mustChangePassword: true, tokenVersion: true } });
    if (!user?.isActive || !Number.isInteger(request.user.tokenVersion) || user.tokenVersion !== request.user.tokenVersion) throw new UnauthorizedException('認証の有効期限が切れました。再度ログインしてください。');
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_KEY, [context.getHandler(), context.getClass()])) return true;
    if (user.mustChangePassword) throw new ForbiddenException({ statusCode: 403, code: 'INITIAL_PASSWORD_CHANGE_REQUIRED', message: '初回パスワードの変更が必要です。', mustChangePassword: true });
    return true;
  }
}
