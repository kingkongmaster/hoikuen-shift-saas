import { SubscriptionPlan } from '@prisma/client';

export const FEATURE_CODES = [
  'BASIC_SHIFT_GENERATION',
  'ADVANCED_WORK_PATTERNS',
  'STAFF_WORK_RULES',
  'ROLE_QUALIFICATION_MANAGEMENT',
  'ADVANCED_STAFFING_REQUIREMENTS',
  'TENANT_CUSTOM_RULES',
] as const;

export type FeatureCode = (typeof FEATURE_CODES)[number];
export const FEATURE_SOURCES = ['PLAN_OVERRIDE', 'MANUAL', 'CUSTOM_CONTRACT'] as const;
export type FeatureSource = (typeof FEATURE_SOURCES)[number];

export const PLAN_FEATURES: Record<SubscriptionPlan, ReadonlySet<FeatureCode>> = {
  TRIAL: new Set(['BASIC_SHIFT_GENERATION']),
  STANDARD: new Set(['BASIC_SHIFT_GENERATION']),
  PROFESSIONAL: new Set([
    'BASIC_SHIFT_GENERATION',
    'ADVANCED_WORK_PATTERNS',
    'STAFF_WORK_RULES',
    'ROLE_QUALIFICATION_MANAGEMENT',
    'ADVANCED_STAFFING_REQUIREMENTS',
  ]),
};

export function isFeatureCode(value: string): value is FeatureCode {
  return (FEATURE_CODES as readonly string[]).includes(value);
}

export const FEATURE_LABELS: Record<FeatureCode, string> = {
  BASIC_SHIFT_GENERATION: 'シフト自動生成', ADVANCED_WORK_PATTERNS: '勤務パターン設定',
  STAFF_WORK_RULES: '個別勤務条件', ROLE_QUALIFICATION_MANAGEMENT: '役職・資格管理',
  ADVANCED_STAFFING_REQUIREMENTS: '詳細な必要人数設定', TENANT_CUSTOM_RULES: '園専用ルール',
};
export type FeatureResolution = { enabled: boolean; source: 'CONTRACT' | 'TENANT_OVERRIDE' | 'PLAN' | 'NONE'; code?: string };
export function resolveVerifiedFeature(plan: SubscriptionPlan, readOnly: boolean, feature: FeatureCode, override: { source?: string; tenantId?:string; enabled: boolean; validFrom: Date | null; validTo: Date | null } | null, at = new Date()): FeatureResolution {
  if (readOnly) return { enabled: false, source: 'CONTRACT', code: 'FEATURE_NOT_AVAILABLE' };
  if(override && (typeof override.enabled!=='boolean'||!FEATURE_SOURCES.includes(override.source as FeatureSource)||[override.validFrom,override.validTo].some(d=>d!=null&&(!(d instanceof Date)||!Number.isFinite(d.getTime())))||(override.validFrom&&override.validTo&&override.validFrom>=override.validTo)||(feature==='TENANT_CUSTOM_RULES'&&override.enabled&&!['MANUAL','CUSTOM_CONTRACT'].includes(override.source??''))))return {enabled:false,source:'CONTRACT',code:'FEATURE_UNVERIFIED'};
  if (override && (!override.validFrom || override.validFrom <= at) && (!override.validTo || override.validTo > at)) {
    return { enabled: override.enabled, source: 'TENANT_OVERRIDE', ...(override.enabled ? {} : { code: 'FEATURE_NOT_ENTITLED' }) };
  }
  return PLAN_FEATURES[plan].has(feature) ? { enabled: true, source: 'PLAN' } : { enabled: false, source: 'NONE', code: 'FEATURE_NOT_ENTITLED' };
}
