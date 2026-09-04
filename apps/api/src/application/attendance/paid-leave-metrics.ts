export type PaidLeaveUsageMetricInput={unit:'DAY'|'HALF_DAY'|string;usedHalfDays:number;status:'CONFIRMED'|string};
export type PaidLeaveMetrics={fullDayPaidLeaveCount:number;halfDayPaidLeaveCount:number;paidLeaveUsageCount:number;paidLeaveEquivalentDays:number};

export function paidLeaveMetrics(rows:PaidLeaveUsageMetricInput[]):PaidLeaveMetrics{
  const confirmed=rows.filter(row=>row.status==='CONFIRMED');
  return {
    fullDayPaidLeaveCount:confirmed.filter(row=>row.unit==='DAY').length,
    halfDayPaidLeaveCount:confirmed.filter(row=>row.unit==='HALF_DAY').length,
    paidLeaveUsageCount:confirmed.length,
    paidLeaveEquivalentDays:confirmed.reduce((sum,row)=>sum+row.usedHalfDays,0)/2,
  };
}
