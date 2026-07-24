import { AssignedClass, EmploymentType, ShiftRequestType, ShiftType } from '@prisma/client';
import { shiftTypeDefaults, workingShiftTypes } from '../../domain/shifts/monthly-shift';

export type GeneratorStaff = { id: string; employeeNumber: string; displayName: string; assignedClass: AssignedClass; employmentType: EmploymentType; isDirector?: boolean; canWorkEarly: boolean; canWorkRegular: boolean; canWorkLate: boolean; earlyShiftOnly: boolean; lateShiftOnly: boolean; canWorkSaturdays: boolean; monthlyWorkHourLimit: number | null; weeklyAvailableDays: number | null };
export type GeneratorRequest = { staffId: string; requestDate: Date; requestType: ShiftRequestType; reason: string | null };
export type GenerationWarning = { code: string; level: 'INFO' | 'WARNING' | 'ERROR'; workDate: string; staffId?: string; classType?: AssignedClass; required?: number; assigned?: number; message: string };
export type GeneratedAssignment = { staffId: string; workDate: Date; shiftType: ShiftType; startTime: string | null; endTime: string | null; breakMinutes: number | null; note: string | null; assignedClass: AssignedClass | null };
export type GeneratorOptions = { weekdayEarlyRequired: number; weekdayLateRequired: number; saturdayEarlyRequired: number; saturdayLateRequired: number; saturdayMinimumStaff?: number; saturdayOperationEnabled?: boolean; sundayOperationEnabled: boolean; directorCountsTowardStaffing?: boolean; directorClassPlacementMode?: 'NONE' | 'SHORTAGE_ONLY' | 'NORMAL'; maxConsecutiveWorkDays: number; maxConsecutiveEarlyDays: number; maxConsecutiveLateDays: number; defaultStartEarly: string; defaultEndEarly: string; defaultStartNormal: string; defaultEndNormal: string; defaultStartLate: string; defaultEndLate: string; defaultBreakMinutes: number; closedDates?: Array<{ closedDate: Date; name: string }>; classRequirements?: Array<{ classType: AssignedClass; weekdayRequired: number; saturdayRequired: number; isActive: boolean }> };

const defaultTargets: Partial<Record<AssignedClass, number>> = { AGE_0: 3, AGE_1: 2, AGE_2: 2, AGE_3: 2, AGE_4: 2, AGE_5: 2 };
const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

export function generateRuleBasedSchedule(targetMonth: Date, staffInput: GeneratorStaff[], requests: GeneratorRequest[], options: GeneratorOptions) {
  const staff = [...staffInput].sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber, 'ja'));
  const warnings: GenerationWarning[] = []; const assignments: GeneratedAssignment[] = [];
  const fixed = new Map(requests.map((request) => [`${request.staffId}:${iso(request.requestDate)}`, request]));
  const closed = new Map((options.closedDates ?? []).map((item) => [iso(item.closedDate), item.name]));
  const minutes = new Map<string, number>(); const days = new Map<string, number>(); const workCount = new Map<string, number>(); const saturdayCount = new Map<string, number>();
  const workStreak = new Map<string, number>(); const earlyStreak = new Map<string, number>(); const lateStreak = new Map<string, number>();
  const warned = new Set<string>();
  const add = (warning: GenerationWarning) => { const key = `${warning.code}:${warning.workDate}:${warning.staffId ?? ''}:${warning.classType ?? ''}`; if (!warned.has(key)) { warned.add(key); warnings.push(warning); } };
  const start = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), 1)); const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  for (let current = new Date(start); current < end; current.setUTCDate(current.getUTCDate() + 1)) {
    const workDate = new Date(current); const key = iso(workDate); const saturday = workDate.getUTCDay() === 6; const sunday = workDate.getUTCDay() === 0; const closedName = closed.get(key);
    const day = new Map<string, GeneratedAssignment>();
    for (const member of staff) { const request = fixed.get(`${member.id}:${key}`); day.set(member.id, request ? assignment(member.id, workDate, requestTypeToShiftType(request.requestType), options, '承認済み希望休') : assignment(member.id, workDate, ShiftType.OFF, options)); }
    if (closedName || (saturday && options.saturdayOperationEnabled === false) || (sunday && !options.sundayOperationEnabled)) {
      const saturdayClosed = saturday && options.saturdayOperationEnabled === false;
      add({ code: closedName ? 'CLOSED_DATE' : saturdayClosed ? 'SATURDAY_CLOSED' : 'SUNDAY_CLOSED', level: 'INFO', workDate: key, message: closedName ? `${key}は「${closedName}」のため全職員をOFFにしました。` : `${key}は${saturdayClosed ? '土曜' : '日曜'}休園設定のため全職員をOFFにしました。` });
    } else {
      const earlyRequired = saturday || sunday ? options.saturdayEarlyRequired : options.weekdayEarlyRequired;
      const lateRequired = saturday || sunday ? options.saturdayLateRequired : options.weekdayLateRequired;
      allocate(ShiftType.EARLY, earlyRequired); allocate(ShiftType.LATE, lateRequired);
      const targets = classTargets();
      const requiredWorking = targets.reduce((sum, requirement) => sum + (saturday || sunday ? requirement.saturdayRequired : requirement.weekdayRequired), 0);
      const alreadyWorking = [...day.values()].filter((item) => isWorking(item.shiftType)).length;
      const staffingBuffer = requiredWorking > 0 && !saturday && !sunday ? 2 : 0;
      const saturdayMinimumStaff = options.saturdayMinimumStaff ?? 3;
      const minimumWorking = saturday || sunday ? Math.max(requiredWorking, saturdayMinimumStaff) : requiredWorking + staffingBuffer;
      const normalNeeded = Math.max(0, minimumWorking - alreadyWorking);
      const normal = staff.filter((member) => day.get(member.id)?.shiftType === ShiftType.OFF && eligible(member, ShiftType.NORMAL));
      normal.sort(compare(ShiftType.NORMAL)); for (const member of normal.slice(0, normalNeeded)) day.set(member.id, assignment(member.id, workDate, ShiftType.NORMAL, options, null, member.isDirector ? null : member.assignedClass));
      const assignedWorking = [...day.values()].filter((item) => isWorking(item.shiftType)).length;
      if ((saturday || sunday) && assignedWorking < saturdayMinimumStaff) add({ code: 'SATURDAY_MINIMUM_SHORTAGE', level: 'ERROR', workDate: key, required: saturdayMinimumStaff, assigned: assignedWorking, message: `${key}（${weekdays[workDate.getUTCDay()]}）の最低勤務人数が${saturdayMinimumStaff - assignedWorking}人不足しています。` });
      assignClasses(targets);
    }
    for (const member of staff) {
      const item = day.get(member.id)!; assignments.push(item); const working = isWorking(item.shiftType);
      workStreak.set(member.id, working ? (workStreak.get(member.id) ?? 0) + 1 : 0); earlyStreak.set(member.id, item.shiftType === ShiftType.EARLY ? (earlyStreak.get(member.id) ?? 0) + 1 : 0); lateStreak.set(member.id, item.shiftType === ShiftType.LATE ? (lateStreak.get(member.id) ?? 0) + 1 : 0);
      if (working) { minutes.set(member.id, (minutes.get(member.id) ?? 0) + minutesFor(item)); days.set(`${member.id}:${weekKey(key)}`, (days.get(`${member.id}:${weekKey(key)}`) ?? 0) + 1); workCount.set(member.id, (workCount.get(member.id) ?? 0) + 1); if (saturday) saturdayCount.set(member.id, (saturdayCount.get(member.id) ?? 0) + 1); }
    }

    function eligible(member: GeneratorStaff, type: ShiftType) {
      if (saturday && !member.canWorkSaturdays) return false;
      if (type === ShiftType.EARLY && (!member.canWorkEarly || member.lateShiftOnly || (earlyStreak.get(member.id) ?? 0) >= options.maxConsecutiveEarlyDays)) return false;
      if (type === ShiftType.LATE && (!member.canWorkLate || member.earlyShiftOnly || (lateStreak.get(member.id) ?? 0) >= options.maxConsecutiveLateDays)) return false;
      if (type === ShiftType.NORMAL && (!member.canWorkRegular || member.earlyShiftOnly || member.lateShiftOnly)) return false;
      if ((workStreak.get(member.id) ?? 0) >= options.maxConsecutiveWorkDays) return false;
      const nextMinutes = (minutes.get(member.id) ?? 0) + minutesForType(type, options); const nextDays = (days.get(`${member.id}:${weekKey(key)}`) ?? 0) + 1;
      // These are hard constraints. Rejected candidates are normal solver decisions,
      // not warnings: only an assignment that actually violates a limit is actionable.
      if (member.monthlyWorkHourLimit && nextMinutes > member.monthlyWorkHourLimit * 60) return false;
      if (member.weeklyAvailableDays && nextDays > member.weeklyAvailableDays) return false;
      return true;
    }
    function compare(type: ShiftType) { return (a: GeneratorStaff, b: GeneratorStaff) => score(a, type) - score(b, type) || a.employeeNumber.localeCompare(b.employeeNumber, 'ja'); }
    function score(member: GeneratorStaff, type: ShiftType) { const dedicated = type === ShiftType.EARLY ? member.earlyShiftOnly : type === ShiftType.LATE ? member.lateShiftOnly : false; return (dedicated ? 0 : 1000) + (member.isDirector ? 250 : 0) + ((saturday || sunday) ? (saturdayCount.get(member.id) ?? 0) * 100 : 0) + (workCount.get(member.id) ?? 0); }
    function allocate(type: ShiftType, required: number) { let count = 0; for (const member of staff.filter((m) => day.get(m.id)?.shiftType === ShiftType.OFF && eligible(m, type)).sort(compare(type)).slice(0, required)) { day.set(member.id, assignment(member.id, workDate, type, options, null, member.isDirector ? null : member.assignedClass)); count += 1; } if (count < required) add({ code: type === ShiftType.EARLY ? 'EARLY_SHORTAGE' : 'LATE_SHORTAGE', level: 'ERROR', workDate: key, required, assigned: count, message: `${key}（${weekdays[workDate.getUTCDay()]}）の${type === ShiftType.EARLY ? '早出' : '遅出'}が${required - count}人不足しています。` }); if (saturday && count < required) add({ code: 'SATURDAY_SHORTAGE', level: 'WARNING', workDate: key, required, assigned: count, message: `${key}の土曜勤務可能職員が不足しています。` }); }
    function classTargets() {
      const requirements = (options.classRequirements ?? []).filter((r) => r.isActive && r.classType.startsWith('AGE_'));
      return requirements.length ? requirements : Object.entries(defaultTargets).map(([classType, weekdayRequired]) => ({ classType: classType as AssignedClass, weekdayRequired: weekdayRequired!, saturdayRequired: 0, isActive: true }));
    }
    function assignClasses(targets: ReturnType<typeof classTargets>) {
      const used = new Set<string>();
      for (const requirement of targets) {
        const target = saturday || sunday ? requirement.saturdayRequired : requirement.weekdayRequired; let count = 0;
        const regularCandidates = staff.filter((m) => !m.isDirector && isWorking(day.get(m.id)!.shiftType) && !used.has(m.id));
        const directors = staff.filter((m) => m.isDirector && isWorking(day.get(m.id)!.shiftType) && !used.has(m.id));
        const placement = options.directorClassPlacementMode ?? 'NONE';
        const allowDirector = options.directorCountsTowardStaffing && (placement === 'NORMAL' || (placement === 'SHORTAGE_ONLY' && regularCandidates.length < target));
        const candidates = [...regularCandidates, ...(allowDirector ? directors : [])].sort((a, b) => classPriority(a, requirement.classType) - classPriority(b, requirement.classType) || a.employeeNumber.localeCompare(b.employeeNumber, 'ja'));
        for (const member of candidates.slice(0, target)) { const item = day.get(member.id)!; item.assignedClass = requirement.classType; used.add(member.id); count += 1; if (member.assignedClass !== requirement.classType) add({ code: member.assignedClass === AssignedClass.FREE || member.assignedClass === AssignedClass.SUPPORT ? 'FREE_SUPPORT_COVERAGE' : 'CROSS_CLASS_SUPPORT', level: 'INFO', workDate: key, staffId: member.id, classType: requirement.classType, message: `${member.displayName}さんを${classLabel(requirement.classType)}へ補完配置しました。` }); }
        if (placement === 'SHORTAGE_ONLY' && count < target) {
          const helper = directors.find((member) => !used.has(member.id));
          if (helper) { day.get(helper.id)!.assignedClass = requirement.classType; used.add(helper.id); add({ code: 'DIRECTOR_HELP', level: 'INFO', workDate: key, staffId: helper.id, classType: requirement.classType, message: `${helper.displayName}さんを${classLabel(requirement.classType)}応援へ配置しました。` }); if (options.directorCountsTowardStaffing) count += 1; }
        }
        if (count < target) add({ code: 'CLASS_SHORTAGE', level: 'WARNING', workDate: key, classType: requirement.classType, required: target, assigned: count, message: `${key}の${classLabel(requirement.classType)}配置が${target - count}人不足しています。` });
      }
    }
  }
  return { assignments, warnings };
}

function classPriority(member: GeneratorStaff, target: AssignedClass) { if (member.assignedClass === target) return 0; if (member.assignedClass === AssignedClass.FREE) return 1; if (member.assignedClass === AssignedClass.SUPPORT) return 2; return 3; }
function assignment(staffId: string, workDate: Date, shiftType: ShiftType, options: GeneratorOptions, note: string | null = null, assignedClass: AssignedClass | null = null): GeneratedAssignment { const defaults = timesFor(shiftType, options); return { staffId, workDate: new Date(workDate), shiftType, startTime: defaults?.startTime ?? null, endTime: defaults?.endTime ?? null, breakMinutes: isWorking(shiftType) ? options.defaultBreakMinutes : null, note, assignedClass: isWorking(shiftType) ? assignedClass : null }; }
function timesFor(type: ShiftType, options: GeneratorOptions) { if (type === ShiftType.EARLY) return { startTime: options.defaultStartEarly, endTime: options.defaultEndEarly }; if (type === ShiftType.NORMAL) return { startTime: options.defaultStartNormal, endTime: options.defaultEndNormal }; if (type === ShiftType.LATE) return { startTime: options.defaultStartLate, endTime: options.defaultEndLate }; return shiftTypeDefaults[type]; }
function minutesFor(item: GeneratedAssignment) { if (!item.startTime || !item.endTime) return 0; const [sh, sm] = item.startTime.split(':').map(Number); const [eh, em] = item.endTime.split(':').map(Number); return Math.max(0, eh * 60 + em - sh * 60 - sm - (item.breakMinutes ?? 0)); }
function minutesForType(type: ShiftType, options: GeneratorOptions) { const times = timesFor(type, options); if (!times) return 0; const [sh, sm] = times.startTime.split(':').map(Number); const [eh, em] = times.endTime.split(':').map(Number); return Math.max(0, eh * 60 + em - sh * 60 - sm - options.defaultBreakMinutes); }
function isWorking(type: ShiftType) { return (workingShiftTypes as readonly ShiftType[]).includes(type); }
function requestTypeToShiftType(type: ShiftRequestType) { if (type === ShiftRequestType.PAID_LEAVE) return ShiftType.PAID_LEAVE; if (type === ShiftRequestType.SUMMER_LEAVE) return ShiftType.SUMMER_LEAVE; if (type === ShiftRequestType.HALF_DAY_AM) return ShiftType.AM_HALF; if (type === ShiftRequestType.HALF_DAY_PM) return ShiftType.PM_HALF; return ShiftType.OFF; }
function iso(value: Date) { return value.toISOString().slice(0, 10); }
function weekKey(value: string) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); return iso(date); }
function classLabel(value: AssignedClass) { return value.replace('AGE_', '') + (value.startsWith('AGE_') ? '歳児' : value); }
