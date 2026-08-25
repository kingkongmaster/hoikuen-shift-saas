import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { PasswordService } from '../../application/auth/password.service';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateStaffLoginAccountDto, ResetStaffPasswordDto, StaffLoginAccountReasonDto } from './staff-login-account.dto';

@Injectable()
export class StaffLoginAccountService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService) {}

  async status(actor: AuthenticatedUser, staffId: string) {
    const staff = await this.staff(actor, staffId);
    if (!staff.userId) return { enabled: false, staffId };
    const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: actor.tenantId, userId: staff.userId } }, include: { user: { select: { loginId: true, email: true, mustChangePassword: true, isActive: true } } } });
    if (!membership) throw new ConflictException('職員とログインアカウントの所属情報が一致しません。');
    return { enabled: membership.isActive && membership.user.isActive, staffId, loginId: membership.user.loginId, email: membership.user.email, role: membership.role, mustChangePassword: membership.user.mustChangePassword, membershipActive: membership.isActive };
  }

  async create(actor: AuthenticatedUser, staffId: string, input: CreateStaffLoginAccountDto) {
    if (input.temporaryPassword !== input.confirmPassword) throw new BadRequestException('仮パスワードと確認用パスワードが一致しません。');
    const loginId = input.loginId.trim().toLowerCase();
    const staff = await this.staff(actor, staffId);
    if (!staff.isActive) throw new ConflictException('無効な職員にはログインを発行できません。');
    if (staff.userId) throw new ConflictException('この職員には既にログインが発行されています。');
    const email = input.email?.trim().toLowerCase() || staff.email?.trim().toLowerCase() || null;
    const policyError = this.passwords.validateNewPassword(input.temporaryPassword, { loginId, email, displayName: staff.displayName });
    if (policyError) throw new BadRequestException(policyError);
    const passwordHash = await this.passwords.hash(input.temporaryPassword);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        for (const identifier of [...new Set([loginId, email].filter((value): value is string => Boolean(value)))].sort()) {
          await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${identifier}))`);
        }
        const collision = await tx.user.findFirst({ where: { OR: [{ loginId }, { email: loginId }, ...(email ? [{ loginId: email }, { email }] : []) ] }, select: { id: true } });
        if (collision) throw new ConflictException('このログインIDまたはメールアドレスは既に使用されています。');
        const linked = await tx.staff.findFirst({ where: { id: staffId, tenantId: actor.tenantId, userId: null, isActive: true } });
        if (!linked) throw new ConflictException('この職員の状態が変更されています。再読み込みしてください。');
        const user = await tx.user.create({ data: { loginId, email, displayName: linked.displayName, passwordHash, mustChangePassword: true } });
        await tx.membership.create({ data: { tenantId: actor.tenantId, userId: user.id, role: input.role as MembershipRole } });
        const updated = await tx.staff.updateMany({ where: { id: linked.id, tenantId: actor.tenantId, userId: null }, data: { userId: user.id } });
        if (updated.count !== 1) throw new ConflictException('この職員には別のログインが発行されました。');
        await tx.auditLog.create({ data: { tenantId: actor.tenantId, memberId: actor.sub, action: 'STAFF_LOGIN_ACCOUNT_CREATED', targetType: 'User', targetId: user.id, detail: { staffId, loginId, role: input.role, mustChangePassword: true } } });
        return { staffId, loginId, email, role: input.role, mustChangePassword: true, enabled: true };
      });
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('このログインIDまたはメールアドレスは既に使用されています。');
      throw error;
    }
  }

  async resetPassword(actor: AuthenticatedUser, staffId: string, input: ResetStaffPasswordDto) {
    if (input.temporaryPassword !== input.confirmPassword) throw new BadRequestException('仮パスワードと確認用パスワードが一致しません。');
    const reason = this.reason(input.reason);
    const account = await this.account(actor, staffId, true);
    const policyError = this.passwords.validateNewPassword(input.temporaryPassword, account.user);
    if (policyError) throw new BadRequestException(policyError);
    const passwordHash = await this.passwords.hash(input.temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: account.userId }, data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } } });
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, memberId: actor.sub, action: 'STAFF_TEMPORARY_PASSWORD_REISSUED', targetType: 'User', targetId: account.userId, detail: { staffId, reason, mustChangePassword: true } } });
    });
    return { success: true, mustChangePassword: true, requiresReauthentication: true };
  }

  async deactivate(actor: AuthenticatedUser, staffId: string, input: StaffLoginAccountReasonDto) { return this.setActive(actor, staffId, false, input.reason); }
  async reactivate(actor: AuthenticatedUser, staffId: string, input: StaffLoginAccountReasonDto) { return this.setActive(actor, staffId, true, input.reason); }

  private async setActive(actor: AuthenticatedUser, staffId: string, active: boolean, reason: string) {
    const normalizedReason = this.reason(reason);
    await this.prisma.$transaction(async (tx) => {
      const [staff] = await tx.$queryRaw<Array<{ userId: string | null; isActive: boolean }>>(Prisma.sql`
        SELECT "userId", "isActive" FROM "Staff"
        WHERE "id" = ${staffId}::uuid AND "tenantId" = ${actor.tenantId}::uuid
        FOR UPDATE
      `);
      if (!staff) throw new NotFoundException('職員が見つかりません。');
      if (!staff.userId) throw new NotFoundException('この職員にはログインが発行されていません。');
      const [membership] = await tx.$queryRaw<Array<{ isActive: boolean }>>(Prisma.sql`
        SELECT "isActive" FROM "Membership"
        WHERE "tenantId" = ${actor.tenantId}::uuid AND "userId" = ${staff.userId}::uuid
        FOR UPDATE
      `);
      if (!membership) throw new ConflictException('職員とログインアカウントの所属情報が一致しません。');
      if (active && !staff.isActive) throw new ConflictException('無効な職員のログインは再開できません。');
      if (membership.isActive === active) throw new ConflictException(active ? 'ログインは既に有効です。' : 'ログインは既に停止されています。');
      const accountUser = await tx.user.findUnique({ where: { id: staff.userId }, select: { isActive: true } });
      if (!accountUser?.isActive) throw new ForbiddenException('ユーザー全体が停止されています。プラットフォーム管理者へ確認してください。');
      await tx.membership.update({ where: { tenantId_userId: { tenantId: actor.tenantId, userId: staff.userId } }, data: { isActive: active, tokenVersion: { increment: 1 } } });
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, memberId: actor.sub, action: active ? 'STAFF_LOGIN_ACCOUNT_REACTIVATED' : 'STAFF_LOGIN_ACCOUNT_DEACTIVATED', targetType: 'User', targetId: staff.userId, detail: { staffId, reason: normalizedReason } } });
    });
    return { success: true, enabled: active, requiresReauthentication: true };
  }

  private async staff(actor: AuthenticatedUser, staffId: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, tenantId: actor.tenantId } });
    if (!staff) throw new NotFoundException('職員が見つかりません。');
    return staff;
  }

  private async account(actor: AuthenticatedUser, staffId: string, requireExclusiveUser: boolean) {
    const staff = await this.staff(actor, staffId);
    if (!staff.userId) throw new NotFoundException('この職員にはログインが発行されていません。');
    const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: actor.tenantId, userId: staff.userId } }, include: { user: true } });
    if (!membership) throw new ConflictException('職員とログインアカウントの所属情報が一致しません。');
    if (requireExclusiveUser && await this.prisma.membership.count({ where: { userId: staff.userId } }) !== 1) throw new ConflictException('複数園に所属する共用アカウントのパスワードは、この画面から変更できません。');
    return { ...membership, staff };
  }

  private reason(value: string): string {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException('理由は空白以外の文字を入力してください。');
    return normalized;
  }
}
