import { ShiftType } from '@prisma/client';
import { assignmentTimeBreakdown, type PaidLeaveModifierType } from '../attendance/assignment-time-breakdown';

const workedTypes = new Set<ShiftType>([ShiftType.EARLY, ShiftType.NORMAL, ShiftType.LATE, ShiftType.OTHER]);
const leaveTypes = new Set<ShiftType>([ShiftType.PAID_LEAVE, ShiftType.AM_HALF, ShiftType.PM_HALF]);

export type AnnualSummaryAssignment = {
  workDate?: Date;
  shiftType: ShiftType;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number | null;
  attendanceModifier?: { modifierType: PaidLeaveModifierType | string } | null;
};

export type PrescribedMinutesResolver = (assignment: AnnualSummaryAssignment) => number | null;

export type AnnualWorkSummary = {
  actualWorkedMinutes: number | null;
  paidLeaveEquivalentMinutes: number | null;
  halfLeaveEquivalentMinutes: number | null;
  fairnessActualMinutes: number | null;
  calculationStatus: 'COMPLETE' | 'UNAVAILABLE';
  unavailableReason: string | null;
};

export function annualWorkSummary(
  assignments: AnnualSummaryAssignment[],
  prescribedWorkMinutes: number | null | PrescribedMinutesResolver,
): AnnualWorkSummary {
  const resolve = typeof prescribedWorkMinutes === 'function' ? prescribedWorkMinutes : () => prescribedWorkMinutes;
  if (assignments.some((assignment) => workedTypes.has(assignment.shiftType) && (!assignment.startTime || !assignment.endTime))) {
    return { actualWorkedMinutes:null, paidLeaveEquivalentMinutes:null, halfLeaveEquivalentMinutes:null, fairnessActualMinutes:null, calculationStatus:'UNAVAILABLE', unavailableReason:'WORKED_ASSIGNMENT_MINUTES_UNAVAILABLE' };
  }
  if (assignments.some((assignment) => leaveTypes.has(assignment.shiftType) && resolve(assignment) == null)) {
    return { actualWorkedMinutes:assignments.filter(row=>workedTypes.has(row.shiftType)).reduce((sum,row)=>sum+assignmentTimeBreakdown(row).actualWorkMinutes,0), paidLeaveEquivalentMinutes:null, halfLeaveEquivalentMinutes:null, fairnessActualMinutes:null, calculationStatus:'UNAVAILABLE', unavailableReason:'PRESCRIBED_WORK_MINUTES_UNAVAILABLE' };
  }
  const breakdowns = assignments.map((assignment) => {
    try { return assignmentTimeBreakdown(assignment, resolve(assignment)); } catch { return null; }
  });
  if (breakdowns.some((value) => value == null)) {
    return {
      actualWorkedMinutes: null,
      paidLeaveEquivalentMinutes: null,
      halfLeaveEquivalentMinutes: null,
      fairnessActualMinutes: null,
      calculationStatus: 'UNAVAILABLE',
      unavailableReason: 'WORKED_ASSIGNMENT_MINUTES_UNAVAILABLE',
    };
  }
  const values=breakdowns as NonNullable<(typeof breakdowns)[number]>[];
  const actualWorkedMinutes=values.reduce((sum,row)=>sum+row.actualWorkMinutes,0);
  const paidLeaveEquivalentMinutes=values.filter(row=>row.representation==='FULL_PAID_LEAVE').reduce((sum,row)=>sum+row.paidLeaveMinutes,0);
  const halfLeaveEquivalentMinutes=values.filter(row=>row.representation==='WORK_WITH_MODIFIER'||row.representation==='LEGACY_HALF_LEAVE').reduce((sum,row)=>sum+row.paidLeaveMinutes,0);
  return {
    actualWorkedMinutes,
    paidLeaveEquivalentMinutes,
    halfLeaveEquivalentMinutes,
    fairnessActualMinutes: actualWorkedMinutes + paidLeaveEquivalentMinutes + halfLeaveEquivalentMinutes,
    calculationStatus: 'COMPLETE',
    unavailableReason: null,
  };
}

export function prescribedMinutes(startTime: string | null, endTime: string | null, breakMinutes: number): number | null {
  if (!startTime || !endTime) return null;
  const minutes = timeMinutes(endTime) - timeMinutes(startTime) - breakMinutes;
  return minutes > 0 ? minutes : null;
}

function timeMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
