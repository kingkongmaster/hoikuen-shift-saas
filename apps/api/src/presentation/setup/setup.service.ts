import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { UpdateClassRequirementsDto, UpdateShiftSettingDto } from '../settings/settings.dto';
import { LEGAL_RELEASE, PRIVACY_VERSION, TERMS_VERSION } from './setup.constants';
import { legalConsentState } from './legal-consent-state';
import { workforceReview } from './workforce-review';
import { UpdateConsentsDto, UpdateProgressDto, UpdateTenantDto } from './setup.dto';

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  async get(user: AuthenticatedUser) {
    const [tenant, shiftSettings, classRequirements, activeStaffCount, formalFeature, patternCount, ruleCount, departmentCount, assignedStaff, requirementCount] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { id: true, name: true, code: true, phone: true, postalCode: true, prefecture: true, city: true, addressLine: true, contactName: true, contactEmail: true, timezone: true, setupStatus: true, setupCurrentStep: true, setupCompletedAt: true, termsAcceptedAt: true, privacyAcceptedAt: true, termsVersion: true, privacyVersion: true } }),
      this.prisma.tenantShiftSetting.findUnique({ where: { tenantId: user.tenantId } }), this.prisma.classStaffingRequirement.findMany({ where: { tenantId: user.tenantId } }), this.prisma.staff.count({ where: { tenantId: user.tenantId, isActive: true } }),
      this.prisma.tenantFeature.findUnique({ where: { tenantId_featureCode: { tenantId: user.tenantId, featureCode: 'TENANT_CUSTOM_RULES' } }, select: { configuration: true } }),
      this.prisma.workPattern.count({ where: { tenantId: user.tenantId, isActive: true } }),
      this.prisma.staffWorkRule.count({ where: { tenantId: user.tenantId, isActive: true, staff: { isActive: true } } }),
      this.prisma.department.count({ where: { tenantId: user.tenantId, isActive: true } }),
      this.prisma.staffDepartmentAssignment.findMany({ where: { tenantId: user.tenantId, isActive: true, staff: { isActive: true }, department: { isActive: true } }, distinct: ['staffId'], select: { staffId: true } }),
      this.prisma.shiftStaffingRequirement.count({ where: { tenantId: user.tenantId, isActive: true } }),
    ]);
    const provenance = (formalFeature?.configuration as { release1SourceProvenance?: { matrixSourceId?: string } } | null)?.release1SourceProvenance;
    const workforceSetupEvidence = {
      shiftSettings: Boolean(shiftSettings), classes: classRequirements.some(row => row.isActive),
      staff: activeStaffCount > 0, patterns: patternCount > 0, rules: ruleCount > 0,
      departments: departmentCount > 0,
      departmentCoverage: activeStaffCount > 0 && assignedStaff.length === activeStaffCount,
      requirements: requirementCount > 0,
    };
    const preserveWorkforceSetup = Object.values(workforceSetupEvidence).every(Boolean);
    const managedDataExists = Boolean(provenance?.matrixSourceId || patternCount || ruleCount || departmentCount || requirementCount);
    const workforceSetupState = preserveWorkforceSetup ? 'COMPLETE' : managedDataExists ? 'PARTIAL' : 'NEW';
    const review = workforceSetupState === 'COMPLETE' ? await workforceReview(this.prisma, user.tenantId, shiftSettings!.fiscalYearStartMonth) : null;
    const consent = await legalConsentState(this.prisma, user.tenantId, user.sub, tenant);
    const result = this.evaluateSetupRequirements({ tenant, shiftSettings, classRequirements, activeStaffCount });
    result.termsVersionCurrent = consent.termsVerified;
    result.privacyVersionCurrent = consent.privacyVerified;
    if (!consent.legalConsentVerified) { result.canComplete = false; if (consent.legalConsentStatus === 'EVIDENCE_MISMATCH') result.missingRequirements.push('LEGAL_CONSENT_EVIDENCE_MISMATCH'); }
    if (review && tenant.setupStatus !== 'COMPLETED' && (!review.workConfirmed || !review.staffConfirmed)) { result.canComplete = false; result.missingRequirements.push('WORKFORCE_REVIEW_REQUIRED'); }
    return { ...tenant, workforceReview: review, tenant: { id: tenant.id, name: tenant.name, code: tenant.code }, shiftSettings, classRequirements, activeStaffCount, preserveWorkforceSetup, workforceSetupState, workforceSetupEvidence, legalConsentVerified: consent.legalConsentVerified, legalConsentStatus: consent.legalConsentStatus, legalRelease: LEGAL_RELEASE, currentTermsVersion: TERMS_VERSION, currentPrivacyVersion: PRIVACY_VERSION, ...result };
  }

  evaluateSetupRequirements(data: any) {
    const missing: string[] = [];
    if (!LEGAL_RELEASE.approved || !LEGAL_RELEASE.effectiveDate) missing.push('LEGAL_RELEASE_NOT_APPROVED');
    if (!data.tenant.name?.trim()) missing.push('TENANT_NAME_REQUIRED');
    if (!data.tenant.contactEmail?.trim()) missing.push('TENANT_CONTACT_EMAIL_REQUIRED');
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

  private async guardWorkforceSetup(user: AuthenticatedUser) {
    const state = await this.get(user);
    if (state.workforceSetupState !== 'NEW') throw new ConflictException({ code: 'EXISTING_WORKFORCE_SETUP_PROTECTED', message: '既存の勤務・部署設定は初回セットアップでは上書きできません。' });
  }

  async updateWorkSettings(user: AuthenticatedUser, input: UpdateShiftSettingDto) {
    await this.guardWorkforceSetup(user);
    await this.settings.updateSetting(user, input);
    await this.prisma.$transaction((tx) => this.startIfNeeded(user, tx));
    return this.get(user);
  }

  async updateClassRequirements(user: AuthenticatedUser, input: UpdateClassRequirementsDto) {
    await this.guardWorkforceSetup(user);
    await this.settings.updateRequirements(user, input);
    await this.prisma.$transaction((tx) => this.startIfNeeded(user, tx));
    return this.get(user);
  }

  async updateProgress(user: AuthenticatedUser, input: UpdateProgressDto) {
    const state = await this.get(user);
    if (state.workforceSetupState === 'PARTIAL' && input.currentStep > 1) throw new ConflictException('既存設定の確認が必要です。');
    const currentStep = input.currentStep;
    if (currentStep >= 5 && !state.legalConsentVerified) throw new ConflictException('現在の利用条件への同意と設定確認が必要です。');
    const review = state.workforceReview;
    if (input.confirmedSection && (!review || input.reviewDigest !== review.digest)) throw new ConflictException('設定が更新されています。再読込して確認してください。');
    if (input.confirmedSection === 'WORK_SETTINGS' && currentStep !== 3) throw new BadRequestException('勤務設定確認の遷移が不正です。');
    if (input.confirmedSection === 'STAFF_CLASSES' && (currentStep !== 4 || !review?.workConfirmed)) throw new ConflictException('勤務設定から順番に確認してください。');
    if (review && state.setupStatus !== 'COMPLETED') {
      if (currentStep > 2 && !review.workConfirmed && input.confirmedSection !== 'WORK_SETTINGS') throw new ConflictException('勤務設定をご確認ください。');
      if (currentStep > 3 && !review.staffConfirmed && input.confirmedSection !== 'STAFF_CLASSES') throw new ConflictException('職員・クラス設定をご確認ください。');
    }
    const newConfirmation = Boolean(input.confirmedSection && !(input.confirmedSection === 'WORK_SETTINGS' ? review?.workConfirmed : review?.staffConfirmed));
    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { setupStatus: true, setupCurrentStep: true } });
      await this.startIfNeeded(user, tx);
      if ((tenant.setupCurrentStep !== currentStep || newConfirmation) && tenant.setupStatus !== 'COMPLETED') {
        await tx.tenant.update({ where: { id: user.tenantId }, data: { setupCurrentStep: currentStep } });
        await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'SETUP_STEP_UPDATED', targetType: 'Tenant', targetId: user.tenantId, detail: { from: tenant.setupCurrentStep, to: currentStep, ...(input.confirmedSection ? { confirmedSection: input.confirmedSection, reviewDigest: input.reviewDigest } : {}) } } });
      }
    });
    return this.get(user);
  }

  async updateConsents(user: AuthenticatedUser, input: UpdateConsentsDto) {
    const state = await this.get(user);
    if (state.workforceSetupState === 'PARTIAL' || (state.workforceReview && state.setupStatus !== 'COMPLETED' && (!state.workforceReview.workConfirmed || !state.workforceReview.staffConfirmed))) throw new ConflictException('既存設定を順番に確認してください。');
    if (state.legalConsentStatus === 'EVIDENCE_MISMATCH') throw new ConflictException({ code: 'LEGAL_CONSENT_EVIDENCE_MISMATCH', message: '既存の同意証跡を確認できません。再同意せず運営窓口へご確認ください。' });
    if (!LEGAL_RELEASE.approved || !LEGAL_RELEASE.effectiveDate) throw new ConflictException({ code: 'LEGAL_RELEASE_NOT_APPROVED', message: '正式文面は確認中です。まだ同意を取得できません。' });
    if (input.termsVersion !== TERMS_VERSION || input.privacyVersion !== PRIVACY_VERSION || input.termsHash !== LEGAL_RELEASE.termsHash || input.privacyHash !== LEGAL_RELEASE.privacyHash) throw new ConflictException({ code: 'LEGAL_VERSION_CHANGED', message: '文書が更新されています。再読込して全文を確認してください。' });
    if (input.acceptTerms !== true || input.acceptPrivacy !== true) throw new BadRequestException('両方の文書への明示的な同意が必要です。');
    await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent consent requests for one tenant; keep evidence append-only.
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${user.tenantId}::uuid FOR UPDATE`;
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { termsAcceptedAt: true, termsVersion: true, privacyAcceptedAt: true, privacyVersion: true } });
      const evidenceState = await legalConsentState(tx, user.tenantId, user.sub, tenant);
      if (evidenceState.legalConsentStatus === 'EVIDENCE_MISMATCH') throw new ConflictException('既存の同意証跡を確認できません。');
      if (evidenceState.legalConsentVerified) return;
      await this.startIfNeeded(user, tx);
      const data: Prisma.TenantUpdateInput = {};
      const agreedAt = new Date();
      const evidence = { agreedAt: agreedAt.toISOString(), effectiveDate: LEGAL_RELEASE.effectiveDate, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, termsHash: LEGAL_RELEASE.termsHash, privacyHash: LEGAL_RELEASE.privacyHash };
      if (!tenant.termsAcceptedAt || tenant.termsVersion !== TERMS_VERSION) { data.termsAcceptedAt = agreedAt; data.termsVersion = TERMS_VERSION; await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'TERMS_ACCEPTED', targetType: 'Tenant', targetId: user.tenantId, detail: { ...evidence, version: TERMS_VERSION }, createdAt: agreedAt } }); }
      if (!tenant.privacyAcceptedAt || tenant.privacyVersion !== PRIVACY_VERSION) { data.privacyAcceptedAt = agreedAt; data.privacyVersion = PRIVACY_VERSION; await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'PRIVACY_ACCEPTED', targetType: 'Tenant', targetId: user.tenantId, detail: { ...evidence, version: PRIVACY_VERSION }, createdAt: agreedAt } }); }
      if (Object.keys(data).length) await tx.tenant.update({ where: { id: user.tenantId }, data });
    });
    return this.get(user);
  }

  async complete(user: AuthenticatedUser) {
    const state = await this.get(user);
    if (state.workforceSetupState === 'PARTIAL') throw new ConflictException('既存設定の確認が必要です。');
    if (!state.canComplete) throw new BadRequestException({ code: 'SETUP_REQUIREMENTS_NOT_MET', missingRequirements: state.missingRequirements });
    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { setupStatus: true } });
      if (tenant.setupStatus !== 'COMPLETED') { await tx.tenant.update({ where: { id: user.tenantId }, data: { setupStatus: 'COMPLETED', setupCurrentStep: 7, setupCompletedAt: new Date() } }); await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'SETUP_COMPLETED', targetType: 'Tenant', targetId: user.tenantId } }); }
    });
    return this.get(user);
  }
}
