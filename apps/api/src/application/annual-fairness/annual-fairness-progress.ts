import { annualWorkSummary, type AnnualSummaryAssignment } from './annual-work-summary-calculator';
import { prorateAnnualTarget, type AnnualTargetContract } from './annual-target-proration';
import { resolveDailyPrescribedMinutes, type DailyContract } from './daily-prescribed-minutes';

export type AnnualFairnessMember = { regularWorkStartTime: string | null; regularWorkEndTime: string | null; workContracts: Array<AnnualTargetContract & DailyContract>; assignments: AnnualSummaryAssignment[] };
export type AnnualFairnessTenantDefaults = { defaultStartNormal: string | null; defaultEndNormal: string | null; defaultBreakMinutes: number };

export function calculateAnnualFairnessProgress(member: AnnualFairnessMember, range: { start: Date; endExclusive: Date }, tenant: AnnualFairnessTenantDefaults) {
  const target = prorateAnnualTarget(range.start, range.endExclusive, member.workContracts);
  const actual = annualWorkSummary(member.assignments, (assignment) => assignment.workDate ? resolveDailyPrescribedMinutes(assignment.workDate, member.workContracts, member, tenant).minutes : null);
  return { target, actual, calculationStatus: actual.calculationStatus === 'UNAVAILABLE' ? 'UNAVAILABLE' : target.calculationStatus, unavailableReason: actual.calculationStatus === 'UNAVAILABLE' ? actual.unavailableReason : target.unavailableReason } as const;
}
