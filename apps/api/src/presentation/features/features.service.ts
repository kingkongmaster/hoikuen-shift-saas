import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { SubscriptionPlan } from '@prisma/client';
import { FEATURE_CODES, PLAN_FEATURES, type FeatureCode } from '../../domain/features/feature-catalog';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { UpdateTenantFeatureDto } from './feature.dto';

type Resolution = { enabled: boolean; source: 'CONTRACT' | 'TENANT_OVERRIDE' | 'PLAN' | 'NONE'; code?: string };

@Injectable()
export class FeaturesService {
  constructor(private readonly prisma: PrismaService, private readonly subscriptions: SubscriptionsService, private readonly audit: AuditService) {}

  async list(tenantId: string) {
    const entries = await Promise.all(FEATURE_CODES.map(async (featureCode) => ({ featureCode, ...(await this.resolve(tenantId, featureCode)) })));
    return { enabledFeatures: entries.filter((entry) => entry.enabled).map((entry) => entry.featureCode), features: entries };
  }

  async resolve(tenantId: string, featureCode: FeatureCode, at = new Date()): Promise<Resolution> {
    const subscription = await this.subscriptions.find(tenantId);
    if (this.subscriptions.readOnly(subscription)) return { enabled: false, source: 'CONTRACT', code: 'FEATURE_NOT_AVAILABLE' };
    const override = await this.prisma.tenantFeature.findUnique({ where: { tenantId_featureCode: { tenantId, featureCode } } });
    if (override) {
      const active = (!override.validFrom || override.validFrom <= at) && (!override.validTo || override.validTo > at);
      if (active) return { enabled: override.enabled, source: 'TENANT_OVERRIDE', ...(override.enabled ? {} : { code: 'FEATURE_NOT_ENTITLED' }) };
    }
    return PLAN_FEATURES[subscription.plan as SubscriptionPlan].has(featureCode)
      ? { enabled: true, source: 'PLAN' }
      : { enabled: false, source: 'NONE', code: 'FEATURE_NOT_ENTITLED' };
  }

  async assertAvailable(tenantId: string, featureCode: FeatureCode) {
    const resolution = await this.resolve(tenantId, featureCode);
    if (!resolution.enabled) throw new ForbiddenException({ code: resolution.code ?? 'FEATURE_NOT_ENTITLED', message: 'この機能は現在の契約では利用できません。' });
  }

  async platformSet(user: AuthenticatedUser, tenantId: string, input: UpdateTenantFeatureDto) {
    await this.assertPlatformAdmin(user);
    await this.ensureTenant(tenantId);
    const validFrom = input.validFrom ? new Date(input.validFrom) : null;
    const validTo = input.validTo ? new Date(input.validTo) : null;
    if (validFrom && validTo && validTo <= validFrom) throw new BadRequestException('有効終了日時は開始日時より後にしてください。');
    if (input.featureCode === 'TENANT_CUSTOM_RULES' && input.enabled && !['CUSTOM_CONTRACT', 'MANUAL'].includes(input.source)) throw new BadRequestException('園固有ルールは個別契約または明示設定でのみ有効化できます。');
    const before = await this.prisma.tenantFeature.findUnique({ where: { tenantId_featureCode: { tenantId, featureCode: input.featureCode } } });
    const feature = await this.prisma.tenantFeature.upsert({
      where: { tenantId_featureCode: { tenantId, featureCode: input.featureCode } },
      create: { tenantId, featureCode: input.featureCode, enabled: input.enabled, source: input.source, validFrom, validTo, createdByUserId: user.sub },
      update: { enabled: input.enabled, source: input.source, validFrom, validTo, createdByUserId: user.sub },
    });
    await this.audit.create(tenantId, user.sub, before ? 'TENANT_FEATURE_UPDATED' : 'TENANT_FEATURE_CREATED', 'TenantFeature', feature.id, { tenantId, featureCode: feature.featureCode, before: before ? { enabled: before.enabled, source: before.source, validFrom: before.validFrom, validTo: before.validTo } : null, after: { enabled: feature.enabled, source: feature.source, validFrom: feature.validFrom, validTo: feature.validTo } });
    return feature;
  }

  async platformList(user: AuthenticatedUser, tenantId: string) {
    await this.assertPlatformAdmin(user);
    await this.ensureTenant(tenantId);
    return this.list(tenantId);
  }

  async platformDelete(user: AuthenticatedUser, tenantId: string, featureCode: FeatureCode) {
    await this.assertPlatformAdmin(user);
    const feature = await this.prisma.tenantFeature.findUnique({ where: { tenantId_featureCode: { tenantId, featureCode } } });
    if (!feature) throw new NotFoundException('FEATURE_OVERRIDE_NOT_FOUND');
    await this.prisma.tenantFeature.delete({ where: { id: feature.id } });
    await this.audit.create(tenantId, user.sub, 'TENANT_FEATURE_DELETED', 'TenantFeature', feature.id, { tenantId, featureCode, enabled: feature.enabled, source: feature.source, validFrom: feature.validFrom, validTo: feature.validTo });
    return { deleted: true, featureCode };
  }

  private async ensureTenant(tenantId: string) { if (!(await this.prisma.tenant.count({ where: { id: tenantId } }))) throw new NotFoundException('TENANT_NOT_FOUND'); }
  private async assertPlatformAdmin(user: AuthenticatedUser) { const actor = await this.prisma.user.findUnique({ where: { id: user.sub }, select: { isPlatformAdmin: true } }); if (!actor?.isPlatformAdmin) throw new ForbiddenException('プラットフォーム管理者専用です。'); }
}
