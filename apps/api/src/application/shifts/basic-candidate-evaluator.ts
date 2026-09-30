import { ShiftType } from '@prisma/client';
import type { GeneratorStaff } from './rule-based-shift-generator';
import { hasAttribute, type GeneratorAttributeAssignment, type GeneratorWorkPattern } from './staffing-requirement-evaluator';
import { fixedRule, patternType, prohibitionConflict, ruleEligibility, type GeneratorWorkRule } from './staff-work-rule-evaluator';

export type BasicCandidateDecision = { eligible: boolean; reason: string; fixed: boolean };
const decision = (eligible: boolean, reason = 'ELIGIBLE', fixed = false): BasicCandidateDecision => ({ eligible, reason, fixed });

// These predicates deliberately preserve the existing generator's branch semantics.
// In particular the numbered-pattern path does not apply the legacy NORMAL flag.
export function basicMemberEligibility(member: GeneratorStaff, date: Date, type: ShiftType, legacyNormal = false): BasicCandidateDecision {
  if (date.getUTCDay() === 6 && !member.canWorkSaturdays) return decision(false, 'SATURDAY_NOT_ALLOWED');
  if (type === ShiftType.EARLY && (!member.canWorkEarly || member.lateShiftOnly)) return decision(false, 'PATTERN_NOT_ALLOWED');
  if (type === ShiftType.LATE && (!member.canWorkLate || member.earlyShiftOnly)) return decision(false, 'PATTERN_NOT_ALLOWED');
  if (legacyNormal && type === ShiftType.NORMAL && (!member.canWorkRegular || member.earlyShiftOnly || member.lateShiftOnly)) return decision(false, 'PATTERN_NOT_ALLOWED');
  return decision(true);
}
export function basicRuleEligibility(rules: GeneratorWorkRule[], memberId: string, date: Date, type: ShiftType, times: { startTime: string; endTime: string } | null, patternId?: string): BasicCandidateDecision {
  const r = ruleEligibility(rules, memberId, date, type, times, patternId);
  return decision(r.eligible, r.eligible ? 'ELIGIBLE' : r.reason?.ruleType ?? 'AVAILABILITY_NOT_MATCHED');
}
export function basicAttributeEligibility(attributes: GeneratorAttributeAssignment[], memberId: string, attributeId: string, date: Date): BasicCandidateDecision {
  return hasAttribute(attributes, memberId, attributeId, date) ? decision(true) : decision(false, 'REQUIRED_ATTRIBUTE_MISSING');
}
export function basicFixedConflict(rules: GeneratorWorkRule[], memberId: string, date: Date, type: ShiftType, times: { startTime: string; endTime: string } | null, patternId: string) {
  return prohibitionConflict(rules, memberId, date, type, times, patternId);
}

export type BasicCandidateMember = GeneratorStaff & { tenantId: string; isActive: boolean; rotationEligible: boolean };
export type BasicCandidateInput = {
  tenantId: string; date: Date; pattern: GeneratorWorkPattern; attributeId: string;
  staff: BasicCandidateMember[]; rules: GeneratorWorkRule[]; attributes: GeneratorAttributeAssignment[];
  systemWorkPatternIds: Partial<Record<ShiftType, string>>;
};
// This is a prepared, tenant-scoped baseline input, never a raw request body.
// Monthly context/contract preparation remains the caller's responsibility.
export function basicCandidateSet(input: BasicCandidateInput) {
  const eligible = new Set<string>(); const fixed = new Set<string>();
  const excluded = new Map<string, Set<string>>();
  const seen = new Set<string>();
  const type = (Object.entries(input.systemWorkPatternIds).find(([, id]) => id === input.pattern.id)?.[0] ?? ShiftType.OTHER) as ShiftType;
  for (const member of input.staff) {
    // Ignore foreign rows before deduplication: they cannot shadow a local member.
    if (member.tenantId !== input.tenantId) continue;
    if (seen.has(member.id)) continue; seen.add(member.id);
    let result: BasicCandidateDecision;
    if (!member.isActive) result = decision(false, 'INACTIVE_STAFF');
    else if (!member.rotationEligible) result = decision(false, 'NOT_ROTATION_TARGET');
    else if (!input.pattern.isActive || !input.pattern.isWorking) result = decision(false, 'INACTIVE_PATTERN');
    else {
      const rule = fixedRule(input.rules, member.id, input.date);
      const fixedType = rule?.workPattern ? patternType(rule) : null;
      const fixedTimes = rule?.workPattern?.startTime && rule.workPattern.endTime ? { startTime: rule.workPattern.startTime, endTime: rule.workPattern.endTime } : null;
      const fixedApplies = !!(rule?.workPattern?.isActive && fixedType && !basicFixedConflict(input.rules, member.id, input.date, fixedType, fixedTimes, rule.workPattern.id));
      if (fixedApplies) {
        result = rule!.workPattern!.id !== input.pattern.id
          ? decision(false, 'FIXED_TO_OTHER_PATTERN')
          : { ...basicAttributeEligibility(input.attributes, member.id, input.attributeId, input.date), fixed: true };
      } else {
        // An inactive/prohibited fixed assignment is not allocated by the generator;
        // preserve its ordinary-candidate fallback rather than reserving that member.
        result = basicAttributeEligibility(input.attributes, member.id, input.attributeId, input.date);
        if (result.eligible) result = basicMemberEligibility(member, input.date, type);
        if (result.eligible) result = basicRuleEligibility(input.rules, member.id, input.date, type, input.pattern.startTime && input.pattern.endTime ? { startTime: input.pattern.startTime, endTime: input.pattern.endTime } : null, input.pattern.id);
      }
    }
    if (result.eligible) { eligible.add(member.id); if (result.fixed) fixed.add(member.id); }
    else { if (!excluded.has(result.reason)) excluded.set(result.reason, new Set()); excluded.get(result.reason)!.add(member.id); }
  }
  return { scope: 'PREPARED_BASELINE_COMPONENT' as const, eligibleIds: [...eligible].sort(), fixedIds: [...fixed].sort(), exclusions: Object.fromEntries([...excluded].map(([reason, ids]) => [reason, ids.size])) };
}
