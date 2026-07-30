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
