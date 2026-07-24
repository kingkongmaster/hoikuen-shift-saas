import { ShiftType } from '@prisma/client';

export const shiftManagerRoles = ['ADMIN', 'DIRECTOR'] as const;
export const shiftTypes = Object.values(ShiftType);

export const shiftTypeDefaults: Partial<Record<ShiftType, { startTime: string; endTime: string }>> = {
  EARLY: { startTime: '07:00', endTime: '16:00' },
  NORMAL: { startTime: '08:30', endTime: '17:00' },
  LATE: { startTime: '11:00', endTime: '19:30' },
};

// AM_HALF / PM_HALF are leave markers when created from an approved request.
// They must never be treated as an assignable working shift.
export const workingShiftTypes = [ShiftType.EARLY, ShiftType.NORMAL, ShiftType.LATE, ShiftType.OTHER];
