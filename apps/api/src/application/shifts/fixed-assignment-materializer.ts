import { AssignedClass, ShiftRequestType, ShiftType } from '@prisma/client';
import type { GeneratedAssignment } from './rule-based-shift-generator';

export type FixedAssignmentStaff = {
  id: string;
  regularWorkStartTime: string | null;
  regularWorkEndTime: string | null;
};

export type FixedAssignmentRequest = {
  id: string;
  staffId: string;
  requestDate: Date;
  requestType: ShiftRequestType;
};

export type FixedAssignmentMaterializationOptions = {
  managerReviewCells?: Array<{staffId:string;date:string}>;
  staff: FixedAssignmentStaff[];
  requests: FixedAssignmentRequest[];
  start: Date;
  end: Date;
  closedDates: Date[];
  sundayOperationEnabled: boolean;
  defaultBreakMinutes: number;
};

const fullLeaveType = new Map<ShiftRequestType, ShiftType>([
  [ShiftRequestType.DAY_OFF, ShiftType.OFF],
  [ShiftRequestType.PAID_LEAVE, ShiftType.PAID_LEAVE],
  [ShiftRequestType.SUMMER_LEAVE, ShiftType.SUMMER_LEAVE],
]);

const iso = (date: Date) => date.toISOString().slice(0, 10);

function halfDayBoundary(start: string, end: string) {
  const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
  const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3));
  const value = Math.floor((startMinutes + endMinutes) / 2);
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export function materializeFixedAssignments(options: FixedAssignmentMaterializationOptions): GeneratedAssignment[] {
  const closed = new Set(options.closedDates.map(iso));
  const requestByStaffDate = new Map(options.requests.map((request) => [`${request.staffId}:${iso(request.requestDate)}`, request]));
  const assignments: GeneratedAssignment[] = [];

  for (const staff of options.staff) {
    if (!staff.regularWorkStartTime || !staff.regularWorkEndTime) throw new Error('Fixed assignment staff must have a complete regular work time.');
    for (let cursor = new Date(options.start); cursor < options.end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const workDate = new Date(cursor);
      const dateKey = iso(workDate);
      if(options.managerReviewCells?.some(c=>c.staffId===staff.id&&c.date===dateKey))continue;
      const request = requestByStaffDate.get(`${staff.id}:${dateKey}`);
      const isClosed = closed.has(dateKey) || (!options.sundayOperationEnabled && workDate.getUTCDay() === 0);
      const requestedLeave = request ? fullLeaveType.get(request.requestType) : undefined;

      if (isClosed || requestedLeave) {
        assignments.push({
          staffId: staff.id,
          workDate,
          shiftType: requestedLeave ?? ShiftType.OFF,
          workPatternId: null,
          startTime: null,
          endTime: null,
          breakMinutes: null,
          note: isClosed ? '休園日' : '承認済み休暇',
          assignedClass: null,
        });
        continue;
      }

      const assignment: GeneratedAssignment = {
        staffId: staff.id,
        workDate,
        shiftType: ShiftType.OTHER,
        workPatternId: null,
        startTime: staff.regularWorkStartTime,
        endTime: staff.regularWorkEndTime,
        breakMinutes: options.defaultBreakMinutes,
        note: '固定勤務',
        assignedClass: null,
        countsTowardStaffing: true,
      };
      if (request?.requestType === ShiftRequestType.HALF_DAY_AM || request?.requestType === ShiftRequestType.HALF_DAY_PM) {
        const boundary = halfDayBoundary(staff.regularWorkStartTime, staff.regularWorkEndTime);
        assignment.attendanceModifier = request.requestType === ShiftRequestType.HALF_DAY_PM
          ? { modifierType: 'PM_PAID_LEAVE', effectiveStartTime: boundary, effectiveEndTime: staff.regularWorkEndTime, sourceType: 'APPROVED_SHIFT_REQUEST' }
          : { modifierType: 'AM_PAID_LEAVE', effectiveStartTime: staff.regularWorkStartTime, effectiveEndTime: boundary, sourceType: 'APPROVED_SHIFT_REQUEST' };
        assignment.note = request.requestType === ShiftRequestType.HALF_DAY_PM ? '固定勤務 / 半P' : '固定勤務 / 半A';
      }
      assignments.push(assignment);
    }
  }
  return assignments;
}
