import { hardDeficits, repairSameWeek, replayKey, replayValue, type ReplayChoices, type ReassignmentTrace } from './same-week-reassignment';
import { provisionalSoftRank, type ProvisionalSoftRule } from './provisional-soft-rules';
import { AssignedClass, EmploymentType, ShiftRequestType, ShiftType, StaffWorkRuleType } from '@prisma/client';
import { shiftTypeDefaults, workingShiftTypes } from '../../domain/shifts/monthly-shift';
import { evaluateStaffingRequirements, evaluationWarnings, staffingPriority, type GeneratorAttributeAssignment, type GeneratorConditionalStaffingRequirement, type GeneratorStaffingRequirement, type GeneratorWorkPattern } from './staffing-requirement-evaluator';
import { applicableRules, fixedRule, patternType, preferenceRank, prohibitionConflict, ruleEligibility, ruleLabel, type GeneratorWorkRule } from './staff-work-rule-evaluator';
import { futureHardReservationPlan, type FutureCandidateCapacity, type FutureHardReservation, type FutureHardSlot } from './future-hard-capacity-evaluator';
import { activeRequirements, hasAttribute } from './staffing-requirement-evaluator';
import { assignmentTimeBreakdown } from '../attendance/assignment-time-breakdown';

export type GeneratorAnnualFairness = { annualTargetMinutes: number; confirmedFairnessMinutes: number; prescribedMinutesByDate?: Record<string, number> };
export type GeneratorStaff = { id: string; employeeNumber: string; displayName: string; assignedClass: AssignedClass; employmentType: EmploymentType; isDirector?: boolean; canWorkEarly: boolean; canWorkRegular: boolean; canWorkLate: boolean; earlyShiftOnly: boolean; lateShiftOnly: boolean; canWorkSaturdays: boolean; monthlyWorkHourLimit: number | null; monthlyTargetWorkDays?: number | null; monthlyTargetWorkHours?: number | null; weeklyAvailableDays: number | null; regularWorkStartTime?: string | null; regularWorkEndTime?: string | null; annualFairness?: GeneratorAnnualFairness };
export type GeneratorRequest = { staffId: string; requestDate: Date; requestType: ShiftRequestType; reason: string | null };
export type GenerationWarning = { code: string; level: 'INFO' | 'WARNING' | 'ERROR'; workDate: string; staffId?: string; classType?: AssignedClass; required?: number; assigned?: number; message: string; details?: Record<string, unknown> };
export type GeneratedAttendanceModifier = { modifierType: 'AM_PAID_LEAVE' | 'PM_PAID_LEAVE'; effectiveStartTime: string | null; effectiveEndTime: string | null; sourceType: 'APPROVED_SHIFT_REQUEST' };
export type GeneratedAssignment = { staffId: string; workDate: Date; shiftType: ShiftType; workPatternId?: string | null; startTime: string | null; endTime: string | null; breakMinutes: number | null; note: string | null; assignedClass: AssignedClass | null; countsTowardStaffing?: boolean; attendanceModifier?: GeneratedAttendanceModifier };
export type SpecialShiftSummary = { staffId: string; employeeNumber: string; displayName: string; earlyCount: number; lateCount: number; totalSpecialShiftCount: number; saturdayCount: number; workCount: number; earlyCategory: 'DEDICATED' | 'GENERAL' | 'NOT_ELIGIBLE'; lateCategory: 'DEDICATED' | 'GENERAL' | 'NOT_ELIGIBLE' };
export type GeneratorWeeklyPatternGroup = { groupCode: string; maxPerWeek: number; shiftTypes?: ShiftType[]; workPatternIds?: string[] };
export type GeneratorPatternTransitionBlock = { fromWorkPatternIds: string[]; toWorkPatternIds: string[] };
export type GeneratorMeetingDayRule = { dayOfWeek: number; occurrence: number; minimumEndTime: string };
export type WeeklyPatternRelaxation = { enabled: boolean; maxPerWeek: number; explanationLevel?: 'INFO' | 'WARNING'; historyYears?: number; recentWindowDays?: number; formalStatus?: 'FORMAL' | 'PROVISIONAL_VALIDATION' };
export type ApprovedWeeklyThirdAssignmentException = { date: string; maxPerWeek: 3; maxAssignments: number; sourceType: 'ADMIN_CONFIRMED'; sourceReference: string; confirmedAt: string; reason: string };
export type ApprovedHardRuleOverride = { date: string; staffId: string; workPatternId: string; sourceType: 'ADMIN_CONFIRMED'; sourceReference: string; confirmedAt: string; reason: string };
export type GeneratorFairnessWindows = { recentStart: Date; fiscalStart: Date; longTermStart: Date };
export type WeeklyPatternRelaxationRecord = { staffId: string; employeeNumber: string; workDate: string; weekStart: string; workPatternId: string; workPatternCode: string; previousWeeklyCount: number; resultingWeeklyCount: number; monthlyGroupCountBefore: number; annualGroupCountBefore: number; monthlyRelaxedWeekCountBefore: number; annualRelaxedWeekCountBefore: number; recentGroupCountBefore: number; recentRelaxedWeekCountBefore: number; longTermGroupCountBefore: number; longTermRelaxedWeekCountBefore: number; longTermOpportunityWeekCountBefore: number; longTermGroupRateBefore: number | null; longTermRelaxedWeekRateBefore: number | null; historyWindowStart: string; requirementCode: string };
export type GeneratorOptions = { sameWeekReassignment?: boolean; provisionalSoftRules?: ProvisionalSoftRule[]; weekdayEarlyRequired: number; weekdayLateRequired: number; saturdayEarlyRequired: number; saturdayLateRequired: number; saturdayMinimumStaff?: number; saturdayOperationEnabled?: boolean; sundayOperationEnabled: boolean; directorCountsTowardStaffing?: boolean; directorClassPlacementMode?: 'NONE' | 'SHORTAGE_ONLY' | 'NORMAL'; maxConsecutiveWorkDays: number; maxConsecutiveEarlyDays: number; maxConsecutiveLateDays: number; defaultStartEarly: string; defaultEndEarly: string; defaultStartNormal: string; defaultEndNormal: string; defaultStartLate: string; defaultEndLate: string; defaultBreakMinutes: number; closedDates?: Array<{ closedDate: Date; name: string }>; classRequirements?: Array<{ classType: AssignedClass; weekdayRequired: number; saturdayRequired: number; isActive: boolean }>; staffingRequirements?: GeneratorStaffingRequirement[]; conditionalStaffingRequirements?: GeneratorConditionalStaffingRequirement[]; staffAttributeAssignments?: GeneratorAttributeAssignment[]; staffWorkRules?: GeneratorWorkRule[]; priorAssignments?: Array<{ staffId: string; workDate: Date; shiftType: ShiftType; workPatternId?: string | null }>; weeklyPatternGroups?: GeneratorWeeklyPatternGroup[]; weeklyPatternGroupExemptStaffIds?: string[]; fixedWorkPatternOverridesWeeklyLimit?: boolean; weeklyPatternRelaxation?: WeeklyPatternRelaxation; approvedWeeklyThirdAssignmentExceptions?: ApprovedWeeklyThirdAssignmentException[]; approvedHardRuleOverrides?: ApprovedHardRuleOverride[]; fairnessWindows?: GeneratorFairnessWindows; patternTransitionBlocks?: GeneratorPatternTransitionBlock[]; systemWorkPatternIds?: Partial<Record<ShiftType, string>>; replaceLegacyShiftTargetsWhenPatternRequirementsActive?: boolean; fillOpenUnassignedWithNormal?: boolean; meetingDayRules?: GeneratorMeetingDayRule[]; futureHardCapacityReservation?: boolean; annualFairnessSoft?: boolean };

const defaultTargets: Partial<Record<AssignedClass, number>> = { AGE_0: 3, AGE_1: 2, AGE_2: 2, AGE_3: 2, AGE_4: 2, AGE_5: 2 };
const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

export function generateRuleBasedSchedule(targetMonth: Date, staffInput: GeneratorStaff[], requests: GeneratorRequest[], options: GeneratorOptions) {
  let trace: ReassignmentTrace = new Map();
  let selectedOptions = options;
  let selected = generateCandidateSchedule(targetMonth, staffInput, requests, options, undefined, trace);
  if (options.provisionalSoftRules?.length && selected.warnings.some(row => row.level === 'ERROR')) {
    const baselineTrace: ReassignmentTrace = new Map();
    const baselineOptions = { ...options, provisionalSoftRules: [] };
    const baseline = generateCandidateSchedule(targetMonth, staffInput, requests, baselineOptions, undefined, baselineTrace);
    const baselineDeficits = hardDeficits(baseline);
    if ([...hardDeficits(selected)].some(([key, value]) => value > (baselineDeficits.get(key) ?? 0))) {
      baseline.warnings.push({ code: 'PROVISIONAL_SOFT_DEFERRED_FOR_HARD', level: 'INFO', workDate: iso(targetMonth), message: '必須条件・必要人数を優先するため、今回の生成では暫定SOFT優先を見送りました。' });
      selected = baseline; selectedOptions = baselineOptions; trace = baselineTrace;
    }
  }
  return repairSameWeek(selected, staffInput, selectedOptions, trace,
    (choices, nextTrace) => generateCandidateSchedule(targetMonth, staffInput, requests, selectedOptions, choices, nextTrace),
    new Set(requests.map(row => replayKey(row.staffId, row.requestDate))));
}

function generateCandidateSchedule(targetMonth: Date, staffInput: GeneratorStaff[], requests: GeneratorRequest[], options: GeneratorOptions, replayChoices?: ReplayChoices, trace?: ReassignmentTrace) {
  const staff = [...staffInput].sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber, 'ja'));
  const warnings: GenerationWarning[] = []; const assignments: GeneratedAssignment[] = [];
  const fixed = new Map(requests.map((request) => [`${request.staffId}:${iso(request.requestDate)}`, request]));
  const closed = new Map((options.closedDates ?? []).map((item) => [iso(item.closedDate), item.name]));
  const minutes = new Map<string, number>(); const days = new Map<string, number>(); const workCount = new Map<string, number>(); const saturdayCount = new Map<string, number>();
  const earlyCountByStaff = new Map<string, number>(); const lateCountByStaff = new Map<string, number>();
  const generatedFairnessMinutes = new Map<string, number>(); const generatedFairnessUnavailable = new Set<string>();
  const workStreak = new Map<string, number>(); const earlyStreak = new Map<string, number>(); const lateStreak = new Map<string, number>();
  const warned = new Set<string>();
  const weeklyPatternRelaxations: WeeklyPatternRelaxationRecord[] = [];
  const approvedWeeklyThirdAssignments: Array<WeeklyPatternRelaxationRecord & { sourceType: 'ADMIN_CONFIRMED'; sourceReference: string; confirmedAt: string; reason: string }> = [];
  const futureHardCapacitySummary = { evaluations: 0, cacheHits: 0, planBuilds: 0, maxFlowCalls: 0, incrementalUpdates: 0, maxFlowCallsByDate: {} as Record<string, number> };
  const add = (warning: GenerationWarning) => { const requirementDetail = warning.code === 'WORK_PATTERN_REQUIREMENT_SHORTAGE' ? warning.message : ''; const key = `${warning.code}:${warning.workDate}:${warning.staffId ?? ''}:${warning.classType ?? ''}:${requirementDetail}`; if (!warned.has(key)) { warned.add(key); warnings.push(warning); } };
  const start = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), 1)); const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  for (let current = new Date(start); current < end; current.setUTCDate(current.getUTCDate() + 1)) {
    const workDate = new Date(current); const key = iso(workDate); const saturday = workDate.getUTCDay() === 6; const sunday = workDate.getUTCDay() === 0; const closedName = closed.get(key);
    const day = new Map<string, GeneratedAssignment>();
    const fixedStaffIds = new Set<string>();
    const futureCapacityCache = new Map<string, number>();
    let futurePlan: { slots: FutureHardSlot[]; capacities: FutureCandidateCapacity[]; futureDates: Date[]; reservations: FutureHardReservation[] } | null = null;
    for (const member of staff) { const request = fixed.get(`${member.id}:${key}`); day.set(member.id, request && !isHalfDayRequest(request.requestType) ? assignment(member, workDate, requestTypeToShiftType(request.requestType), options, '希望休を優先') : assignment(member, workDate, ShiftType.OFF, options)); }
    for (const member of staff) {
      const rule = fixedRule(options.staffWorkRules ?? [], member.id, workDate); if (!rule?.workPattern) continue;
      const request = fixed.get(`${member.id}:${key}`);
      if (closedName || (saturday && options.saturdayOperationEnabled === false) || (sunday && !options.sundayOperationEnabled) || (request && !isHalfDayRequest(request.requestType))) {
        const expectedClosure = !!closedName || (saturday && options.saturdayOperationEnabled === false) || (sunday && !options.sundayOperationEnabled);
        add({ code: expectedClosure ? 'STAFF_WORK_RULE_FIXED_SKIPPED_CLOSED' : 'STAFF_WORK_RULE_FIXED_BLOCKED', level: expectedClosure ? 'INFO' : 'ERROR', workDate: key, staffId: member.id, message: `${member.displayName}さんの固定勤務は${closedName ? '休園日' : request ? '承認済み休暇' : '休園設定'}を優先したため割り当てませんでした。` }); continue;
      }
      if (!rule.workPattern.isActive) { add({ code: 'STAFF_WORK_RULE_FIXED_PATTERN_INACTIVE', level: 'ERROR', workDate: key, staffId: member.id, message: `${member.displayName}さんの固定勤務パターンが無効なため割り当てませんでした。` }); continue; }
      const type = patternType(rule); if (!type) continue;
      if (blockedByPreviousPattern(member.id, workDate, rule.workPattern.id)) { add({ code: 'PATTERN_TRANSITION_BLOCKED', level: 'ERROR', workDate: key, staffId: member.id, message: `${member.displayName}さんは前日の勤務番号から当日の固定希望への禁止遷移に該当するため割り当てませんでした。` }); continue; }
      if (options.fixedWorkPatternOverridesWeeklyLimit !== true && weeklyPatternLimitExceeded(member.id, workDate, type, rule.workPattern.id)) { add({ code: 'WEEKLY_PATTERN_GROUP_LIMIT_BLOCKED', level: 'ERROR', workDate: key, staffId: member.id, message: `${member.displayName}さんは同一週の対象勤務グループ上限に達しているため、固定勤務を割り当てませんでした。` }); continue; }
      const times = rule.workPattern.startTime && rule.workPattern.endTime ? { startTime: rule.workPattern.startTime, endTime: rule.workPattern.endTime } : null;
      const conflict = prohibitionConflict(options.staffWorkRules ?? [], member.id, workDate, type, times, rule.workPattern.id);
      const approvedOverride = options.approvedHardRuleOverrides?.find((item) => item.date === key && item.staffId === member.id && item.workPatternId === rule.workPattern!.id);
      if (conflict && !approvedOverride) { add({ code: 'STAFF_WORK_RULE_FIXED_PROHIBITED', level: 'ERROR', workDate: key, staffId: member.id, message: `${member.displayName}さんの固定勤務は${ruleLabel(conflict)}と競合するため割り当てませんでした。` }); continue; }
      if (conflict && approvedOverride) add({ code: 'ADMIN_APPROVED_HARD_RULE_OVERRIDE', level: 'INFO', workDate: key, staffId: member.id, message: `${member.displayName}さんは「${ruleLabel(conflict)}」に対する日付限定例外が管理者承認済みのため、指定勤務を割り当てました。`, details: { sourceType: approvedOverride.sourceType, sourceReference: approvedOverride.sourceReference, confirmedAt: approvedOverride.confirmedAt, reason: approvedOverride.reason } });
      day.set(member.id, assignmentFromPattern(member, workDate, type, rule.workPattern, options, '個別勤務ルールによる固定勤務'));
      fixedStaffIds.add(member.id);
    }
    if (closedName || (saturday && options.saturdayOperationEnabled === false) || (sunday && !options.sundayOperationEnabled)) {
      const saturdayClosed = saturday && options.saturdayOperationEnabled === false;
      add({ code: closedName ? 'CLOSED_DATE' : saturdayClosed ? 'SATURDAY_CLOSED' : 'SUNDAY_CLOSED', level: 'INFO', workDate: key, message: closedName ? `${key}は「${closedName}」のため全職員をOFFにしました。` : `${key}は${saturdayClosed ? '土曜' : '日曜'}休園設定のため全職員をOFFにしました。` });
    } else {
      const patternRequirements = activeRequirements(options.staffingRequirements ?? [], workDate)
        .filter((item) => item.workPatternId && item.workPattern?.isActive && item.workPattern.isWorking && item.constraintLevel !== 'INFO')
        .sort((a, b) => (a.workPattern!.startTime ?? '').localeCompare(b.workPattern!.startTime ?? '') || a.code.localeCompare(b.code));
      for (const requirement of patternRequirements) allocateRequiredPattern(requirement.workPattern!, requirement.attributeDefinitionId, requirement.requiredCount, requirement.constraintLevel, requirement.code);
      for (const requirement of options.conditionalStaffingRequirements ?? []) {
        if ((requirement.startDate && requirement.startDate > workDate) || (requirement.endDate && requirement.endDate < workDate) || (requirement.dayOfWeek != null && requirement.dayOfWeek !== workDate.getUTCDay())) continue;
        const triggerCount = [...day.values()].filter((item) => item.workPatternId === requirement.triggerWorkPatternId && hasAttribute(options.staffAttributeAssignments ?? [], item.staffId, requirement.triggerAttributeDefinitionId, workDate)).length;
        if (triggerCount >= requirement.triggerCount) allocateRequiredPattern(requirement.targetWorkPattern, requirement.targetAttributeDefinitionId, requirement.requiredCount, requirement.constraintLevel, requirement.code, true);
      }
      const earlyRequired = saturday || sunday ? options.saturdayEarlyRequired : options.weekdayEarlyRequired;
      const lateRequired = saturday || sunday ? options.saturdayLateRequired : options.weekdayLateRequired;
      const replaceLegacyTargets = options.replaceLegacyShiftTargetsWhenPatternRequirementsActive === true && patternRequirements.length > 0;
      if (!replaceLegacyTargets) { allocate(ShiftType.EARLY, earlyRequired); allocate(ShiftType.LATE, lateRequired); }
      const targets = classTargets();
      const requiredWorking = targets.reduce((sum, requirement) => sum + (saturday || sunday ? requirement.saturdayRequired : requirement.weekdayRequired), 0);
      const alreadyWorking = [...day.values()].filter((item) => isWorking(item.shiftType) && item.countsTowardStaffing !== false).length;
      const staffingBuffer = requiredWorking > 0 && !saturday && !sunday ? 2 : 0;
      const saturdayMinimumStaff = options.saturdayMinimumStaff ?? 3;
      const minimumWorking = saturday || sunday ? Math.max(requiredWorking, saturdayMinimumStaff) : requiredWorking + staffingBuffer;
      const normalNeeded = Math.max(0, minimumWorking - alreadyWorking);
      for (let index = 0; index < normalNeeded; index += 1) {
        const normal = staff.filter((member) => day.get(member.id)?.shiftType === ShiftType.OFF && eligible(member, ShiftType.NORMAL));
        const member = normal.sort(compare(ShiftType.NORMAL, normal.length))[0]; if (!member) break;
        day.set(member.id, assignment(member, workDate, ShiftType.NORMAL, options, null, member.isDirector ? null : member.assignedClass));
        consumeFutureCapacity(member, ShiftType.NORMAL);
      }
      const assignedWorking = [...day.values()].filter((item) => isWorking(item.shiftType)).length;
      if ((saturday || sunday) && assignedWorking < saturdayMinimumStaff) { addRequestConstraintWarning(); add({ code: 'SATURDAY_MINIMUM_SHORTAGE', level: 'ERROR', workDate: key, required: saturdayMinimumStaff, assigned: assignedWorking, message: `${key}（${weekdays[workDate.getUTCDay()]}）の最低勤務人数が${saturdayMinimumStaff - assignedWorking}人不足しています。` }); }
      if (options.fillOpenUnassignedWithNormal && !saturday && !sunday) {
        for (const member of staff) {
          if (day.get(member.id)?.shiftType !== ShiftType.OFF || !eligible(member, ShiftType.NORMAL)) continue;
          day.set(member.id, assignment(member, workDate, ShiftType.NORMAL, options, '平日普通出', member.isDirector ? null : member.assignedClass));
        }
      }
      assignClasses(targets);
    }
    for (const rule of options.meetingDayRules ?? []) {
      if (!isOccurrenceOfWeekday(workDate, rule.dayOfWeek, rule.occurrence)) continue;
      for (const item of day.values()) if (!fixedStaffIds.has(item.staffId) && isWorking(item.shiftType) && item.endTime && item.endTime < rule.minimumEndTime) { item.endTime = rule.minimumEndTime; item.note = [item.note, '園固有の職員会議日は指定時刻まで勤務'].filter(Boolean).join(' / '); }
    }
    for (const member of staff) {
      const item = day.get(member.id)!; const request = fixed.get(`${member.id}:${key}`); if (request && isHalfDayRequest(request.requestType) && isWorking(item.shiftType)) { item.attendanceModifier = request.requestType === ShiftRequestType.HALF_DAY_PM ? { modifierType: 'PM_PAID_LEAVE', effectiveStartTime: halfDayBoundary(item.startTime, item.endTime), effectiveEndTime: item.endTime, sourceType: 'APPROVED_SHIFT_REQUEST' } : { modifierType: 'AM_PAID_LEAVE', effectiveStartTime: item.startTime, effectiveEndTime: halfDayBoundary(item.startTime, item.endTime), sourceType: 'APPROVED_SHIFT_REQUEST' }; item.note = [item.note, request.requestType === ShiftRequestType.HALF_DAY_PM ? '半P' : '半A'].filter(Boolean).join(' / '); }
      if (request && isHalfDayRequest(request.requestType) && !isWorking(item.shiftType)) add({ code: 'HALF_DAY_BASE_ASSIGNMENT_UNCONFIRMED', level: 'ERROR', workDate: key, staffId: member.id, message: `${member.displayName}さんの半休申請は基礎勤務が未確定です。勤務帯を管理者が確定してから半休補正を付与してください。` });
      assignments.push(item); const working = isWorking(item.shiftType);
      workStreak.set(member.id, working ? (workStreak.get(member.id) ?? 0) + 1 : 0); earlyStreak.set(member.id, item.shiftType === ShiftType.EARLY ? (earlyStreak.get(member.id) ?? 0) + 1 : 0); lateStreak.set(member.id, item.shiftType === ShiftType.LATE ? (lateStreak.get(member.id) ?? 0) + 1 : 0);
      if (working) { minutes.set(member.id, (minutes.get(member.id) ?? 0) + minutesFor(item)); days.set(`${member.id}:${weekKey(key)}`, (days.get(`${member.id}:${weekKey(key)}`) ?? 0) + 1); workCount.set(member.id, (workCount.get(member.id) ?? 0) + 1); if (saturday) saturdayCount.set(member.id, (saturdayCount.get(member.id) ?? 0) + 1); }
      const fairnessMinutes = generatedFairnessFor(item, member); if (fairnessMinutes == null) generatedFairnessUnavailable.add(member.id); else generatedFairnessMinutes.set(member.id, (generatedFairnessMinutes.get(member.id) ?? 0) + fairnessMinutes);
      if (item.shiftType === ShiftType.EARLY) earlyCountByStaff.set(member.id, (earlyCountByStaff.get(member.id) ?? 0) + 1);
      if (item.shiftType === ShiftType.LATE) lateCountByStaff.set(member.id, (lateCountByStaff.get(member.id) ?? 0) + 1);
    }

    function eligible(member: GeneratorStaff, type: ShiftType) {
      if (replayChoices && replayChoices.get(replayKey(member.id, workDate)) !== replayValue({ shiftType: type, workPatternId: options.systemWorkPatternIds?.[type] })) return false;
      const request = fixed.get(`${member.id}:${key}`); if (request && !isHalfDayRequest(request.requestType)) return false;
      if (request && isHalfDayRequest(request.requestType) && !fixedStaffIds.has(member.id)) return false;
      if (fixedStaffIds.has(member.id)) return false;
      if (saturday && !member.canWorkSaturdays) return false;
      if (type === ShiftType.EARLY && (!member.canWorkEarly || member.lateShiftOnly || (earlyStreak.get(member.id) ?? 0) >= options.maxConsecutiveEarlyDays)) return false;
      if (blockedByPreviousPattern(member.id, workDate, options.systemWorkPatternIds?.[type])) return false;
      if (weeklyPatternLimitExceeded(member.id, workDate, type, options.systemWorkPatternIds?.[type])) return false;
      if (type === ShiftType.LATE && (!member.canWorkLate || member.earlyShiftOnly || (lateStreak.get(member.id) ?? 0) >= options.maxConsecutiveLateDays)) return false;
      if (type === ShiftType.NORMAL && (!member.canWorkRegular || member.earlyShiftOnly || member.lateShiftOnly)) return false;
      const workRule = ruleEligibility(options.staffWorkRules ?? [], member.id, workDate, type, timesForMember(type, options, member) ?? null, options.systemWorkPatternIds?.[type]); if (!workRule.eligible) return false;
      if ((workStreak.get(member.id) ?? 0) >= options.maxConsecutiveWorkDays) return false;
      const nextMinutes = (minutes.get(member.id) ?? 0) + minutesForType(type, options, member); const nextDays = (days.get(`${member.id}:${weekKey(key)}`) ?? 0) + 1;
      for (const rule of applicableRules(options.staffWorkRules ?? [], member.id, workDate)) {
        if (rule.numericValue == null) continue;
        if (rule.ruleType === StaffWorkRuleType.MAX_CONSECUTIVE_WORK_DAYS && (workStreak.get(member.id) ?? 0) >= rule.numericValue) return false;
        if (rule.ruleType === StaffWorkRuleType.MAX_WORK_DAYS_PER_WEEK && nextDays > rule.numericValue) return false;
        const scoped = assignments.filter((item) => item.staffId === member.id && isWorking(item.shiftType) && applicableRules([rule], member.id, item.workDate).length > 0);
        if (rule.ruleType === StaffWorkRuleType.MAX_WORK_DAYS_PER_MONTH && scoped.length + 1 > rule.numericValue) return false;
        if (rule.ruleType === StaffWorkRuleType.MAX_WORK_PATTERN_PER_MONTH && rule.workPattern && patternType(rule) === type && scoped.filter((item) => item.shiftType === type).length + 1 > rule.numericValue) return false;
        if (rule.ruleType === StaffWorkRuleType.MAX_WORK_MINUTES_PER_MONTH && scoped.reduce((sum, item) => sum + minutesFor(item), 0) + minutesForType(type, options, member) > rule.numericValue) return false;
      }
      // These are hard constraints. Rejected candidates are normal solver decisions,
      // not warnings: only an assignment that actually violates a limit is actionable.
      if (member.monthlyWorkHourLimit && nextMinutes > member.monthlyWorkHourLimit * 60) return false;
      if (member.weeklyAvailableDays && nextDays > member.weeklyAvailableDays) return false;
      return true;
    }
    function allocateRequiredPattern(pattern: GeneratorWorkPattern, attributeDefinitionId: string, requiredCount: number, constraintLevel: string, requirementCode: string, replaceExistingPattern = false) {
      if (trace && options.sameWeekReassignment !== false && options.weeklyPatternRelaxation?.enabled && weeklyGroupFor(pattern.id)) {
        trace.set(`${key}:${pattern.id}`, { normal: staff.filter(row => day.get(row.id)?.shiftType === ShiftType.OFF).sort(comparePattern(pattern)).map(row => row.id), relaxed: [] });
      }
      const existing = () => [...day.values()].filter((item) => item.workPatternId === pattern.id && hasAttribute(options.staffAttributeAssignments ?? [], item.staffId, attributeDefinitionId, workDate)).length;
      while (existing() < requiredCount) {
        const canTakeRequirement = (candidate: GeneratorStaff) => day.get(candidate.id)?.shiftType === ShiftType.OFF
          || (replaceExistingPattern && isWorking(day.get(candidate.id)!.shiftType));
        const candidates = staff.filter((member) => canTakeRequirement(member) && eligibleForPattern(member, pattern, attributeDefinitionId));
        let member = candidates.sort(comparePattern(pattern))[0];
        let relaxationRecord: WeeklyPatternRelaxationRecord | null = null;
        if (!member && options.weeklyPatternRelaxation?.enabled) {
          const relaxedCandidates = staff.filter((candidate) => canTakeRequirement(candidate) && eligibleForPattern(candidate, pattern, attributeDefinitionId, true));
          member = relaxedCandidates.sort(compareWeeklyRelaxation(pattern))[0];
          if (member) relaxationRecord = relaxationRecordFor(member, pattern, requirementCode);
        }
        const approvedException = options.approvedWeeklyThirdAssignmentExceptions?.find((item) => item.date === key && approvedWeeklyThirdAssignments.filter((row) => row.workDate === key).length < item.maxAssignments);
        let approvedThird = false;
        if (!member && approvedException) {
          const approvedCandidates = staff.filter((candidate) => canTakeRequirement(candidate) && eligibleForPattern(candidate, pattern, attributeDefinitionId, true, approvedException.maxPerWeek));
          member = approvedCandidates.sort(compareWeeklyRelaxation(pattern))[0];
          if (member) { relaxationRecord = relaxationRecordFor(member, pattern, requirementCode); approvedThird = true; }
        }
        if (!member) {
          const ranking = trace?.get(`${key}:${pattern.id}`);
          if (ranking) ranking.relaxed = staff.filter(row => day.get(row.id)?.shiftType === ShiftType.OFF).sort(compareWeeklyRelaxation(pattern)).map(row => row.id);
          addRequestConstraintWarning();
          const requirementLabel = options.staffingRequirements?.find(row => row.code === requirementCode)?.name ?? requirementCode;
          if (options.weeklyPatternRelaxation?.enabled && weeklyGroupFor(pattern.id)) add({ code: 'WEEKLY_PATTERN_RELAXATION_EXHAUSTED', level: 'ERROR', workDate: key, required: requiredCount, assigned: existing(), message: `${requirementLabel}は必要${requiredCount}名・配置${existing()}名・不足${requiredCount - existing()}名です。週2回までの最小緩和でも解消できませんでした。これ以上の制約緩和は管理者判断が必要です。`, details: { requirementCode, workPatternId: pattern.id, workPatternCode: pattern.code, shortage: requiredCount - existing(), allowedMaximumPerWeek: options.weeklyPatternRelaxation.maxPerWeek, suggestedDecision: '週上限・対象職員・必要人数のいずれかを管理者が確認' } });
          add({ code: 'WORK_PATTERN_REQUIREMENT_SHORTAGE', level: constraintLevel === 'HARD' ? 'ERROR' : 'WARNING', workDate: key, required: requiredCount, assigned: existing(), message: `${requirementLabel}の勤務パターンを勤務条件を守って割り当て可能な職員が不足しています。` }); break;
        }
        if (replaceExistingPattern) {
          const memberPrevious = day.get(member.id)!;
          const displaced = [...day.values()].find((item) => item.staffId !== member!.id && item.workPatternId === pattern.id && !fixedStaffIds.has(item.staffId) && !hasAttribute(options.staffAttributeAssignments ?? [], item.staffId, attributeDefinitionId, workDate));
          if (displaced) {
            // Conditional requirements refine who occupies an already-filled
            // pattern slot. Swap the selected qualified member's current work
            // with the displaced member so base staffing counts are preserved.
            day.set(displaced.staffId, { ...memberPrevious, staffId: displaced.staffId, assignedClass: null });
          }
        }
        const type = shiftTypeForPattern(pattern.id);
        day.set(member.id, assignmentFromPattern(member, workDate, type, pattern, options, '勤務パターン別必要人数による自動配置'));
        if (relaxationRecord) {
          weeklyPatternRelaxations.push(relaxationRecord);
          const level = options.weeklyPatternRelaxation?.explanationLevel ?? 'INFO';
          if (approvedThird && approvedException) {
            approvedWeeklyThirdAssignments.push({ ...relaxationRecord, sourceType: approvedException.sourceType, sourceReference: approvedException.sourceReference, confirmedAt: approvedException.confirmedAt, reason: approvedException.reason });
            add({ code: 'ADMIN_APPROVED_WEEKLY_THIRD_ASSIGNMENT', level: 'INFO', workDate: key, staffId: member.id, required: requiredCount, assigned: existing(), message: `${requirementCode}の不足解消に限り、管理者承認済みの週3回目を適用しました。`, details: { ...relaxationRecord, ...approvedException, shortageWithoutException: 1 } });
          } else add({ code: 'WEEKLY_PATTERN_LIMIT_RELAXED', level, workDate: key, staffId: member.id, required: requiredCount, assigned: existing(), message: `${requirementCode}の必要人数を満たすため、週1回原則を必要最小限だけ週2回へ緩和しました。`, details: { ...relaxationRecord, shortageWithoutRelaxation: 1, selectionReason: `直近の週2回週${relaxationRecord.recentRelaxedWeekCountBefore}回、当月${relaxationRecord.monthlyRelaxedWeekCountBefore}回、現年度${relaxationRecord.annualRelaxedWeekCountBefore}回、長期${relaxationRecord.longTermRelaxedWeekCountBefore}/${relaxationRecord.longTermOpportunityWeekCountBefore}機会週、直近・月・年度・長期の対象勤務負担を順に比較` } });
        }
        consumeFutureCapacity(member, type);
      }
    }
    function eligibleForPattern(member: GeneratorStaff, pattern: GeneratorWorkPattern, attributeDefinitionId: string, allowWeeklyRelaxation = false, weeklyMaximumOverride?: number) {
      if (!hasAttribute(options.staffAttributeAssignments ?? [], member.id, attributeDefinitionId, workDate) || fixed.has(`${member.id}:${key}`) || fixedStaffIds.has(member.id)) return false;
      if (saturday && !member.canWorkSaturdays) return false;
      const type = shiftTypeForPattern(pattern.id);
      if (replayChoices && replayChoices.get(replayKey(member.id, workDate)) !== replayValue({ shiftType: type, workPatternId: pattern.id })) return false;
      if ((type === ShiftType.EARLY || type === ShiftType.LATE) && isFixedClass(member.assignedClass) && staff.some((other) => other.id !== member.id && other.assignedClass === member.assignedClass && day.get(other.id)?.shiftType === type)) return false;
      if (type === ShiftType.EARLY && (!member.canWorkEarly || member.lateShiftOnly || (earlyStreak.get(member.id) ?? 0) >= options.maxConsecutiveEarlyDays)) return false;
      if (type === ShiftType.LATE && (!member.canWorkLate || member.earlyShiftOnly || (lateStreak.get(member.id) ?? 0) >= options.maxConsecutiveLateDays)) return false;
      if (blockedByPreviousPattern(member.id, workDate, pattern.id)) return false;
      if (allowWeeklyRelaxation ? !weeklyPatternRelaxationAllowed(member.id, workDate, type, pattern.id, weeklyMaximumOverride) : weeklyPatternLimitExceeded(member.id, workDate, type, pattern.id)) return false;
      if (!ruleEligibility(options.staffWorkRules ?? [], member.id, workDate, type, pattern.startTime && pattern.endTime ? { startTime: pattern.startTime, endTime: pattern.endTime } : null, pattern.id).eligible) return false;
      if ((workStreak.get(member.id) ?? 0) >= options.maxConsecutiveWorkDays) return false;
      const nextMinutes = (minutes.get(member.id) ?? 0) + minutesForPattern(pattern); const nextDays = (days.get(`${member.id}:${weekKey(key)}`) ?? 0) + 1;
      for (const rule of applicableRules(options.staffWorkRules ?? [], member.id, workDate)) {
        if (rule.numericValue == null) continue;
        if (rule.ruleType === StaffWorkRuleType.MAX_CONSECUTIVE_WORK_DAYS && (workStreak.get(member.id) ?? 0) >= rule.numericValue) return false;
        if (rule.ruleType === StaffWorkRuleType.MAX_WORK_DAYS_PER_WEEK && nextDays > rule.numericValue) return false;
        const scoped = assignments.filter((item) => item.staffId === member.id && isWorking(item.shiftType) && applicableRules([rule], member.id, item.workDate).length > 0);
        if (rule.ruleType === StaffWorkRuleType.MAX_WORK_DAYS_PER_MONTH && scoped.length + 1 > rule.numericValue) return false;
        if (rule.ruleType === StaffWorkRuleType.MAX_WORK_PATTERN_PER_MONTH && rule.workPattern?.id === pattern.id && scoped.filter((item) => item.workPatternId === pattern.id).length + 1 > rule.numericValue) return false;
        if (rule.ruleType === StaffWorkRuleType.MAX_WORK_MINUTES_PER_MONTH && scoped.reduce((sum, item) => sum + minutesFor(item), 0) + minutesForPattern(pattern) > rule.numericValue) return false;
      }
      if (member.monthlyWorkHourLimit && nextMinutes > member.monthlyWorkHourLimit * 60) return false;
      if (member.weeklyAvailableDays && nextDays > member.weeklyAvailableDays) return false;
      return true;
    }
    function softRank(member: GeneratorStaff, patternId?: string) {
      return provisionalSoftRank(options.provisionalSoftRules ?? [], member.id, workDate, patternId,
        [...(options.priorAssignments ?? []), ...assignments], options.systemWorkPatternIds ?? {});
    }
    function comparePattern(pattern: GeneratorWorkPattern) { const type = shiftTypeForPattern(pattern.id); return (a: GeneratorStaff, b: GeneratorStaff) => { const preferred = preferenceRank(options.staffWorkRules ?? [], a.id, workDate, type, pattern.id) - preferenceRank(options.staffWorkRules ?? [], b.id, workDate, type, pattern.id); if (preferred) return preferred; const provisional = softRank(a, pattern.id) - softRank(b, pattern.id); if (provisional) return provisional; const transitionBurden = specialShiftBurden(a, type) - specialShiftBurden(b, type); if (transitionBurden) return transitionBurden; const specialCount = countFor(a, type) - countFor(b, type); if (specialCount) return specialCount; const weeklyA = weeklyPatternCount(a.id, workDate, pattern.id); const weeklyB = weeklyPatternCount(b.id, workDate, pattern.id); if (weeklyA !== weeklyB) return weeklyA - weeklyB; const work = (workCount.get(a.id) ?? 0) - (workCount.get(b.id) ?? 0); return work || a.employeeNumber.localeCompare(b.employeeNumber, 'ja'); }; }
    function compareWeeklyRelaxation(pattern: GeneratorWorkPattern) { const cache = new Map<string, ReturnType<typeof weeklyRelaxationFairness>>(); const stats = (id: string) => { if (!cache.has(id)) cache.set(id, weeklyRelaxationFairness(id, pattern.id)); return cache.get(id)!; }; return (a: GeneratorStaff, b: GeneratorStaff) => { const provisional = softRank(a, pattern.id) - softRank(b, pattern.id); if (provisional) return provisional; const aStats = stats(a.id); const bStats = stats(b.id); for (const key of ['recentRelaxedWeekCount', 'monthlyRelaxedWeekCount', 'annualRelaxedWeekCount'] as const) if (aStats[key] !== bStats[key]) return aStats[key] - bStats[key]; if (aStats.longTermRelaxedWeekRate != null && bStats.longTermRelaxedWeekRate != null && aStats.longTermRelaxedWeekRate !== bStats.longTermRelaxedWeekRate) return aStats.longTermRelaxedWeekRate - bStats.longTermRelaxedWeekRate; for (const key of ['recentGroupCount', 'monthlyGroupCount', 'annualGroupCount'] as const) if (aStats[key] !== bStats[key]) return aStats[key] - bStats[key]; if (aStats.longTermGroupRate != null && bStats.longTermGroupRate != null && aStats.longTermGroupRate !== bStats.longTermGroupRate) return aStats.longTermGroupRate - bStats.longTermGroupRate; const annual = compareAnnualFairness(a, b); if (annual) return annual; const burden = specialShiftBurden(a, shiftTypeForPattern(pattern.id)) - specialShiftBurden(b, shiftTypeForPattern(pattern.id)); if (burden) return burden; const work = (workCount.get(a.id) ?? 0) - (workCount.get(b.id) ?? 0); return work || a.employeeNumber.localeCompare(b.employeeNumber, 'ja'); }; }
    function shiftTypeForPattern(patternId: string) { for (const [type, id] of Object.entries(options.systemWorkPatternIds ?? {})) if (id === patternId) return type as ShiftType; return ShiftType.OTHER; }
    function compare(type: ShiftType, currentCandidateCount: number) {
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
        const futureHard = futureHardPenalty(a, type, currentCandidateCount) - futureHardPenalty(b, type, currentCandidateCount);
        if (futureHard) return futureHard;
        const preferred = preferenceRank(options.staffWorkRules ?? [], a.id, workDate, type) - preferenceRank(options.staffWorkRules ?? [], b.id, workDate, type);
        if (preferred) return preferred;
        const provisional = softRank(a, options.systemWorkPatternIds?.[type]) - softRank(b, options.systemWorkPatternIds?.[type]);
        if (provisional) return provisional;
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
          // On Saturdays, use the existing Saturday count only as a tie-break
          // after HARD/future-HARD/preference priorities, before NORMAL-specific
          // soft reservation. This prevents one regular-only worker from being
          // selected every Saturday while equally safe alternatives are available.
          if (saturday) {
            const saturdayFairness = (saturdayCount.get(a.id) ?? 0) - (saturdayCount.get(b.id) ?? 0);
            if (saturdayFairness) return saturdayFairness;
          }
          // Prefer staff who cannot cover special shifts, then staff who have already
          // received more of their eligible special shifts. This preserves future
          // weekly capacity for under-allocated early/late candidates.
          const specialReserve = normalSpecialReserveRank(a) - normalSpecialReserveRank(b);
          if (specialReserve) return specialReserve;
          const placement = placementNeed(b) - placementNeed(a);
          if (placement) return placement;
          const targetDeficit = normalizedTargetDeficit(b) - normalizedTargetDeficit(a);
          if (targetDeficit) return targetDeficit;
          const annualFairness = compareAnnualFairness(a, b);
          if (annualFairness) return annualFairness;
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
      const previous = previousShift(member.id, workDate);
      if (type === ShiftType.EARLY && previous === ShiftType.LATE) return 2;
      if (type === ShiftType.LATE && previous === ShiftType.EARLY) return 1;
      return previous === type ? 1 : 0;
    }
    function previousShift(staffId: string, date: Date) { const previousDate = new Date(date); previousDate.setUTCDate(previousDate.getUTCDate() - 1); const dateKey = iso(previousDate); return assignments.find((item) => item.staffId === staffId && iso(item.workDate) === dateKey)?.shiftType ?? options.priorAssignments?.find((item) => item.staffId === staffId && iso(item.workDate) === dateKey)?.shiftType; }
    function previousAssignment(staffId: string, date: Date) { const previousDate = new Date(date); previousDate.setUTCDate(previousDate.getUTCDate() - 1); const dateKey = iso(previousDate); return assignments.find((item) => item.staffId === staffId && iso(item.workDate) === dateKey) ?? options.priorAssignments?.find((item) => item.staffId === staffId && iso(item.workDate) === dateKey); }
    function blockedByPreviousPattern(staffId: string, date: Date, toWorkPatternId?: string | null) { if (!toWorkPatternId) return false; const previous = previousAssignment(staffId, date); if (!previous?.workPatternId) return false; return (options.patternTransitionBlocks ?? []).some((block) => block.fromWorkPatternIds.includes(previous.workPatternId!) && block.toWorkPatternIds.includes(toWorkPatternId)); }
    function weeklyPatternLimitExceeded(staffId: string, date: Date, shiftType: ShiftType, workPatternId?: string | null) {
      if (options.weeklyPatternGroupExemptStaffIds?.includes(staffId)) return false;
      const groups = (options.weeklyPatternGroups ?? []).filter((group) => group.shiftTypes?.includes(shiftType) || (!!workPatternId && group.workPatternIds?.includes(workPatternId)));
      return groups.some((group) => {
        const sameGroup = (item: { shiftType: ShiftType; workPatternId?: string | null }) => group.shiftTypes?.includes(item.shiftType) || (!!item.workPatternId && group.workPatternIds?.includes(item.workPatternId));
        const sameWeek = (item: { workDate: Date }) => weekKey(iso(item.workDate)) === weekKey(iso(date));
        const count = assignments.filter((item) => item.staffId === staffId && sameWeek(item) && sameGroup(item)).length
          + (options.priorAssignments ?? []).filter((item) => item.staffId === staffId && sameWeek(item) && sameGroup(item)).length;
        return count >= group.maxPerWeek;
      });
    }
    function weeklyGroupFor(workPatternId: string) { return (options.weeklyPatternGroups ?? []).find((group) => group.workPatternIds?.includes(workPatternId)); }
    function weeklyPatternRelaxationAllowed(staffId: string, date: Date, shiftType: ShiftType, workPatternId?: string | null, maximumOverride?: number) {
      if (!workPatternId || options.weeklyPatternGroupExemptStaffIds?.includes(staffId)) return false;
      const group = weeklyGroupFor(workPatternId); if (!group || !(group.shiftTypes?.includes(shiftType) || group.workPatternIds?.includes(workPatternId))) return false;
      const count = groupAssignmentCount(staffId, group, (item) => weekKey(iso(item.workDate)) === weekKey(iso(date)));
      return count >= group.maxPerWeek && count < (maximumOverride ?? options.weeklyPatternRelaxation?.maxPerWeek ?? group.maxPerWeek);
    }
    function groupAssignmentCount(staffId: string, group: GeneratorWeeklyPatternGroup, dateFilter: (item: { workDate: Date }) => boolean) {
      const sameGroup = (item: { shiftType: ShiftType; workPatternId?: string | null }) => group.shiftTypes?.includes(item.shiftType) || (!!item.workPatternId && group.workPatternIds?.includes(item.workPatternId));
      return assignments.filter((item) => item.staffId === staffId && dateFilter(item) && sameGroup(item)).length + (options.priorAssignments ?? []).filter((item) => item.staffId === staffId && dateFilter(item) && sameGroup(item)).length;
    }
    function weeklyRelaxationFairness(staffId: string, workPatternId: string) {
      const group = weeklyGroupFor(workPatternId)!; const monthPrefix = iso(start).slice(0, 7); const defaultLongStart = new Date(start); defaultLongStart.setUTCFullYear(defaultLongStart.getUTCFullYear() - (options.weeklyPatternRelaxation?.historyYears ?? 3)); const defaultRecentStart = new Date(start); defaultRecentStart.setUTCDate(defaultRecentStart.getUTCDate() - (options.weeklyPatternRelaxation?.recentWindowDays ?? 90)); const longStart = options.fairnessWindows?.longTermStart ?? defaultLongStart; const recentStart = options.fairnessWindows?.recentStart ?? defaultRecentStart; const fiscalStart = options.fairnessWindows?.fiscalStart ?? new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
      const historicalRows = (options.priorAssignments ?? []).filter((item) => item.staffId === staffId && item.workDate >= longStart && item.workDate < start);
      const allRows = [...historicalRows, ...assignments.filter((item) => item.staffId === staffId)].filter((item) => item.workDate >= longStart && item.workDate < end);
      const rows = allRows.filter((item) => group.shiftTypes?.includes(item.shiftType) || (!!item.workPatternId && group.workPatternIds?.includes(item.workPatternId)));
      const historicalGroupRows = historicalRows.filter((item) => group.shiftTypes?.includes(item.shiftType) || (!!item.workPatternId && group.workPatternIds?.includes(item.workPatternId)));
      const weekCounts = new Map<string, number>(); for (const item of rows) weekCounts.set(weekKey(iso(item.workDate)), (weekCounts.get(weekKey(iso(item.workDate))) ?? 0) + 1);
      const historicalWeekCounts = new Map<string, number>(); for (const item of historicalGroupRows) historicalWeekCounts.set(weekKey(iso(item.workDate)), (historicalWeekCounts.get(weekKey(iso(item.workDate))) ?? 0) + 1);
      const opportunityWeeks = new Set(historicalRows.filter((item) => isWorking(item.shiftType)).map((item) => weekKey(iso(item.workDate))));
      const relaxedWeeks = [...weekCounts].filter(([, count]) => count > group.maxPerWeek).map(([week]) => week); const monthWeekKeys = new Set(rows.filter((item) => iso(item.workDate).startsWith(monthPrefix)).map((item) => weekKey(iso(item.workDate))));
      const recentGroupCount = rows.filter((item) => item.workDate >= recentStart).length; const annualGroupCount = rows.filter((item) => item.workDate >= fiscalStart).length; const longTermGroupCount = historicalGroupRows.length; const opportunityCount = opportunityWeeks.size; const longTermRelaxedWeekCount = [...historicalWeekCounts.values()].filter((count) => count > group.maxPerWeek).length;
      return { recentRelaxedWeekCount: relaxedWeeks.filter((week) => new Date(`${week}T00:00:00Z`) >= recentStart).length, monthlyRelaxedWeekCount: relaxedWeeks.filter((week) => monthWeekKeys.has(week)).length, annualRelaxedWeekCount: relaxedWeeks.filter((week) => new Date(`${week}T00:00:00Z`) >= fiscalStart).length, longTermRelaxedWeekCount, recentGroupCount, monthlyGroupCount: rows.filter((item) => iso(item.workDate).startsWith(monthPrefix)).length, annualGroupCount, longTermGroupCount, longTermOpportunityWeekCount: opportunityCount, longTermRelaxedWeekRate: opportunityCount ? longTermRelaxedWeekCount / opportunityCount : null, longTermGroupRate: opportunityCount ? longTermGroupCount / opportunityCount : null, historyWindowStart: iso(longStart) };
    }
    function relaxationRecordFor(member: GeneratorStaff, pattern: GeneratorWorkPattern, requirementCode: string): WeeklyPatternRelaxationRecord {
      const stats = weeklyRelaxationFairness(member.id, pattern.id); const previousWeeklyCount = weeklyPatternCount(member.id, workDate, pattern.id);
      return { staffId: member.id, employeeNumber: member.employeeNumber, workDate: key, weekStart: weekKey(key), workPatternId: pattern.id, workPatternCode: pattern.code, previousWeeklyCount, resultingWeeklyCount: previousWeeklyCount + 1, monthlyGroupCountBefore: stats.monthlyGroupCount, annualGroupCountBefore: stats.annualGroupCount, monthlyRelaxedWeekCountBefore: stats.monthlyRelaxedWeekCount, annualRelaxedWeekCountBefore: stats.annualRelaxedWeekCount, recentGroupCountBefore: stats.recentGroupCount, recentRelaxedWeekCountBefore: stats.recentRelaxedWeekCount, longTermGroupCountBefore: stats.longTermGroupCount, longTermRelaxedWeekCountBefore: stats.longTermRelaxedWeekCount, longTermOpportunityWeekCountBefore: stats.longTermOpportunityWeekCount, longTermGroupRateBefore: stats.longTermGroupRate, longTermRelaxedWeekRateBefore: stats.longTermRelaxedWeekRate, historyWindowStart: stats.historyWindowStart, requirementCode };
    }
    function weeklyPatternCount(staffId: string, date: Date, workPatternId: string) { const group = (options.weeklyPatternGroups ?? []).find((item) => item.workPatternIds?.includes(workPatternId)); if (!group) return 0; const sameWeek = (item: { workDate: Date }) => weekKey(iso(item.workDate)) === weekKey(iso(date)); const sameGroup = (item: { shiftType: ShiftType; workPatternId?: string | null }) => group.shiftTypes?.includes(item.shiftType) || (!!item.workPatternId && group.workPatternIds?.includes(item.workPatternId)); return assignments.filter((item) => item.staffId === staffId && sameWeek(item) && sameGroup(item)).length + (options.priorAssignments ?? []).filter((item) => item.staffId === staffId && sameWeek(item) && sameGroup(item)).length; }
    function countFor(member: GeneratorStaff, type: ShiftType) { return type === ShiftType.EARLY ? (earlyCountByStaff.get(member.id) ?? 0) : type === ShiftType.LATE ? (lateCountByStaff.get(member.id) ?? 0) : 0; }
    function normalSpecialReserveRank(member: GeneratorStaff) { const counts: number[] = []; if (member.canWorkEarly && !member.lateShiftOnly) counts.push(earlyCountByStaff.get(member.id) ?? 0); if (member.canWorkLate && !member.earlyShiftOnly) counts.push(lateCountByStaff.get(member.id) ?? 0); return counts.length ? -counts.reduce((sum, value) => sum + value, 0) / counts.length : -1000; }
    function placementNeed(member: GeneratorStaff) { if (!isFixedClass(member.assignedClass)) return 0; const requirement = classTargets().find((item) => item.classType === member.assignedClass); if (!requirement) return 0; const target = saturday || sunday ? requirement.saturdayRequired : requirement.weekdayRequired; const assigned = staff.filter((item) => item.assignedClass === member.assignedClass && isWorking(day.get(item.id)!.shiftType)).length; return Math.max(0, target - assigned); }
    function normalizedTargetDeficit(member: GeneratorStaff) { const ratios: number[] = []; if (member.monthlyTargetWorkDays) ratios.push(Math.max(0, member.monthlyTargetWorkDays - (workCount.get(member.id) ?? 0)) / member.monthlyTargetWorkDays); if (member.monthlyTargetWorkHours) { const targetMinutes = member.monthlyTargetWorkHours * 60; ratios.push(Math.max(0, targetMinutes - (minutes.get(member.id) ?? 0)) / targetMinutes); } return ratios.length ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : 0; }
    function compareAnnualFairness(a: GeneratorStaff, b: GeneratorStaff) { if (options.annualFairnessSoft === false || !a.annualFairness || !b.annualFairness || generatedFairnessUnavailable.has(a.id) || generatedFairnessUnavailable.has(b.id)) return 0; const rateA = (a.annualFairness.confirmedFairnessMinutes + (generatedFairnessMinutes.get(a.id) ?? 0) + minutesForType(ShiftType.NORMAL, options, a)) / a.annualFairness.annualTargetMinutes; const rateB = (b.annualFairness.confirmedFairnessMinutes + (generatedFairnessMinutes.get(b.id) ?? 0) + minutesForType(ShiftType.NORMAL, options, b)) / b.annualFairness.annualTargetMinutes; return rateA - rateB; }
    function generatedFairnessFor(item: GeneratedAssignment, member: GeneratorStaff): number | null { const prescribed=member.annualFairness?.prescribedMinutesByDate?.[iso(item.workDate)]??null;try{const value=assignmentTimeBreakdown(item,prescribed);return value.actualWorkMinutes+value.paidLeaveMinutes;}catch{return member.annualFairness?null:0;} }
    function allocate(type: ShiftType, required: number) {
      const existing = staff.filter((member) => day.get(member.id)?.shiftType === type); let count = existing.length; const usedFixedClasses = new Set(existing.map((member) => member.assignedClass).filter(isFixedClass)); let rejectedByClass = false;
      const candidates = staff.filter((m) => day.get(m.id)?.shiftType === ShiftType.OFF && eligible(m, type));
      const remaining = [...candidates];
      while (remaining.length && count < required) {
        remaining.sort(compare(type, remaining.length));
        const member = remaining.shift()!;
        if (count >= required) break;
        if (isFixedClass(member.assignedClass) && usedFixedClasses.has(member.assignedClass)) { rejectedByClass = true; continue; }
        day.set(member.id, assignment(member, workDate, type, options, null, member.isDirector ? null : member.assignedClass, options.systemWorkPatternIds?.[type]));
        consumeFutureCapacity(member, type);
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
    function futureHardPenalty(member: GeneratorStaff, type: ShiftType, currentCandidateCount: number) {
      if (options.futureHardCapacityReservation === false || currentCandidateCount <= 1) return 0;
      const cacheKey = `${type}:${member.id}:${currentCandidateCount}`;
      const cached = futureCapacityCache.get(cacheKey); if (cached != null) { futureHardCapacitySummary.cacheHits += 1; return cached; }
      futurePlan ??= buildFuturePlan();
      futureHardCapacitySummary.evaluations += 1;
      const reserved = futurePlan.reservations.filter((item) => item.staffId === member.id);
      const remainingDays = futurePlan.capacities.find((item) => item.staffId === member.id)?.remainingDays ?? 0;
      const unavailable = new Set(unavailableAfterCurrent(member, type, futurePlan.slots));
      const base = reserved.length && (remainingDays <= reserved.length || reserved.some((item) => unavailable.has(item.slotId))) ? 1 : 0;
      const attribute = futureAttributeHardLoss(member, futurePlan);
      const penalty = Math.max(base, attribute);
      futureCapacityCache.set(cacheKey, penalty);
      return penalty;
    }
    function buildFuturePlan() {
      futureHardCapacitySummary.planBuilds += 1;
      futureHardCapacitySummary.maxFlowCalls += 1;
      futureHardCapacitySummary.maxFlowCallsByDate[key] = (futureHardCapacitySummary.maxFlowCallsByDate[key] ?? 0) + 1;
      const futureDates: Date[] = [];
      const weekEnd = new Date(workDate); weekEnd.setUTCDate(weekEnd.getUTCDate() + (7 - weekEnd.getUTCDay()) % 7);
      for (let date = new Date(workDate.getTime() + 86400000); date <= weekEnd && date < end; date = new Date(date.getTime() + 86400000)) {
        if (isOpenFutureDate(date)) futureDates.push(date);
      }
      const fixedFutureDays = new Map<string, number>();
      const slots: FutureHardSlot[] = [];
      for (const date of futureDates) {
        const futureKey = iso(date); const weekend = date.getUTCDay() === 6 || date.getUTCDay() === 0;
        const earlyRequired = weekend ? options.saturdayEarlyRequired : options.weekdayEarlyRequired;
        const lateRequired = weekend ? options.saturdayLateRequired : options.weekdayLateRequired;
        const targets = classTargets();
        const requiredWorking = targets.reduce((sum, requirement) => sum + (weekend ? requirement.saturdayRequired : requirement.weekdayRequired), 0);
        const staffingBuffer = requiredWorking > 0 && !weekend ? 2 : 0;
        const minimumWorking = weekend ? Math.max(requiredWorking, options.saturdayMinimumStaff ?? 3) : requiredWorking + staffingBuffer;
        const requirements = [
          { type: ShiftType.EARLY, required: earlyRequired },
          { type: ShiftType.LATE, required: lateRequired },
          { type: ShiftType.NORMAL, required: Math.max(0, minimumWorking - earlyRequired - lateRequired) },
        ];
        const fixedTypes = new Map<ShiftType, number>();
        for (const candidate of staff) {
          const rule = validFutureFixed(candidate, date); if (!rule) continue;
          fixedFutureDays.set(candidate.id, (fixedFutureDays.get(candidate.id) ?? 0) + 1);
          fixedTypes.set(rule, (fixedTypes.get(rule) ?? 0) + 1);
        }
        for (const requirement of requirements) {
          const required = Math.max(0, requirement.required - (fixedTypes.get(requirement.type) ?? 0));
          if (!required) continue;
          slots.push({ id: `${futureKey}:${requirement.type}`, date: futureKey, required, candidateIds: staff.filter((candidate) => futureEligible(candidate, date, requirement.type)).map((candidate) => candidate.id) });
        }
      }
      const capacities = staff.map((member) => ({
        staffId: member.id,
        remainingDays: Math.max(0, weeklyLimit(member, futureDates) - (days.get(`${member.id}:${weekKey(key)}`) ?? 0) - (isWorking(day.get(member.id)!.shiftType) ? 1 : 0) - (fixedFutureDays.get(member.id) ?? 0)),
      }));
      const reservations = futureHardReservationPlan(slots, capacities).reservations;
      return { slots, capacities, futureDates, reservations };
    }
    function unavailableAfterCurrent(member: GeneratorStaff, type: ShiftType, slots: FutureHardSlot[]) {
      const tomorrow = iso(new Date(workDate.getTime() + 86400000));
      let blockEveryType = (workStreak.get(member.id) ?? 0) + 1 >= options.maxConsecutiveWorkDays;
      for (const rule of applicableRules(options.staffWorkRules ?? [], member.id, workDate)) {
        if (rule.ruleType === StaffWorkRuleType.MAX_CONSECUTIVE_WORK_DAYS && rule.numericValue != null && (workStreak.get(member.id) ?? 0) + 1 >= rule.numericValue) blockEveryType = true;
      }
      return slots.filter((slot) => {
        if (slot.date !== tomorrow) return false;
        if (blockEveryType) return true;
        if (type === ShiftType.EARLY && slot.id.endsWith(`:${ShiftType.EARLY}`) && (earlyStreak.get(member.id) ?? 0) + 1 >= options.maxConsecutiveEarlyDays) return true;
        return type === ShiftType.LATE && slot.id.endsWith(`:${ShiftType.LATE}`) && (lateStreak.get(member.id) ?? 0) + 1 >= options.maxConsecutiveLateDays;
      }).map((slot) => slot.id);
    }
    function consumeFutureCapacity(member: GeneratorStaff, type: ShiftType) {
      futureCapacityCache.clear();
      if (!futurePlan) return;
      const capacity = futurePlan.capacities.find((item) => item.staffId === member.id);
      if (!capacity) return;
      const nextRemainingDays = Math.max(0, capacity.remainingDays - 1);
      const unavailable = new Set(unavailableAfterCurrent(member, type, futurePlan.slots));
      const reserved = futurePlan.reservations.filter((item) => item.staffId === member.id);
      if (reserved.length > nextRemainingDays || reserved.some((item) => unavailable.has(item.slotId))) {
        futurePlan = null;
        return;
      }
      futurePlan = {
        ...futurePlan,
        capacities: futurePlan.capacities.map((item) => item.staffId === member.id ? { ...item, remainingDays: nextRemainingDays } : item),
        slots: unavailable.size ? futurePlan.slots.map((slot) => unavailable.has(slot.id)
          ? { ...slot, candidateIds: slot.candidateIds.filter((staffId) => staffId !== member.id) }
          : slot) : futurePlan.slots,
      };
      futureHardCapacitySummary.incrementalUpdates += 1;
    }
    function isOpenFutureDate(date: Date) {
      const futureKey = iso(date); const futureSaturday = date.getUTCDay() === 6; const futureSunday = date.getUTCDay() === 0;
      return !closed.has(futureKey) && !(futureSaturday && options.saturdayOperationEnabled === false) && !(futureSunday && !options.sundayOperationEnabled);
    }
    function validFutureFixed(member: GeneratorStaff, date: Date) {
      const futureKey = iso(date); if (fixed.has(`${member.id}:${futureKey}`)) return null;
      const rule = fixedRule(options.staffWorkRules ?? [], member.id, date); if (!rule?.workPattern?.isActive) return null;
      const type = patternType(rule); if (!type || !isWorking(type)) return null;
      const times = rule.workPattern.startTime && rule.workPattern.endTime ? { startTime: rule.workPattern.startTime, endTime: rule.workPattern.endTime } : null;
      return prohibitionConflict(options.staffWorkRules ?? [], member.id, date, type, times, rule.workPattern.id) ? null : type;
    }
    function futureEligible(member: GeneratorStaff, date: Date, type: ShiftType) {
      const futureKey = iso(date); if (fixed.has(`${member.id}:${futureKey}`) || validFutureFixed(member, date)) return false;
      if (blockedByCurrentDay(member, date, type)) return false;
      if (date.getUTCDay() === 6 && !member.canWorkSaturdays) return false;
      if (type === ShiftType.EARLY && (!member.canWorkEarly || member.lateShiftOnly)) return false;
      if (type === ShiftType.LATE && (!member.canWorkLate || member.earlyShiftOnly)) return false;
      if (type === ShiftType.NORMAL && (!member.canWorkRegular || member.earlyShiftOnly || member.lateShiftOnly)) return false;
      if (!ruleEligibility(options.staffWorkRules ?? [], member.id, date, type, timesForMember(type, options, member) ?? null, options.systemWorkPatternIds?.[type]).eligible) return false;
      const nextMinutes = (minutes.get(member.id) ?? 0) + minutesForType(type, options, member);
      if (member.monthlyWorkHourLimit && nextMinutes > member.monthlyWorkHourLimit * 60) return false;
      return true;
    }
    function blockedByCurrentDay(member: GeneratorStaff, date: Date, type: ShiftType) {
      if (iso(date) !== iso(new Date(workDate.getTime() + 86400000))) return false;
      const currentType = day.get(member.id)?.shiftType; if (!currentType || !isWorking(currentType)) return false;
      if ((workStreak.get(member.id) ?? 0) + 1 >= options.maxConsecutiveWorkDays) return true;
      for (const rule of applicableRules(options.staffWorkRules ?? [], member.id, workDate)) {
        if (rule.ruleType === StaffWorkRuleType.MAX_CONSECUTIVE_WORK_DAYS && rule.numericValue != null && (workStreak.get(member.id) ?? 0) + 1 >= rule.numericValue) return true;
      }
      if (currentType === ShiftType.EARLY && type === ShiftType.EARLY && (earlyStreak.get(member.id) ?? 0) + 1 >= options.maxConsecutiveEarlyDays) return true;
      return currentType === ShiftType.LATE && type === ShiftType.LATE && (lateStreak.get(member.id) ?? 0) + 1 >= options.maxConsecutiveLateDays;
    }
    function weeklyLimit(member: GeneratorStaff, futureDates: Date[]) {
      let limit = member.weeklyAvailableDays ?? 7;
      for (const date of [workDate, ...futureDates]) {
        for (const rule of applicableRules(options.staffWorkRules ?? [], member.id, date)) {
          if (rule.ruleType === StaffWorkRuleType.MAX_WORK_DAYS_PER_WEEK && rule.numericValue != null) limit = Math.min(limit, rule.numericValue);
        }
      }
      return limit;
    }
    function futureAttributeHardLoss(member: GeneratorStaff, plan: { capacities: FutureCandidateCapacity[]; futureDates: Date[] }) {
      if (!options.staffingRequirements?.length) return 0;
      const remaining = plan.capacities.find((item) => item.staffId === member.id)?.remainingDays ?? 0;
      if (remaining !== 1) return 0;
      for (const date of plan.futureDates) {
        for (const requirement of activeRequirements(options.staffingRequirements, date).filter((item) => item.constraintLevel === 'HARD')) {
          if (!hasAttribute(options.staffAttributeAssignments ?? [], member.id, requirement.attributeDefinitionId, date)) continue;
          if (requirement.classType && member.assignedClass !== requirement.classType && member.assignedClass !== AssignedClass.FREE && member.assignedClass !== AssignedClass.SUPPORT) continue;
          const candidates = staff.filter((candidate) =>
            hasAttribute(options.staffAttributeAssignments ?? [], candidate.id, requirement.attributeDefinitionId, date)
            && (!requirement.classType || candidate.assignedClass === requirement.classType || candidate.assignedClass === AssignedClass.FREE || candidate.assignedClass === AssignedClass.SUPPORT)
            && [ShiftType.EARLY, ShiftType.LATE, ShiftType.NORMAL].some((shiftType) => futureEligible(candidate, date, shiftType))
            && (plan.capacities.find((item) => item.staffId === candidate.id)?.remainingDays ?? 0) > 0);
          if (candidates.length <= requirement.requiredCount) return 1;
        }
      }
      return 0;
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
      // Keep the original class/support placement for working staff not selected for coverage.
      for (const requirement of targets) {
        const target = saturday || sunday ? requirement.saturdayRequired : requirement.weekdayRequired; let count = 0;
        const regularCandidates = staff.filter((m) => !m.isDirector && isWorking(day.get(m.id)!.shiftType) && day.get(m.id)!.countsTowardStaffing !== false && !used.has(m.id));
        const directors = staff.filter((m) => m.isDirector && isWorking(day.get(m.id)!.shiftType) && day.get(m.id)!.countsTowardStaffing !== false && !used.has(m.id));
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
        for (const member of candidates) {
          if (count >= target) break;
          const item = day.get(member.id)!;
          if ((item.shiftType === ShiftType.EARLY || item.shiftType === ShiftType.LATE) && [...used].some((staffId) => { const placed = day.get(staffId)!; return placed.assignedClass === requirement.classType && placed.shiftType === item.shiftType; })) continue;
          item.assignedClass = requirement.classType; used.add(member.id); count += 1; if (member.assignedClass !== requirement.classType) add({ code: member.assignedClass === AssignedClass.FREE || member.assignedClass === AssignedClass.SUPPORT ? 'FREE_SUPPORT_COVERAGE' : 'CROSS_CLASS_SUPPORT', level: 'INFO', workDate: key, staffId: member.id, classType: requirement.classType, message: `${member.displayName}さんを${classLabel(requirement.classType)}へ補完配置しました。` });
        }
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
  if (!options.staffingRequirements?.length) return { assignments, warnings, specialShiftSummary, weeklyPatternRelaxations, approvedWeeklyThirdAssignments, futureHardCapacitySummary };
  const staffingRequirementEvaluations = evaluateStaffingRequirements(options.staffingRequirements, options.staffAttributeAssignments ?? [], assignments.filter((item) => isWorking(item.shiftType) && item.countsTowardStaffing !== false));
  warnings.push(...evaluationWarnings(staffingRequirementEvaluations));
  return { assignments, warnings, specialShiftSummary, weeklyPatternRelaxations, approvedWeeklyThirdAssignments, staffingRequirementEvaluations, futureHardCapacitySummary };
}

function classPriority(member: GeneratorStaff, target: AssignedClass) { if (member.assignedClass === target) return 0; if (member.assignedClass === AssignedClass.FREE) return 1; if (member.assignedClass === AssignedClass.SUPPORT) return 2; return 3; }
function isFixedClass(value: AssignedClass) { return value.startsWith('AGE_'); }
function assignment(member: GeneratorStaff, workDate: Date, shiftType: ShiftType, options: GeneratorOptions, note: string | null = null, assignedClass: AssignedClass | null = null, workPatternId?: string | null): GeneratedAssignment { const defaults = timesForMember(shiftType, options, member); return { staffId: member.id, workDate: new Date(workDate), shiftType, workPatternId, startTime: defaults?.startTime ?? null, endTime: defaults?.endTime ?? null, breakMinutes: isWorking(shiftType) ? options.defaultBreakMinutes : null, note, assignedClass: isWorking(shiftType) ? assignedClass : null }; }
function assignmentFromPattern(member:GeneratorStaff,workDate:Date,shiftType:ShiftType,pattern:{id:string;startTime:string|null;endTime:string|null;breakMinutes:number;isWorking:boolean;countsTowardStaffing?:boolean},options:GeneratorOptions,note:string):GeneratedAssignment{const countsTowardStaffing=pattern.countsTowardStaffing!==false;return{staffId:member.id,workDate:new Date(workDate),shiftType,workPatternId:pattern.id,startTime:pattern.startTime,endTime:pattern.endTime,breakMinutes:pattern.isWorking?pattern.breakMinutes:null,note,assignedClass:pattern.isWorking&&countsTowardStaffing&&!member.isDirector?member.assignedClass:null,countsTowardStaffing};}
function timesFor(type: ShiftType, options: GeneratorOptions) { if (type === ShiftType.EARLY) return { startTime: options.defaultStartEarly, endTime: options.defaultEndEarly }; if (type === ShiftType.NORMAL) return { startTime: options.defaultStartNormal, endTime: options.defaultEndNormal }; if (type === ShiftType.LATE) return { startTime: options.defaultStartLate, endTime: options.defaultEndLate }; return shiftTypeDefaults[type]; }
function timesForMember(type: ShiftType, options: GeneratorOptions, member: GeneratorStaff) { if (type === ShiftType.NORMAL && member.regularWorkStartTime && member.regularWorkEndTime) return { startTime: member.regularWorkStartTime, endTime: member.regularWorkEndTime }; return timesFor(type, options); }
function minutesFor(item: GeneratedAssignment) { if (!item.startTime || !item.endTime) return 0; const [sh, sm] = item.startTime.split(':').map(Number); const [eh, em] = item.endTime.split(':').map(Number); return Math.max(0, eh * 60 + em - sh * 60 - sm - (item.breakMinutes ?? 0)); }
function minutesForType(type: ShiftType, options: GeneratorOptions, member: GeneratorStaff) { const times = timesForMember(type, options, member); if (!times) return 0; const [sh, sm] = times.startTime.split(':').map(Number); const [eh, em] = times.endTime.split(':').map(Number); return Math.max(0, eh * 60 + em - sh * 60 - sm - options.defaultBreakMinutes); }
function minutesForPattern(pattern: GeneratorWorkPattern) { if (!pattern.startTime || !pattern.endTime) return 0; const [sh, sm] = pattern.startTime.split(':').map(Number); const [eh, em] = pattern.endTime.split(':').map(Number); return Math.max(0, eh * 60 + em - sh * 60 - sm - pattern.breakMinutes); }
function isWorking(type: ShiftType) { return (workingShiftTypes as readonly ShiftType[]).includes(type); }
function requestTypeToShiftType(type: ShiftRequestType) { if (type === ShiftRequestType.PAID_LEAVE) return ShiftType.PAID_LEAVE; if (type === ShiftRequestType.SUMMER_LEAVE) return ShiftType.SUMMER_LEAVE; return ShiftType.OFF; }
function isHalfDayRequest(type: ShiftRequestType) { return type === ShiftRequestType.HALF_DAY_AM || type === ShiftRequestType.HALF_DAY_PM; }
function halfDayBoundary(startTime: string | null, endTime: string | null) { if (!startTime || !endTime) return null; const [sh, sm] = startTime.split(':').map(Number); const [eh, em] = endTime.split(':').map(Number); const middle = Math.floor(((sh * 60 + sm) + (eh * 60 + em)) / 2); return `${String(Math.floor(middle / 60)).padStart(2, '0')}:${String(middle % 60).padStart(2, '0')}`; }
function iso(value: Date) { return value.toISOString().slice(0, 10); }
function weekKey(value: string) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); return iso(date); }
function isOccurrenceOfWeekday(date: Date, dayOfWeek: number, occurrence: number) { return date.getUTCDay() === dayOfWeek && Math.floor((date.getUTCDate() - 1) / 7) + 1 === occurrence; }
function classLabel(value: AssignedClass) { return value.replace('AGE_', '') + (value.startsWith('AGE_') ? '歳児' : value); }
