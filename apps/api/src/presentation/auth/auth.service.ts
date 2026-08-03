import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PasswordService } from '../../application/auth/password.service';
import { LoginDto } from './login.dto';
import { ChangeInitialPasswordDto } from './change-initial-password.dto';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService, private readonly jwt: JwtService) {}

  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() }, include: { memberships: { where: { isActive: true }, include: { tenant: true }, orderBy: { createdAt: 'asc' } } } });
    if (!user?.isActive || !(await this.passwords.verify(input.password, user.passwordHash))) throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません。');
    const membership = user.memberships[0];
    if (!membership) throw new UnauthorizedException('有効な園への所属がありません。');
    const payload = { sub: user.id, tenantId: membership.tenantId, role: membership.role, email: user.email, tokenVersion: user.tokenVersion };
    return { accessToken: await this.jwt.signAsync(payload), user: { id: user.id, email: user.email, displayName: user.displayName }, tenant: { id: membership.tenant.id, name: membership.tenant.name, code: membership.tenant.code }, role: membership.role, mustChangePassword: user.mustChangePassword };
  }

  async changeInitialPassword(actor: AuthenticatedUser, input: ChangeInitialPasswordDto, requestId?: string) {
    if (input.newPassword !== input.confirmPassword) throw new BadRequestException('新しいパスワードと確認用パスワードが一致しません。');
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub }, include: { memberships: { where: { tenantId: actor.tenantId, isActive: true } } } });
    if (!user?.isActive || !user.memberships.length) throw new ForbiddenException('このアカウントは利用できません。');
    if (!user.mustChangePassword) throw new ConflictException('初回パスワードの変更は既に完了しています。');
    if (!(await this.passwords.verify(input.currentPassword, user.passwordHash))) throw new UnauthorizedException('現在のパスワードが正しくありません。');
    if (await this.passwords.verify(input.newPassword, user.passwordHash)) throw new BadRequestException('現在のパスワードと同じパスワードは使用できません。');
    const policyError = this.passwords.validateNewPassword(input.newPassword, user);
    if (policyError) throw new BadRequestException(policyError);
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({ where: { id: user.id, mustChangePassword: true, tokenVersion: user.tokenVersion }, data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } } });
      if (updated.count !== 1) throw new ConflictException('初回パスワードの変更は既に完了しています。');
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, memberId: user.id, action: 'INITIAL_PASSWORD_CHANGED', targetType: 'User', targetId: user.id, detail: { source: 'self-service', ...(requestId ? { requestId } : {}) } } });
    });
    return { success: true, mustChangePassword: false, requiresReauthentication: true };
  }
}
