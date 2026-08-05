import { ShiftType, StaffWorkRuleType } from '@prisma/client';

export type GeneratorWorkRule = {
  id: string;
  staffId: string;
  ruleType: StaffWorkRuleType;
  dayOfWeek: number | null;
  startDate: Date | null;
  endDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  numericValue: number | null;
  priority: number;
  isHardConstraint: boolean;
  workPattern: { id: string; code: string; startTime: string | null; endTime: string | null; breakMinutes: number; isWorking: boolean; isActive: boolean } | null;
};

const prohibited = new Set<StaffWorkRuleType>([
  StaffWorkRuleType.UNAVAILABLE_WORK_PATTERN,
  StaffWorkRuleType.UNAVAILABLE_DAY_OF_WEEK,
  StaffWorkRuleType.UNAVAILABLE_TIME_RANGE,
  StaffWorkRuleType.REQUIRED_DAY_OFF,
]);
const allowed = new Set<StaffWorkRuleType>([
  StaffWorkRuleType.AVAILABLE_WORK_PATTERN,
  StaffWorkRuleType.AVAILABLE_DAY_OF_WEEK,
  StaffWorkRuleType.AVAILABLE_TIME_RANGE,
]);

export function applicableRules(rules: GeneratorWorkRule[], staffId: string, date: Date) {
  return rules
    .filter((rule) => rule.staffId === staffId && periodMatches(rule, date) && (rule.dayOfWeek == null || rule.dayOfWeek === date.getUTCDay()))
    .sort(compareRules);
}

export function fixedRule(rules: GeneratorWorkRule[], staffId: string, date: Date) {
  return applicableRules(rules, staffId, date).find((rule) => rule.ruleType === StaffWorkRuleType.FIXED_WORK_PATTERN && rule.workPattern);
}

/** FIXED is checked only against higher-priority PROHIBITED rules. */
export function prohibitionConflict(rules: GeneratorWorkRule[], staffId: string, date: Date, type: ShiftType, times: { startTime: string; endTime: string } | null) {
  return applicableRules(rules, staffId, date).find((rule) => prohibited.has(rule.ruleType) && matches(rule, type, times)) ?? null;
}

/** ALLOWED limits only ordinary, non-FIXED candidate selection. */
export function ruleEligibility(rules: GeneratorWorkRule[], staffId: string, date: Date, type: ShiftType, times: { startTime: string; endTime: string } | null) {
  const denied = prohibitionConflict(rules, staffId, date, type, times);
  if (denied) return { eligible: false, reason: denied };

  const availability = rules
    .filter((rule) => rule.staffId === staffId && periodMatches(rule, date) && allowed.has(rule.ruleType))
    .sort(compareRules);
  if (!availability.length) return { eligible: true, reason: null };

  return {
    eligible: availability.some((rule) => {
      if (rule.ruleType === StaffWorkRuleType.AVAILABLE_DAY_OF_WEEK) return rule.dayOfWeek === date.getUTCDay() && type !== ShiftType.OFF;
      if (rule.dayOfWeek != null && rule.dayOfWeek !== date.getUTCDay()) return false;
      return matches(rule, type, times);
    }),
    reason: null,
  };
}

export function preferenceRank(rules: GeneratorWorkRule[], staffId: string, date: Date, type: ShiftType) {
  const preferred = applicableRules(rules, staffId, date).filter((rule) => rule.ruleType === StaffWorkRuleType.PREFERRED_WORK_PATTERN && patternType(rule) === type);
  return preferred.length ? preferred[0].priority : Number.MAX_SAFE_INTEGER;
}

export function patternType(rule: GeneratorWorkRule): ShiftType | null {
  if (!rule.workPattern) return null;
  if (Object.values(ShiftType).includes(rule.workPattern.code as ShiftType)) return rule.workPattern.code as ShiftType;
  return rule.workPattern.isWorking ? ShiftType.OTHER : ShiftType.OFF;
}

export function ruleLabel(rule: GeneratorWorkRule | null | undefined) {
  if (!rule) return '勤務条件の競合';
  if (rule.ruleType === StaffWorkRuleType.REQUIRED_DAY_OFF) return '必須休日';
  if (rule.ruleType === StaffWorkRuleType.UNAVAILABLE_DAY_OF_WEEK) return '勤務不可曜日';
  if (rule.ruleType === StaffWorkRuleType.UNAVAILABLE_TIME_RANGE) return '勤務不可時間帯';
  if (rule.ruleType === StaffWorkRuleType.UNAVAILABLE_WORK_PATTERN) return '利用不可の勤務パターン';
  return '勤務条件の競合';
}

function compareRules(a: GeneratorWorkRule, b: GeneratorWorkRule) {
  return a.priority - b.priority || a.id.localeCompare(b.id);
}

function periodMatches(rule: GeneratorWorkRule, date: Date) {
  if (!rule.startDate || !rule.endDate) return true;
  const value = date.getTime();
  return rule.startDate.getTime() <= value && value <= rule.endDate.getTime();
}

function matches(rule: GeneratorWorkRule, type: ShiftType, times: { startTime: string; endTime: string } | null) {
  if (rule.ruleType === StaffWorkRuleType.REQUIRED_DAY_OFF || rule.ruleType === StaffWorkRuleType.UNAVAILABLE_DAY_OF_WEEK) return type !== ShiftType.OFF;
  if (rule.ruleType === StaffWorkRuleType.UNAVAILABLE_WORK_PATTERN || rule.ruleType === StaffWorkRuleType.AVAILABLE_WORK_PATTERN) return patternType(rule) === type;
  if (!times || !rule.startTime || !rule.endTime) return false;
  const within = rule.startTime <= times.startTime && times.endTime <= rule.endTime;
  const overlaps = times.startTime < rule.endTime && rule.startTime < times.endTime;
  return rule.ruleType === StaffWorkRuleType.AVAILABLE_TIME_RANGE ? within : overlaps;
}
