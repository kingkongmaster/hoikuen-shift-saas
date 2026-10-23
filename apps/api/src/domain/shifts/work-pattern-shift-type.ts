import { ShiftType } from '@prisma/client';

// Numbered/custom patterns share OTHER; identity is always the tenant's pattern ID.
export function workPatternShiftType(pattern: { code: string; isWorking: boolean }): ShiftType {
  if (Object.values(ShiftType).includes(pattern.code as ShiftType)) return pattern.code as ShiftType;
  return pattern.isWorking ? ShiftType.OTHER : ShiftType.OFF;
}
