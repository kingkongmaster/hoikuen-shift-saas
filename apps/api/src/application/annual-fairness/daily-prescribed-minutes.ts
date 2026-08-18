import { prescribedMinutes } from './annual-work-summary-calculator';

export type DailyContract = {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  prescribedDailyMinutes: number;
  voidedAt?: Date | null;
};

export type DailyPrescribedSource = 'CONTRACT' | 'STAFF' | 'TENANT' | 'UNAVAILABLE';

export function resolveDailyPrescribedMinutes(
  workDate: Date,
  contracts: DailyContract[],
  staff: { regularWorkStartTime: string | null; regularWorkEndTime: string | null },
  tenant: { defaultStartNormal: string | null; defaultEndNormal: string | null; defaultBreakMinutes: number },
): { minutes: number | null; source: DailyPrescribedSource } {
  const contract = contracts.find((row) => !row.voidedAt && row.effectiveFrom <= workDate && (!row.effectiveTo || workDate <= row.effectiveTo));
  if (contract) {
    return Number.isInteger(contract.prescribedDailyMinutes) && contract.prescribedDailyMinutes > 0
      ? { minutes: contract.prescribedDailyMinutes, source: 'CONTRACT' }
      : { minutes: null, source: 'UNAVAILABLE' };
  }
  const staffMinutes = prescribedMinutes(staff.regularWorkStartTime, staff.regularWorkEndTime, tenant.defaultBreakMinutes);
  if (staffMinutes != null) return { minutes: staffMinutes, source: 'STAFF' };
  const tenantMinutes = prescribedMinutes(tenant.defaultStartNormal, tenant.defaultEndNormal, tenant.defaultBreakMinutes);
  return tenantMinutes == null ? { minutes: null, source: 'UNAVAILABLE' } : { minutes: tenantMinutes, source: 'TENANT' };
}
