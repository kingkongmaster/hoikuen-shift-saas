export type AnnualTargetContract = {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  annualizedTargetMinutes: number;
  voidedAt?: Date | null;
};

export type AnnualTargetProration = {
  annualTargetMinutes: number | null;
  coveredDays: number;
  fiscalYearDays: number;
  calculationStatus: 'COMPLETE' | 'REVIEW_REQUIRED' | 'NOT_CONFIGURED';
  unavailableReason: 'CONTRACT_GAP' | 'CONTRACT_NOT_CONFIGURED' | null;
};

const DAY_MS = 86_400_000;

export function prorateAnnualTarget(start: Date, endExclusive: Date, contracts: AnnualTargetContract[]): AnnualTargetProration {
  const fiscalYearDays = days(start, endExclusive);
  if (fiscalYearDays <= 0) throw new RangeError('Fiscal year range must not be empty.');
  const active = contracts.filter((contract) => !contract.voidedAt).map((contract) => {
    if (!Number.isInteger(contract.annualizedTargetMinutes) || contract.annualizedTargetMinutes <= 0) {
      throw new RangeError('annualizedTargetMinutes must be a positive integer.');
    }
    const contractEnd = contract.effectiveTo ? addDays(contract.effectiveTo, 1) : endExclusive;
    return { ...contract, start: later(start, contract.effectiveFrom), end: earlier(endExclusive, contractEnd) };
  }).filter((contract) => contract.start < contract.end);
  if (!active.length) return { annualTargetMinutes: null, coveredDays: 0, fiscalYearDays, calculationStatus: 'NOT_CONFIGURED', unavailableReason: 'CONTRACT_NOT_CONFIGURED' };

  let numerator = 0n;
  for (const contract of active) numerator += BigInt(contract.annualizedTargetMinutes) * BigInt(days(contract.start, contract.end));
  const denominator = BigInt(fiscalYearDays);
  const annualTargetMinutes = Number((numerator + denominator / 2n) / denominator);
  const coveredDays = mergedCoveredDays(active.map(({ start: rangeStart, end }) => ({ start: rangeStart, end })));
  const complete = coveredDays === fiscalYearDays;
  return {
    annualTargetMinutes,
    coveredDays,
    fiscalYearDays,
    calculationStatus: complete ? 'COMPLETE' : 'REVIEW_REQUIRED',
    unavailableReason: complete ? null : 'CONTRACT_GAP',
  };
}

function mergedCoveredDays(ranges: Array<{ start: Date; end: Date }>): number {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  let total = 0;
  let current = sorted[0];
  for (const range of sorted.slice(1)) {
    if (range.start <= current.end) current = { start: current.start, end: later(current.end, range.end) };
    else { total += days(current.start, current.end); current = range; }
  }
  return total + days(current.start, current.end);
}

function days(start: Date, end: Date): number { return Math.round((end.getTime() - start.getTime()) / DAY_MS); }
function addDays(value: Date, amount: number): Date { return new Date(value.getTime() + amount * DAY_MS); }
function earlier(a: Date, b: Date): Date { return a < b ? a : b; }
function later(a: Date, b: Date): Date { return a > b ? a : b; }
