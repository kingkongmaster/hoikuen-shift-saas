import { AssignedClass, EmploymentType, ShiftRequestType, ShiftType, StaffWorkRuleType } from '@prisma/client';
import { shiftTypeDefaults, workingShiftTypes } from '../../domain/shifts/monthly-shift';
import { evaluateStaffingRequirements, evaluationWarnings, staffingPriority, type GeneratorAttributeAssignment, type GeneratorStaffingRequirement } from './staffing-requirement-evaluator';
import { applicableRules, fixedRule, patternType, preferenceRank, prohibitionConflict, ruleEligibility, ruleLabel, type GeneratorWorkRule } from './staff-work-rule-evaluator';

export type GeneratorStaff = { id: string; employeeNumber: string; displayName: string; assignedClass: AssignedClass; employmentType: EmploymentType; isDirector?: boolean; canWorkEarly: boolean; canWorkRegular: boolean; canWorkLate: boolean; earlyShiftOnly: boolean; lateShiftOnly: boolean; canWorkSaturdays: boolean; monthlyWorkHourLimit: number | null; monthlyTargetWorkDays?: number | null; monthlyTargetWorkHours?: number | null; weeklyAvailableDays: number | null; regularWorkStartTime?: string | null; regularWorkEndTime?: string | null };
export type GeneratorRequest = { staffId: string; requestDate: Date; requestType: ShiftRequestType; reason: string | null };
export type GenerationWarning = { code: string; level: 'INFO' | 'WARNING' | 'ERROR'; workDate: string; staffId?: string; classType?: AssignedClass; required?: number; assigned?: number; message: string };
export type GeneratedAssignment = { staffId: string; workDate: Date; shiftType: ShiftType; workPatternId?: string | null; startTime: string | null; endTime: string | null; breakMinutes: number | null; note: string | null; assignedClass: AssignedClass | null };
export type SpecialShiftSummary = { staffId: string; employeeNumber: string; displayName: string; earlyCount: number; lateCount: number; totalSpecialShiftCount: number; saturdayCount: number; workCount: number; earlyCategory: 'DEDICATED' | 'GENERAL' | 'NOT_ELIGIBLE'; lateCategory: 'DEDICATED' | 'GENERAL' | 'NOT_ELIGIBLE' };
export type GeneratorOptions = { weekdayEarlyRequired: number; weekdayLateRequired: number; saturdayEarlyRequired: number; saturdayLateRequired: number; saturdayMinimumStaff?: number; saturdayOperationEnabled?: boolean; sundayOperationEnabled: boolean; directorCountsTowardStaffing?: boolean; directorClassPlacementMode?: 'NONE' | 'SHORTAGE_ONLY' | 'NORMAL'; maxConsecutiveWorkDays: number; maxConsecutiveEarlyDays: number; maxConsecutiveLateDays: number; defaultStartEarly: string; defaultEndEarly: string; defaultStartNormal: string; defaultEndNormal: string; defaultStartLate: string; defaultEndLate: string; defaultBreakMinutes: number; closedDates?: Array<{ closedDate: Date; name: string }>; classRequirements?: Array<{ classType: AssignedClass; weekdayRequired: number; saturdayRequired: number; isActive: boolean }>; staffingRequirements?: GeneratorStaffingRequirement[]; staffAttributeAssignments?: GeneratorAttributeAssignment[]; staffWorkRules?: GeneratorWorkRule[] };

const defaultTargets: Partial<Record<AssignedClass, number>> = { AGE_0: 3, AGE_1: 2, AGE_2: 2, AGE_3: 2, AGE_4: 2, AGE_5: 2 };
const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

export function generateRuleBasedSchedule(targetMonth: Date, staffInput: GeneratorStaff[], requests: GeneratorRequest[], options: GeneratorOptions) {
  const staff = [...staffInput].sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber, 'ja'));
  const warnings: GenerationWarning[] = []; const assignments: GeneratedAssignment[] = [];
  const fixed = new Map(requests.map((request) => [`${request.staffId}:${iso(request.requestDate)}`, request]));
  const closed = new Map((options.closedDates ?? []).map((item) => [iso(item.closedDate), item.name]));
  const minutes = new Map<string, number>(); const days = new Map<string, number>(); const workCount = new Map<string, number>(); const saturdayCount = new Map<string, number>();
  const earlyCountByStaff = new Map<string, number>(); const lateCountByStaff = new Map<string, number>();
  const workStreak = new Map<string, number>(); const earlyStreak = new Map<string, number>(); const lateStreak = new Map<string, number>();
  const warned = new Set<string>();
  const add = (warning: GenerationWarning) => { const key = `${warning.code}:${warning.workDate}:${warning.staffId ?? ''}:${warning.classType ?? ''}`; if (!warned.has(key)) { warned.add(key); warnings.push(warning); } };
  const start = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), 1)); const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  for (let current = new Date(start); current < end; current.setUTCDate(current.getUTCDate() + 1)) {
    const workDate = new Date(current); const key = iso(workDate); const saturday = workDate.getUTCDay() === 6; const sunday = workDate.getUTCDay() === 0; const closedName = closed.get(key);
    const day = new Map<string, GeneratedAssignment>();
    const fixedStaffIds = new Set<string>();
    for (const member of staff) { const request = fixed.get(`${member.id}:${key}`); day.set(member.id, request ? assignment(member, workDate, requestTypeToShiftType(request.requestType), options, '希望休を優先') : assignment(member, workDate, ShiftType.OFF, options)); }
    for (const member of staff) {
      const rule = fixedRule(options.staffWorkRules ?? [], member.id, workDate); if (!rule?.workPattern) continue;
      const request = fixed.get(`${member.id}:${key}`);
      if (closedName || (saturday && options.saturdayOperationEnabled === false) || (sunday && !options.sundayOperationEnabled) || request) {
        add({ code: 'STAFF_WORK_RULE_FIXED_BLOCKED', level: 'ERROR', workDate: key, staffId: member.id, message: `${member.displayName}さんの固定勤務は${closedName ? '休園日' : request ? '承認済み休暇' : '休園設定'}を優先したため割り当てませんでした。` }); continue;
      }
      if (!rule.workPattern.isActive) { add({ code: 'STAFF_WORK_RULE_FIXED_PATTERN_INACTIVE', level: 'ERROR', workDate: key, staffId: member.id, message: `${member.displayName}さんの固定勤務パターンが無効なため割り当てませんでした。` }); continue; }
      const type = patternType(rule); if (!type) continue;
      const times = rule.workPattern.startTime && rule.workPattern.endTime ? { startTime: rule.workPattern.startTime, endTime: rule.workPattern.endTime } : null;
      const conflict = prohibitionConflict(options.staffWorkRules ?? [], member.id, workDate, type, times);
      if (conflict) { add({ code: 'STAFF_WORK_RULE_FIXED_PROHIBITED', level: 'ERROR', workDate: key, staffId: member.id, message: `${member.displayName}さんの固定勤務は${ruleLabel(conflict)}と競合するため割り当てませんでした。` }); continue; }
      day.set(member.id, assignmentFromPattern(member, workDate, type, rule.workPattern, options, '個別勤務ルールによる固定勤務'));
      fixedStaffIds.add(member.id);
    }
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
      normal.sort(compare(ShiftType.NORMAL)); for (const member of normal.slice(0, normalNeeded)) day.set(member.id, assignment(member, workDate, ShiftType.NORMAL, options, null, member.isDirector ? null : member.assignedClass));
      const assignedWorking = [...day.values()].filter((item) => isWorking(item.shiftType)).length;
      if ((saturday || sunday) && assignedWorking < saturdayMinimumStaff) { addRequestConstraintWarning(); add({ code: 'SATURDAY_MINIMUM_SHORTAGE', level: 'ERROR', workDate: key, required: saturdayMinimumStaff, assigned: assignedWorking, message: `${key}（${weekdays[workDate.getUTCDay()]}）の最低勤務人数が${saturdayMinimumStaff - assignedWorking}人不足しています。` }); }
      assignClasses(targets);
    }
    for (const member of staff) {
      const item = day.get(member.id)!; assignments.push(item); const working = isWorking(item.shiftType);
      workStreak.set(member.id, working ? (workStreak.get(member.id) ?? 0) + 1 : 0); earlyStreak.set(member.id, item.shiftType === ShiftType.EARLY ? (earlyStreak.get(member.id) ?? 0) + 1 : 0); lateStreak.set(member.id, item.shiftType === ShiftType.LATE ? (lateStreak.get(member.id) ?? 0) + 1 : 0);
      if (working) { minutes.set(member.id, (minutes.get(member.id) ?? 0) + minutesFor(item)); days.set(`${member.id}:${weekKey(key)}`, (days.get(`${member.id}:${weekKey(key)}`) ?? 0) + 1); workCount.set(member.id, (workCount.get(member.id) ?? 0) + 1); if (saturday) saturdayCount.set(member.id, (saturdayCount.get(member.id) ?? 0) + 1); }
      if (item.shiftType === ShiftType.EARLY) earlyCountByStaff.set(member.id, (earlyCountByStaff.get(member.id) ?? 0) + 1);
      if (item.shiftType === ShiftType.LATE) lateCountByStaff.set(member.id, (lateCountByStaff.get(member.id) ?? 0) + 1);
    }

    function eligible(member: GeneratorStaff, type: ShiftType) {
      if (fixed.has(`${member.id}:${key}`)) return false;
      if (fixedStaffIds.has(member.id)) return false;
      if (saturday && !member.canWorkSaturdays) return false;
      if (type === ShiftType.EARLY && (!member.canWorkEarly || member.lateShiftOnly || (earlyStreak.get(member.id) ?? 0) >= options.maxConsecutiveEarlyDays)) return false;
      if (type === ShiftType.LATE && (!member.canWorkLate || member.earlyShiftOnly || (lateStreak.get(member.id) ?? 0) >= options.maxConsecutiveLateDays)) return false;
      if (type === ShiftType.NORMAL && (!member.canWorkRegular || member.earlyShiftOnly || member.lateShiftOnly)) return false;
      const workRule = ruleEligibility(options.staffWorkRules ?? [], member.id, workDate, type, timesForMember(type, options, member) ?? null); if (!workRule.eligible) return false;
      if ((workStreak.get(member.id) ?? 0) >= options.maxConsecutiveWorkDays) return false;
      const nextMinutes = (minutes.get(member.id) ?? 0) + minutesForType(type, options, member); const nextDays = (days.get(`${member.id}:${weekKey(key)}`) ?? 0) + 1;
      for (const rule of applicableRules(options.staffWorkRules ?? [], member.id, workDate)) {
        if (rule.numericValue == null) continue;
        if (rule.ruleType === StaffWorkRuleType.MAX_CONSECUTIVE_WORK_DAYS && (workStreak.get(member.id) ?? 0) >= rule.numericValue) return false;
        if (rule.ruleType === StaffWorkRuleType.MAX_WORK_DAYS_PER_WEEK && nextDays > rule.numericValue) return false;
        const scoped = assignments.filter((item) => item.staffId === member.id && isWorking(item.shiftType) && applicableRules([rule], member.id, item.workDate).length > 0);
        if (rule.ruleType === StaffWorkRuleType.MAX_WORK_DAYS_PER_MONTH && scoped.length + 1 > rule.numericValue) return false;
        if (rule.ruleType === StaffWorkRuleType.MAX_WORK_MINUTES_PER_MONTH && scoped.reduce((sum, item) => sum + minutesFor(item), 0) + minutesForType(type, options, member) > rule.numericValue) return false;
      }
      // These are hard constraints. Rejected candidates are normal solver decisions,
      // not warnings: only an assignment that actually violates a limit is actionable.
      if (member.monthlyWorkHourLimit && nextMinutes > member.monthlyWorkHourLimit * 60) return false;
      if (member.weeklyAvailableDays && nextDays > member.weeklyAvailableDays) return false;
      return true;
    }
    function compare(type: ShiftType) {
      return (a: GeneratorStaff, b: GeneratorStaff) => {
        let softDifference = 0;
        if (options.staffingRequirements?.length) {
          const assigned = [...day.values()].filter((item) => isWorking(item.shiftType));
          const priority = (member: GeneratorStaff) => {
            const garden = staffingPriority(options.staffingRequirements!, options.staffAttributeAssignments ?? [], workDate, member.id, null, assigned);
            const classroom = isFixedClass(member.assignedClass) ? staffingPriority(options.staffingRequirements!, options.staffAttributeAssignments ?? [], workDate, member.id, member.assignedClass, assigned) : { hard: 0, soft: 0 };
            return { hard: garden.hard + classroom.hard, soft: garden.soft + classroom.soft };
          };
          const ap = priority(a); const bp = priority(b);
          if (ap.hard !== bp.hard) return bp.hard - ap.hard;
          softDifference = bp.soft - ap.soft;
        }
        const preferred = preferenceRank(options.staffWorkRules ?? [], a.id, workDate, type) - preferenceRank(options.staffWorkRules ?? [], b.id, workDate, type);
        if (preferred) return preferred;
        const transitionBurden = specialShiftBurden(a, type) - specialShiftBurden(b, type);
        if (transitionBurden) return transitionBurden;
        const dedicated = dedicatedRank(a, type) - dedicatedRank(b, type);
        if (dedicated) return dedicated;
        const specialCount = countFor(a, type) - countFor(b, type);
        if (specialCount) return specialCount;
        if (softDifference) return softDifference;
        // Monthly targets guide NORMAL assignments only. Special shifts keep their
        // type-specific fairness ahead of every soft target consideration.
        if (type === ShiftType.NORMAL) {
          // Prefer staff who cannot cover special shifts, then staff who have already
          // received more of their eligible special shifts. This preserves future
          // weekly capacity for under-allocated early/late candidates.
          const specialReserve = normalSpecialReserveRank(a) - normalSpecialReserveRank(b);
          if (specialReserve) return specialReserve;
          const placement = placementNeed(b) - placementNeed(a);
          if (placement) return placement;
          const targetDeficit = normalizedTargetDeficit(b) - normalizedTargetDeficit(a);
          if (targetDeficit) return targetDeficit;
        }
        const totalWork = (workCount.get(a.id) ?? 0) - (workCount.get(b.id) ?? 0);
        if (totalWork) return totalWork;
        const saturdays = (saturdayCount.get(a.id) ?? 0) - (saturdayCount.get(b.id) ?? 0);
        if (saturdays) return saturdays;
        return a.employeeNumber.localeCompare(b.employeeNumber, 'ja');
      };
    }
    function dedicatedRank(member: GeneratorStaff, type: ShiftType) { return type === ShiftType.EARLY ? (member.earlyShiftOnly ? 0 : 1) : type === ShiftType.LATE ? (member.lateShiftOnly ? 0 : 1) : 0; }
    function specialShiftBurden(member: GeneratorStaff, type: ShiftType) {
      if (type !== ShiftType.EARLY && type !== ShiftType.LATE) return 0;
      if ((type === ShiftType.EARLY && member.earlyShiftOnly) || (type === ShiftType.LATE && member.lateShiftOnly)) return 0;
      if (preferenceRank(options.staffWorkRules ?? [], member.id, workDate, type) !== Number.MAX_SAFE_INTEGER) return 0;
      const previousDate = new Date(workDate); previousDate.setUTCDate(previousDate.getUTCDate() - 1);
      const previous = assignments.find((item) => item.staffId === member.id && iso(item.workDate) === iso(previousDate))?.shiftType;
      if (type === ShiftType.EARLY && previous === ShiftType.LATE) return 2;
      if (type === ShiftType.LATE && previous === ShiftType.EARLY) return 1;
      return previous === type ? 1 : 0;
    }
    function countFor(member: GeneratorStaff, type: ShiftType) { return type === ShiftType.EARLY ? (earlyCountByStaff.get(member.id) ?? 0) : type === ShiftType.LATE ? (lateCountByStaff.get(member.id) ?? 0) : 0; }
    function normalSpecialReserveRank(member: GeneratorStaff) { const counts: number[] = []; if (member.canWorkEarly && !member.lateShiftOnly) counts.push(earlyCountByStaff.get(member.id) ?? 0); if (member.canWorkLate && !member.earlyShiftOnly) counts.push(lateCountByStaff.get(member.id) ?? 0); return counts.length ? -counts.reduce((sum, value) => sum + value, 0) / counts.length : -1000; }
    function placementNeed(member: GeneratorStaff) { if (!isFixedClass(member.assignedClass)) return 0; const requirement = classTargets().find((item) => item.classType === member.assignedClass); if (!requirement) return 0; const target = saturday || sunday ? requirement.saturdayRequired : requirement.weekdayRequired; const assigned = staff.filter((item) => item.assignedClass === member.assignedClass && isWorking(day.get(item.id)!.shiftType)).length; return Math.max(0, target - assigned); }
    function normalizedTargetDeficit(member: GeneratorStaff) { const ratios: number[] = []; if (member.monthlyTargetWorkDays) ratios.push(Math.max(0, member.monthlyTargetWorkDays - (workCount.get(member.id) ?? 0)) / member.monthlyTargetWorkDays); if (member.monthlyTargetWorkHours) { const targetMinutes = member.monthlyTargetWorkHours * 60; ratios.push(Math.max(0, targetMinutes - (minutes.get(member.id) ?? 0)) / targetMinutes); } return ratios.length ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : 0; }
    function allocate(type: ShiftType, required: number) {
      const existing = staff.filter((member) => day.get(member.id)?.shiftType === type); let count = existing.length; const usedFixedClasses = new Set(existing.map((member) => member.assignedClass).filter(isFixedClass)); let rejectedByClass = false;
      for (const member of staff.filter((m) => day.get(m.id)?.shiftType === ShiftType.OFF && eligible(m, type)).sort(compare(type))) {
        if (count >= required) break;
        if (isFixedClass(member.assignedClass) && usedFixedClasses.has(member.assignedClass)) { rejectedByClass = true; continue; }
        day.set(member.id, assignment(member, workDate, type, options, null, member.isDirector ? null : member.assignedClass));
        if (isFixedClass(member.assignedClass)) usedFixedClasses.add(member.assignedClass);
        count += 1;
      }
      if (count < required) {
        addRequestConstraintWarning();
        if (rejectedByClass) add({ code: type === ShiftType.EARLY ? 'EARLY_CLASS_DUPLICATE_SHORTAGE' : 'LATE_CLASS_DUPLICATE_SHORTAGE', level: 'ERROR', workDate: key, required, assigned: count, message: `${key}：同じ担当クラスの職員を同じ${type === ShiftType.EARLY ? '早出' : '遅出'}に配置できないため、必要人数を満たせません。` });
        add({ code: type === ShiftType.EARLY ? 'EARLY_SHORTAGE' : 'LATE_SHORTAGE', level: 'ERROR', workDate: key, required, assigned: count, message: `${key}（${weekdays[workDate.getUTCDay()]}）の${type === ShiftType.EARLY ? '早出' : '遅出'}が${required - count}人不足しています。` });
      }
      if (saturday && count < required) add({ code: 'SATURDAY_SHORTAGE', level: 'WARNING', workDate: key, required, assigned: count, message: `${key}の土曜勤務可能職員が不足しています。` });
    }
    function addRequestConstraintWarning() {
      if (!staff.some((member) => fixed.has(`${member.id}:${key}`))) return;
      add({ code: 'REQUEST_CONSTRAINT_UNRESOLVED', level: 'WARNING', workDate: key, message: '希望休の条件により、この日は自動生成では解決できません。管理者による確認をお願いします。' });
    }
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
        const candidates = [...regularCandidates, ...(allowDirector ? directors : [])].sort((a, b) => {
          const existingClassPriority = classPriority(a, requirement.classType) - classPriority(b, requirement.classType);
          if (existingClassPriority) return existingClassPriority;
          if (options.staffingRequirements?.length) {
            const assigned = [...day.values()].filter((item) => isWorking(item.shiftType) && used.has(item.staffId));
            const ap = staffingPriority(options.staffingRequirements, options.staffAttributeAssignments ?? [], workDate, a.id, requirement.classType, assigned);
            const bp = staffingPriority(options.staffingRequirements, options.staffAttributeAssignments ?? [], workDate, b.id, requirement.classType, assigned);
            if (ap.hard !== bp.hard) return bp.hard - ap.hard;
            if (ap.soft !== bp.soft) return bp.soft - ap.soft;
          }
          return a.employeeNumber.localeCompare(b.employeeNumber, 'ja');
        });
        for (const member of candidates.slice(0, target)) { const item = day.get(member.id)!; item.assignedClass = requirement.classType; used.add(member.id); count += 1; if (member.assignedClass !== requirement.classType) add({ code: member.assignedClass === AssignedClass.FREE || member.assignedClass === AssignedClass.SUPPORT ? 'FREE_SUPPORT_COVERAGE' : 'CROSS_CLASS_SUPPORT', level: 'INFO', workDate: key, staffId: member.id, classType: requirement.classType, message: `${member.displayName}さんを${classLabel(requirement.classType)}へ補完配置しました。` }); }
        if (placement === 'SHORTAGE_ONLY' && count < target) {
          const helper = directors.find((member) => !used.has(member.id));
          if (helper) { day.get(helper.id)!.assignedClass = requirement.classType; used.add(helper.id); add({ code: 'DIRECTOR_HELP', level: 'INFO', workDate: key, staffId: helper.id, classType: requirement.classType, message: `${helper.displayName}さんを${classLabel(requirement.classType)}応援へ配置しました。` }); if (options.directorCountsTowardStaffing) count += 1; }
        }
        if (count < target) { addRequestConstraintWarning(); add({ code: 'CLASS_SHORTAGE', level: 'WARNING', workDate: key, classType: requirement.classType, required: target, assigned: count, message: `${key}の${classLabel(requirement.classType)}配置が${target - count}人不足しています。` }); }
      }
    }
  }
  const specialShiftSummary: SpecialShiftSummary[] = staff.map((member) => {
    const earlyCount = earlyCountByStaff.get(member.id) ?? 0; const lateCount = lateCountByStaff.get(member.id) ?? 0;
    return { staffId: member.id, employeeNumber: member.employeeNumber, displayName: member.displayName, earlyCount, lateCount, totalSpecialShiftCount: earlyCount + lateCount, saturdayCount: saturdayCount.get(member.id) ?? 0, workCount: workCount.get(member.id) ?? 0, earlyCategory: !member.canWorkEarly || member.lateShiftOnly ? 'NOT_ELIGIBLE' : member.earlyShiftOnly ? 'DEDICATED' : 'GENERAL', lateCategory: !member.canWorkLate || member.earlyShiftOnly ? 'NOT_ELIGIBLE' : member.lateShiftOnly ? 'DEDICATED' : 'GENERAL' };
  });
  for (const member of staff) {
    const actualDays = workCount.get(member.id) ?? 0; const actualHours = (minutes.get(member.id) ?? 0) / 60;
    if (member.monthlyTargetWorkDays && actualDays !== member.monthlyTargetWorkDays) add({ code: actualDays < member.monthlyTargetWorkDays ? 'TARGET_WORK_DAYS_SHORTAGE' : 'TARGET_WORK_DAYS_EXCESS', level: actualDays < member.monthlyTargetWorkDays ? 'WARNING' : 'INFO', workDate: iso(new Date(end.getTime() - 86400000)), staffId: member.id, message: `${member.displayName}さんの月間勤務日数は目標${member.monthlyTargetWorkDays}日に対して${actualDays}日です。` });
    if (member.monthlyTargetWorkHours && Math.abs(actualHours - member.monthlyTargetWorkHours) > 0.01) add({ code: actualHours < member.monthlyTargetWorkHours ? 'TARGET_WORK_HOURS_SHORTAGE' : 'TARGET_WORK_HOURS_EXCESS', level: actualHours < member.monthlyTargetWorkHours ? 'WARNING' : 'INFO', workDate: iso(new Date(end.getTime() - 86400000)), staffId: member.id, message: `${member.displayName}さんの月間勤務時間は目標${member.monthlyTargetWorkHours}時間に対して${Number(actualHours.toFixed(2))}時間です。` });
  }
  for (const rule of (options.staffWorkRules ?? []).filter((item) => item.isHardConstraint || item.ruleType === StaffWorkRuleType.MIN_WORK_DAYS_PER_MONTH || item.ruleType === StaffWorkRuleType.MIN_WORK_MINUTES_PER_MONTH)) {
    if (rule.numericValue == null || (rule.ruleType !== StaffWorkRuleType.MIN_WORK_DAYS_PER_MONTH && rule.ruleType !== StaffWorkRuleType.MIN_WORK_MINUTES_PER_MONTH)) continue;
    const scoped = assignments.filter((item) => item.staffId === rule.staffId && isWorking(item.shiftType) && applicableRules([rule], rule.staffId, item.workDate).length > 0);
    const actual = rule.ruleType === StaffWorkRuleType.MIN_WORK_DAYS_PER_MONTH ? scoped.length : scoped.reduce((sum, item) => sum + minutesFor(item), 0);
    if (actual < rule.numericValue) add({ code: rule.ruleType === StaffWorkRuleType.MIN_WORK_DAYS_PER_MONTH ? 'STAFF_WORK_RULE_MIN_DAYS_UNMET' : 'STAFF_WORK_RULE_MIN_MINUTES_UNMET', level: rule.isHardConstraint ? 'ERROR' : 'WARNING', workDate: iso(new Date(end.getTime() - 86400000)), staffId: rule.staffId, required: rule.numericValue, assigned: actual, message: `個別勤務ルールの最低${rule.ruleType === StaffWorkRuleType.MIN_WORK_DAYS_PER_MONTH ? '勤務日数' : '勤務時間（分）'}を満たしていません（必要${rule.numericValue}、実績${actual}）。` });
  }
  if (!options.staffingRequirements?.length) return { assignments, warnings, specialShiftSummary };
  const staffingRequirementEvaluations = evaluateStaffingRequirements(options.staffingRequirements, options.staffAttributeAssignments ?? [], assignments.filter((item) => isWorking(item.shiftType)));
  warnings.push(...evaluationWarnings(staffingRequirementEvaluations));
  return { assignments, warnings, specialShiftSummary, staffingRequirementEvaluations };
}

function classPriority(member: GeneratorStaff, target: AssignedClass) { if (member.assignedClass === target) return 0; if (member.assignedClass === AssignedClass.FREE) return 1; if (member.assignedClass === AssignedClass.SUPPORT) return 2; return 3; }
function isFixedClass(value: AssignedClass) { return value.startsWith('AGE_'); }
function assignment(member: GeneratorStaff, workDate: Date, shiftType: ShiftType, options: GeneratorOptions, note: string | null = null, assignedClass: AssignedClass | null = null): GeneratedAssignment { const defaults = timesForMember(shiftType, options, member); return { staffId: member.id, workDate: new Date(workDate), shiftType, startTime: defaults?.startTime ?? null, endTime: defaults?.endTime ?? null, breakMinutes: isWorking(shiftType) ? options.defaultBreakMinutes : null, note, assignedClass: isWorking(shiftType) ? assignedClass : null }; }
function assignmentFromPattern(member:GeneratorStaff,workDate:Date,shiftType:ShiftType,pattern:{id:string;startTime:string|null;endTime:string|null;breakMinutes:number;isWorking:boolean},options:GeneratorOptions,note:string):GeneratedAssignment{return{staffId:member.id,workDate:new Date(workDate),shiftType,workPatternId:pattern.id,startTime:pattern.startTime,endTime:pattern.endTime,breakMinutes:pattern.isWorking?pattern.breakMinutes:null,note,assignedClass:pattern.isWorking&&!member.isDirector?member.assignedClass:null};}
function timesFor(type: ShiftType, options: GeneratorOptions) { if (type === ShiftType.EARLY) return { startTime: options.defaultStartEarly, endTime: options.defaultEndEarly }; if (type === ShiftType.NORMAL) return { startTime: options.defaultStartNormal, endTime: options.defaultEndNormal }; if (type === ShiftType.LATE) return { startTime: options.defaultStartLate, endTime: options.defaultEndLate }; return shiftTypeDefaults[type]; }
function timesForMember(type: ShiftType, options: GeneratorOptions, member: GeneratorStaff) { if (type === ShiftType.NORMAL && member.regularWorkStartTime && member.regularWorkEndTime) return { startTime: member.regularWorkStartTime, endTime: member.regularWorkEndTime }; return timesFor(type, options); }
function minutesFor(item: GeneratedAssignment) { if (!item.startTime || !item.endTime) return 0; const [sh, sm] = item.startTime.split(':').map(Number); const [eh, em] = item.endTime.split(':').map(Number); return Math.max(0, eh * 60 + em - sh * 60 - sm - (item.breakMinutes ?? 0)); }
function minutesForType(type: ShiftType, options: GeneratorOptions, member: GeneratorStaff) { const times = timesForMember(type, options, member); if (!times) return 0; const [sh, sm] = times.startTime.split(':').map(Number); const [eh, em] = times.endTime.split(':').map(Number); return Math.max(0, eh * 60 + em - sh * 60 - sm - options.defaultBreakMinutes); }
function isWorking(type: ShiftType) { return (workingShiftTypes as readonly ShiftType[]).includes(type); }
function requestTypeToShiftType(type: ShiftRequestType) { if (type === ShiftRequestType.PAID_LEAVE) return ShiftType.PAID_LEAVE; if (type === ShiftRequestType.SUMMER_LEAVE) return ShiftType.SUMMER_LEAVE; if (type === ShiftRequestType.HALF_DAY_AM) return ShiftType.AM_HALF; if (type === ShiftRequestType.HALF_DAY_PM) return ShiftType.PM_HALF; return ShiftType.OFF; }
function iso(value: Date) { return value.toISOString().slice(0, 10); }
function weekKey(value: string) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); return iso(date); }
function classLabel(value: AssignedClass) { return value.replace('AGE_', '') + (value.startsWith('AGE_') ? '歳児' : value); }
