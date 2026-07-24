import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { UpdateClassRequirementsDto, UpdateShiftSettingDto } from '../settings/settings.dto';
import { PRIVACY_VERSION, TERMS_VERSION } from './setup.constants';
import { UpdateConsentsDto, UpdateProgressDto, UpdateTenantDto } from './setup.dto';

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  async get(user: AuthenticatedUser) {
    const [tenant, shiftSettings, classRequirements, activeStaffCount] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { id: true, name: true, code: true, phone: true, postalCode: true, prefecture: true, city: true, addressLine: true, contactName: true, contactEmail: true, timezone: true, setupStatus: true, setupCurrentStep: true, setupCompletedAt: true, termsAcceptedAt: true, privacyAcceptedAt: true, termsVersion: true, privacyVersion: true } }),
      this.prisma.tenantShiftSetting.findUnique({ where: { tenantId: user.tenantId } }), this.prisma.classStaffingRequirement.findMany({ where: { tenantId: user.tenantId } }), this.prisma.staff.count({ where: { tenantId: user.tenantId, isActive: true } }),
    ]);
    const result = this.evaluateSetupRequirements({ tenant, shiftSettings, classRequirements, activeStaffCount });
    return { ...tenant, tenant: { id: tenant.id, name: tenant.name, code: tenant.code }, shiftSettings, classRequirements, activeStaffCount, currentTermsVersion: TERMS_VERSION, currentPrivacyVersion: PRIVACY_VERSION, ...result };
  }

  evaluateSetupRequirements(data: any) {
    const missing: string[] = [];
    if (!data.tenant.name?.trim()) missing.push('TENANT_NAME_REQUIRED');
    if (!data.shiftSettings) missing.push('SHIFT_SETTINGS_REQUIRED');
    if (!data.classRequirements?.length) missing.push('CLASS_REQUIREMENTS_REQUIRED');
    if (!data.activeStaffCount) missing.push('ACTIVE_STAFF_REQUIRED');
    const terms = !!data.tenant.termsAcceptedAt, privacy = !!data.tenant.privacyAcceptedAt;
    if (!terms) missing.push('TERMS_NOT_ACCEPTED'); else if (data.tenant.termsVersion !== TERMS_VERSION) missing.push('TERMS_VERSION_OUTDATED');
    if (!privacy) missing.push('PRIVACY_NOT_ACCEPTED'); else if (data.tenant.privacyVersion !== PRIVACY_VERSION) missing.push('PRIVACY_VERSION_OUTDATED');
    return { termsVersionCurrent: terms && data.tenant.termsVersion === TERMS_VERSION, privacyVersionCurrent: privacy && data.tenant.privacyVersion === PRIVACY_VERSION, canComplete: missing.length === 0, missingRequirements: missing };
  }

  private async startIfNeeded(user: AuthenticatedUser, tx: Prisma.TransactionClient) {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { setupStatus: true } });
    if (tenant.setupStatus === 'NOT_STARTED') {
      await tx.tenant.update({ where: { id: user.tenantId }, data: { setupStatus: 'IN_PROGRESS' } });
      await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'SETUP_STARTED', targetType: 'Tenant', targetId: user.tenantId } });
    }
  }

  async updateTenant(user: AuthenticatedUser, input: UpdateTenantDto) {
    if (!input.name.trim()) throw new BadRequestException('園名を入力してください。');
    await this.prisma.$transaction(async (tx) => {
      await this.startIfNeeded(user, tx);
      await tx.tenant.update({ where: { id: user.tenantId }, data: { ...input, name: input.name.trim() } });
    });
    return this.get(user);
  }

  async updateWorkSettings(user: AuthenticatedUser, input: UpdateShiftSettingDto) {
    await this.settings.updateSetting(user, input);
    await this.prisma.$transaction((tx) => this.startIfNeeded(user, tx));
    return this.get(user);
  }

  async updateClassRequirements(user: AuthenticatedUser, input: UpdateClassRequirementsDto) {
    await this.settings.updateRequirements(user, input);
    await this.prisma.$transaction((tx) => this.startIfNeeded(user, tx));
    return this.get(user);
  }

  async updateProgress(user: AuthenticatedUser, input: UpdateProgressDto) {
    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { setupStatus: true, setupCurrentStep: true } });
      await this.startIfNeeded(user, tx);
      if (tenant.setupCurrentStep !== input.currentStep && tenant.setupStatus !== 'COMPLETED') {
        await tx.tenant.update({ where: { id: user.tenantId }, data: { setupCurrentStep: input.currentStep } });
        await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'SETUP_STEP_UPDATED', targetType: 'Tenant', targetId: user.tenantId, detail: { from: tenant.setupCurrentStep, to: input.currentStep } } });
      }
    });
    return this.get(user);
  }

  async updateConsents(user: AuthenticatedUser, input: UpdateConsentsDto) {
    if (input.acceptTerms === undefined && input.acceptPrivacy === undefined) throw new BadRequestException('同意内容を指定してください。');
    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { termsAcceptedAt: true, termsVersion: true, privacyAcceptedAt: true, privacyVersion: true } });
      await this.startIfNeeded(user, tx);
      const data: Prisma.TenantUpdateInput = {};
      if (input.acceptTerms && (!tenant.termsAcceptedAt || tenant.termsVersion !== TERMS_VERSION)) { data.termsAcceptedAt = new Date(); data.termsVersion = TERMS_VERSION; await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'TERMS_ACCEPTED', targetType: 'Tenant', targetId: user.tenantId, detail: { version: TERMS_VERSION } } }); }
      if (input.acceptPrivacy && (!tenant.privacyAcceptedAt || tenant.privacyVersion !== PRIVACY_VERSION)) { data.privacyAcceptedAt = new Date(); data.privacyVersion = PRIVACY_VERSION; await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'PRIVACY_ACCEPTED', targetType: 'Tenant', targetId: user.tenantId, detail: { version: PRIVACY_VERSION } } }); }
      if (Object.keys(data).length) await tx.tenant.update({ where: { id: user.tenantId }, data });
    });
    return this.get(user);
  }

  async complete(user: AuthenticatedUser) {
    const state = await this.get(user);
    if (!state.canComplete) throw new BadRequestException({ code: 'SETUP_REQUIREMENTS_NOT_MET', missingRequirements: state.missingRequirements });
    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { setupStatus: true } });
      if (tenant.setupStatus !== 'COMPLETED') { await tx.tenant.update({ where: { id: user.tenantId }, data: { setupStatus: 'COMPLETED', setupCurrentStep: 7, setupCompletedAt: new Date() } }); await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'SETUP_COMPLETED', targetType: 'Tenant', targetId: user.tenantId } }); }
    });
    return this.get(user);
  }
}
