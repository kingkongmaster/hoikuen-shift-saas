import { ShiftType } from '@prisma/client';

export type PaidLeaveModifierType = 'AM_PAID_LEAVE' | 'PM_PAID_LEAVE';

export type AssignmentTimeInput = {
  shiftType: ShiftType | string;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number | null;
  attendanceModifier?: { modifierType: PaidLeaveModifierType | string } | null;
};

export type AssignmentTimeBreakdown = {
  scheduledMinutes: number;
  actualWorkMinutes: number;
  paidLeaveMinutes: number;
  paidLeaveEquivalentDays: number;
  modifierType: PaidLeaveModifierType | null;
  representation: 'WORK' | 'WORK_WITH_MODIFIER' | 'LEGACY_HALF_LEAVE' | 'FULL_PAID_LEAVE' | 'NON_WORK';
};

const workingTypes = new Set<string>([ShiftType.EARLY, ShiftType.NORMAL, ShiftType.LATE, ShiftType.OTHER]);
const legacyHalfTypes = new Set<string>([ShiftType.AM_HALF, ShiftType.PM_HALF]);
const paidModifiers = new Set<string>(['AM_PAID_LEAVE', 'PM_PAID_LEAVE']);

/** Single source of truth for work/paid-leave time. New data uses a working Assignment plus modifier; legacy half-shift rows remain read-compatible. */
export function assignmentTimeBreakdown(input: AssignmentTimeInput, prescribedMinutes: number | null = null): AssignmentTimeBreakdown {
  const modifierType = paidModifiers.has(input.attendanceModifier?.modifierType ?? '')
    ? input.attendanceModifier!.modifierType as PaidLeaveModifierType
    : null;
  const explicitMinutes = minutesBetween(input.startTime, input.endTime, input.breakMinutes ?? 0);

  if (workingTypes.has(input.shiftType)) {
    if (explicitMinutes == null) throw new RangeError('Working Assignment requires valid start/end time.');
    if (!modifierType) return result(explicitMinutes, explicitMinutes, 0, null, 'WORK');
    const actual = Math.floor(explicitMinutes / 2);
    return result(explicitMinutes, actual, explicitMinutes - actual, modifierType, 'WORK_WITH_MODIFIER');
  }
  if (input.shiftType === ShiftType.PAID_LEAVE) {
    if (prescribedMinutes == null) throw new RangeError('Paid leave requires prescribed minutes.');
    return result(prescribedMinutes, 0, prescribedMinutes, null, 'FULL_PAID_LEAVE');
  }
  if (legacyHalfTypes.has(input.shiftType)) {
    if (prescribedMinutes == null) throw new RangeError('Legacy half leave requires prescribed minutes.');
    const actual = Math.floor(prescribedMinutes / 2);
    return result(prescribedMinutes, actual, prescribedMinutes - actual, input.shiftType === ShiftType.AM_HALF ? 'AM_PAID_LEAVE' : 'PM_PAID_LEAVE', 'LEGACY_HALF_LEAVE');
  }
  return result(0, 0, 0, null, 'NON_WORK');
}

function result(scheduledMinutes:number,actualWorkMinutes:number,paidLeaveMinutes:number,modifierType:PaidLeaveModifierType|null,representation:AssignmentTimeBreakdown['representation']):AssignmentTimeBreakdown {
  return { scheduledMinutes, actualWorkMinutes, paidLeaveMinutes, paidLeaveEquivalentDays: paidLeaveMinutes > 0 && scheduledMinutes > 0 ? paidLeaveMinutes / scheduledMinutes : 0, modifierType, representation };
}

function minutesBetween(start?:string|null,end?:string|null,breakMinutes=0):number|null {
  if (!start || !end) return null;
  const value = clock(end) - clock(start) - breakMinutes;
  return value >= 0 ? value : null;
}

function clock(value:string):number {
  const match=/^(\d{2}):(\d{2})$/.exec(value);
  if(!match) throw new RangeError('Time must be HH:mm.');
  const hours=Number(match[1]),minutes=Number(match[2]);
  if(hours>23||minutes>59) throw new RangeError('Time must be valid.');
  return hours*60+minutes;
}
