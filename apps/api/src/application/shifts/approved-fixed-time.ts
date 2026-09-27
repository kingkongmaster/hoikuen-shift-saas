import { StaffWorkRuleType } from '@prisma/client';
import type { GeneratorWorkRule } from './staff-work-rule-evaluator';

/** A source-backed time range is not an annual employment contract. */
export function hasApprovedFixedTime(rules: GeneratorWorkRule[], staffId: string, start: string, end: string, range: { start: Date; end: Date }) {
  const candidates = rules.filter(rule => rule.staffId === staffId && rule.ruleType === StaffWorkRuleType.AVAILABLE_TIME_RANGE
    && rule.isHardConstraint && rule.dayOfWeek == null && rule.startTime === start && rule.endTime === end
    && (!rule.startDate || rule.startDate <= range.start) && (!rule.endDate || rule.endDate.getTime() >= range.end.getTime() - 86400000));
  if (candidates.length !== 1 || candidates[0].sourceType !== 'FORMAL_SOURCE_PACKAGE') return false;
  try {
    const source = JSON.parse(candidates[0].sourceReference ?? '{}');
    return /^MUSUBI-2026-\d{3}$/.test(source.sourceId ?? '') && source.approvalStatus === 'APPROVED'
      && source.decisionActorType === 'RECORDED_ADMIN_ANSWER' && typeof source.locator === 'string' && source.locator.length > 0;
  } catch { return false; }
}
