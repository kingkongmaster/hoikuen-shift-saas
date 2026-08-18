export type FiscalYearRange = {
  fiscalYear: number;
  fiscalYearStartMonth: number;
  start: Date;
  endExclusive: Date;
};

export function fiscalYearRange(fiscalYear: number, fiscalYearStartMonth: number): FiscalYearRange {
  if (!Number.isInteger(fiscalYear)) throw new RangeError('fiscalYear must be an integer.');
  if (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
    throw new RangeError('fiscalYearStartMonth must be between 1 and 12.');
  }
  return {
    fiscalYear,
    fiscalYearStartMonth,
    start: new Date(Date.UTC(fiscalYear, fiscalYearStartMonth - 1, 1)),
    endExclusive: new Date(Date.UTC(fiscalYear + 1, fiscalYearStartMonth - 1, 1)),
  };
}

export function fiscalYearForDate(date: Date, fiscalYearStartMonth: number): number {
  if (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
    throw new RangeError('fiscalYearStartMonth must be between 1 and 12.');
  }
  return date.getUTCMonth() + 1 >= fiscalYearStartMonth ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}
