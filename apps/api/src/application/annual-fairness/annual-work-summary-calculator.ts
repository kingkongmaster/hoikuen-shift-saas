import { ShiftType } from '@prisma/client';

const workedTypes = new Set<ShiftType>([ShiftType.EARLY, ShiftType.NORMAL, ShiftType.LATE, ShiftType.OTHER]);
const halfLeaveTypes = new Set<ShiftType>([ShiftType.AM_HALF, ShiftType.PM_HALF]);

export type AnnualSummaryAssignment = {
  shiftType: ShiftType;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number | null;
};

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
  prescribedWorkMinutes: number | null,
): AnnualWorkSummary {
  const workedAssignments = assignments.filter((assignment) => workedTypes.has(assignment.shiftType));
  const workedMinutes = workedAssignments.map(assignmentMinutes);
  if (workedMinutes.some((minutes) => minutes == null)) {
    return {
      actualWorkedMinutes: null,
      paidLeaveEquivalentMinutes: null,
      halfLeaveEquivalentMinutes: null,
      fairnessActualMinutes: null,
      calculationStatus: 'UNAVAILABLE',
      unavailableReason: 'WORKED_ASSIGNMENT_MINUTES_UNAVAILABLE',
    };
  }
  const actualWorkedMinutes = workedMinutes.reduce<number>((sum, minutes) => sum + (minutes as number), 0);
  const paidLeaveCount = assignments.filter((assignment) => assignment.shiftType === ShiftType.PAID_LEAVE).length;
  const halfLeaveCount = assignments.filter((assignment) => halfLeaveTypes.has(assignment.shiftType)).length;
  if ((paidLeaveCount || halfLeaveCount) && prescribedWorkMinutes == null) {
    return {
      actualWorkedMinutes,
      paidLeaveEquivalentMinutes: null,
      halfLeaveEquivalentMinutes: null,
      fairnessActualMinutes: null,
      calculationStatus: 'UNAVAILABLE',
      unavailableReason: 'PRESCRIBED_WORK_MINUTES_UNAVAILABLE',
    };
  }
  const paidLeaveEquivalentMinutes = paidLeaveCount * (prescribedWorkMinutes ?? 0);
  const halfLeaveEquivalentMinutes = Math.round((halfLeaveCount * (prescribedWorkMinutes ?? 0)) / 2);
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

function assignmentMinutes(assignment: AnnualSummaryAssignment): number | null {
  if (!assignment.startTime || !assignment.endTime) return null;
  const minutes = timeMinutes(assignment.endTime) - timeMinutes(assignment.startTime) - (assignment.breakMinutes ?? 0);
  return minutes > 0 ? minutes : null;
}

function timeMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
