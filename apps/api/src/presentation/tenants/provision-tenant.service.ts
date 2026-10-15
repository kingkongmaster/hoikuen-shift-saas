import { invitationHash, invitationSecret } from './admin-invitation.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PasswordService } from '../../application/auth/password.service';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { ProvisionTenantDto } from './provision-tenant.dto';

@Injectable()
export class ProvisionTenantService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService) {}

  async provision(actor: AuthenticatedUser, input: ProvisionTenantDto) {
    // Opt-in for the isolated commercial release; the existing Pilot stays unchanged.
    if (process.env.COMMERCIAL_ONBOARDING_ENABLED !== 'true') throw new ForbiddenException('新規園の導入受付は現在利用できません。');
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (!user?.isActive || !user.isPlatformAdmin || user.tokenVersion !== actor.tokenVersion) throw new ForbiddenException('運営管理者専用です。');
    const name = input.name.trim();
    const displayName = input.adminDisplayName.trim();
    if (!name || !displayName) throw new BadRequestException('園名と管理者名を入力してください。');
    const error = input.initialPassword && this.passwords.validateNewPassword(input.initialPassword, { loginId: input.adminLoginId, displayName });
    if (error) throw new BadRequestException(error);
    const passwordHash = await this.passwords.hash(invitationSecret());
    const token=invitationSecret(), expiresAt=new Date(Date.now()+48*3600000);
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 30 * 86400000);
    try {
      return await this.prisma.$transaction(async tx => {
        const tenant = await tx.tenant.create({ data: { name, displayName: name, code: input.code, timezone: 'Asia/Tokyo', setupStatus: 'NOT_STARTED', setupCurrentStep: 1 } });
        const admin = await tx.user.create({ data: { loginId: input.adminLoginId, displayName, passwordHash, mustChangePassword: true, isActive: false, isPlatformAdmin: false } });
        await tx.membership.create({ data: { tenantId: tenant.id, userId: admin.id, role: 'ADMIN' } });
        const subscription = await tx.tenantSubscription.create({ data: { tenantId: tenant.id, plan: 'TRIAL', status: 'TRIAL', staffLimit: 20, trialStartedAt: now, trialEndsAt } });
        await tx.auditLog.create({ data: { tenantId: tenant.id, memberId: actor.sub, action: 'TENANT_PROVISIONED', targetType: 'Tenant', targetId: tenant.id, detail: { administratorId: admin.id, plan: 'TRIAL', staffLimit: 20, trialEndsAt: trialEndsAt.toISOString() } } });
        const invitation=await tx.invitation.create({data:{tenantId:tenant.id,invitedUserId:admin.id,role:'ADMIN',tokenHash:invitationHash(token),expiresAt,createdByUserId:actor.sub}});
        // The invite bearer secret is returned once to this authorized operator; never log it.
        return { invitation: {id:invitation.id,tenantId:tenant.id,loginId:admin.loginId,token,expiresAt}, tenant: { id: tenant.id, name: tenant.name, code: tenant.code, setupStatus: tenant.setupStatus, createdAt: tenant.createdAt }, administrator: { id: admin.id, loginId: admin.loginId, mustChangePassword: true }, subscription: { plan: subscription.plan, status: subscription.status, staffLimit: subscription.staffLimit, trialEndsAt: subscription.trialEndsAt } };
      });
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException('園コードまたは管理者ログインIDは既に使用されています。');
      throw error;
    }
  }
}
