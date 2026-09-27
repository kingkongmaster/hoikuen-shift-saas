import { ShiftType } from '@prisma/client';

export type ProvisionalSoftRule = {
  staffId: string; kind: 'NEXT_DAY_PATTERN' | 'MONTHLY_PATTERN_PREFERENCE';
  targetPatternId: string; fromPatternId?: string; avoidDayOfWeek?: number; targetMonthlyCount?: number;
  sourceId: string; status: 'RELEASE1_PROVISIONAL_SOFT_RULE'; decisionActorType: 'USER_PRODUCT_OWNER_DECISION';
};

export function readProvisionalSoftRules(value: unknown, staff: Array<{ id: string; employeeNumber: string }>, patterns: Array<{ id: string; code: string }>): ProvisionalSoftRule[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('Invalid provisional SOFT configuration');
  const staffIds = new Map(staff.map(row => [row.employeeNumber, row.id]));
  const patternIds = new Map(patterns.map(row => [row.code, row.id]));
  return value.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid provisional SOFT rule');
    const staffId = staffIds.get(raw.staffCode); const targetPatternId = patternIds.get(raw.targetPatternCode);
    if (!staffId || !targetPatternId || !/^MUSUBI-2026-\d{3}$/.test(raw.sourceId ?? '')
      || raw.status !== 'RELEASE1_PROVISIONAL_SOFT_RULE' || raw.decisionActorType !== 'USER_PRODUCT_OWNER_DECISION') throw new Error('Invalid provisional SOFT provenance or reference');
    if (raw.kind === 'NEXT_DAY_PATTERN') {
      const fromPatternId = patternIds.get(raw.fromPatternCode);
      if (!fromPatternId) throw new Error('Invalid provisional SOFT preceding pattern');
      return { staffId, targetPatternId, fromPatternId, kind: raw.kind, sourceId: raw.sourceId, status: raw.status, decisionActorType: raw.decisionActorType };
    }
    if (raw.kind !== 'MONTHLY_PATTERN_PREFERENCE' || !Number.isInteger(raw.avoidDayOfWeek) || raw.avoidDayOfWeek < 0 || raw.avoidDayOfWeek > 6
      || !Number.isInteger(raw.targetMonthlyCount) || raw.targetMonthlyCount < 1) throw new Error('Invalid provisional SOFT monthly preference');
    return { staffId, targetPatternId, kind: raw.kind, avoidDayOfWeek: raw.avoidDayOfWeek, targetMonthlyCount: raw.targetMonthlyCount,
      sourceId: raw.sourceId, status: raw.status, decisionActorType: raw.decisionActorType };
  });
}

/** Called only to rank candidates already admitted by HARD eligibility. Never excludes a candidate. */
export function provisionalSoftRank(rules: ProvisionalSoftRule[], staffId: string, date: Date, patternId: string | undefined,
  history: Array<{ staffId: string; workDate: Date; workPatternId?: string | null; shiftType: ShiftType }>, systemIds: Partial<Record<ShiftType, string>>) {
  if (!patternId) return 0;
  const id = (row: typeof history[number]) => row.workPatternId ?? systemIds[row.shiftType];
  let score = 0;
  for (const rule of rules.filter(row => row.staffId === staffId)) {
    if (rule.kind === 'NEXT_DAY_PATTERN' && history.some(row => row.staffId === staffId && row.workDate.getTime() === date.getTime() - 86400000 && id(row) === rule.fromPatternId)) {
      score += patternId === rule.targetPatternId ? -2 : 2;
    }
    if (rule.kind === 'MONTHLY_PATTERN_PREFERENCE' && patternId === rule.targetPatternId) {
      const count = history.filter(row => row.staffId === staffId && row.workDate.getUTCFullYear() === date.getUTCFullYear()
        && row.workDate.getUTCMonth() === date.getUTCMonth() && id(row) === patternId).length;
      score += date.getUTCDay() === rule.avoidDayOfWeek ? 2 : count < rule.targetMonthlyCount! ? -1 : 1;
    }
  }
  return score;
}
