import { readProvisionalSoftRules } from './provisional-soft-rules';
import { hasApprovedFixedTime } from './approved-fixed-time';
import { ShiftRequestType, ShiftType, StaffingConstraintLevel, StaffWorkRuleType } from '@prisma/client';
import type { MonthlyGenerationContext } from './monthly-generation-context-builder';
import { jsonStrings } from './monthly-generation-context-builder';
import { activeRequirements, evaluateStaffingRequirements } from './staffing-requirement-evaluator';
import { fixedRule, patternType, prohibitionConflict } from './staff-work-rule-evaluator';

export type GenerationDiagnosticSeverity = 'INFO' | 'WARNING' | 'ERROR';
export type GenerationDiagnosticCategory = 'INFO' | 'WARNING' | 'BUSINESS_DECISION_REQUIRED' | 'SYSTEM_SAFETY_BLOCK';
export type GenerationDiagnostic = { severity: GenerationDiagnosticSeverity; category: GenerationDiagnosticCategory; code: string; staffId: string | null; date: string; source: string; reason: string; impact: string; allowedActions: string[]; overrideAllowed: boolean };
type DiagnosticInput = Omit<GenerationDiagnostic, 'category' | 'impact' | 'overrideAllowed'> & Partial<Pick<GenerationDiagnostic, 'category' | 'impact' | 'overrideAllowed'>>;

const systemSafetyCodes = new Set([
  'FEATURE_LOOKUP_FAILED', 'INVALID_EXCEPTION_PERIOD', 'INVALID_RULE_EXCEPTION_REFERENCE',
  'INVALID_EXCEPTION_PROVENANCE',
  'FIXED_GENERATOR_DOUBLE_HANDLING', 'FIXED_CONTRACT_UNRESOLVED', 'INVALID_WORK_RULE_PERIOD',
  'EVENT_UNKNOWN_STAFF', 'EVENT_UNKNOWN_WORK_PATTERN',
  'GENERATION_CONTEXT_UNAVAILABLE', 'INVALID_PROVISIONAL_SOFT_RULE',
]);

export function classifyGenerationDiagnostic(issue: DiagnosticInput): GenerationDiagnostic {
  const category = issue.category ?? (issue.severity === 'INFO' ? 'INFO' : issue.severity === 'WARNING' ? 'WARNING' : systemSafetyCodes.has(issue.code) ? 'SYSTEM_SAFETY_BLOCK' : 'BUSINESS_DECISION_REQUIRED');
  return {
    ...issue,
    category,
    overrideAllowed: issue.overrideAllowed ?? category === 'BUSINESS_DECISION_REQUIRED',
    impact: issue.impact ?? (category === 'SYSTEM_SAFETY_BLOCK'
      ? '正式データまたはシステム安全性を保証できないため、生成・確定を続行できません。'
      : category === 'BUSINESS_DECISION_REQUIRED'
        ? '未判断のままでは自動生成またはFINAL確定へ進めません。管理者が勤務変更・条件修正・対象限定例外のいずれかを選ぶ必要があります。'
        : '勤務表の確定可否には直接影響しませんが、内容を確認してください。'),
  };
}

const fullLeave = new Set<ShiftRequestType>([ShiftRequestType.DAY_OFF, ShiftRequestType.PAID_LEAVE, ShiftRequestType.SUMMER_LEAVE, ShiftRequestType.BEREAVEMENT]);
const working = new Set<ShiftType>([ShiftType.EARLY, ShiftType.NORMAL, ShiftType.LATE, ShiftType.AM_HALF, ShiftType.PM_HALF, ShiftType.OTHER]);
const iso = (value: Date) => value.toISOString().slice(0, 10);

export function validateGenerationContext(context: MonthlyGenerationContext, phase: 'PRECHECK' | 'GENERATE' | 'CONFIRM'): GenerationDiagnostic[] {
  const issues: DiagnosticInput[] = [];
  const add = (issue: DiagnosticInput) => issues.push(issue);
  const month = iso(context.range.start);
  for (const [code, state] of Object.entries(context.features)) if (state.lookupFailed) add({ severity: 'ERROR', code: 'FEATURE_LOOKUP_FAILED', staffId: null, date: month, source: `TenantFeature:${code}`, reason: `${code}の有効状態を確認できません。正式条件を欠いたまま生成・確定できません。`, allowedActions: ['Feature設定を確認して再試行する'] });
  for (const request of context.pendingRequests) add({ severity: 'INFO', code: 'PENDING_REQUEST_REVIEW', staffId: request.staffId, date: iso(request.requestDate), source: `ShiftRequest:${request.id}`, reason: '申請中の希望があります。未承認のため自動生成条件には使用しません。', allowedActions: ['承認する', '却下する', '申請内容を確認する'] });

  const staffById = new Map(context.staff.map((staff) => [staff.id, staff]));
  const patternByCode = new Map(context.workPatterns.map((pattern) => [pattern.code, pattern]));
  const baseAssignmentExceptionKey = new Set<string>(); const hardOverrideKey = new Set<string>();
  for (const exception of context.ruleExceptions) {
    if(exception.exceptionType.startsWith('MANAGER_REVIEW:')) continue;
    const date = iso(exception.exceptionDate);
    const invalidPeriod = (exception.effectiveFrom && exception.effectiveFrom > exception.exceptionDate) || (exception.effectiveTo && exception.effectiveTo < exception.exceptionDate) || (exception.effectiveFrom && exception.effectiveTo && exception.effectiveFrom > exception.effectiveTo);
    const invalidProvenance = exception.sourceType !== 'ADMIN_CONFIRMED' || !exception.confirmedAt || !exception.confirmedBy || !exception.reason?.trim();
    if (invalidPeriod) add({ severity: 'ERROR', code: 'INVALID_EXCEPTION_PERIOD', staffId: null, date, source: `TenantRuleException:${exception.id}`, reason: '日付限定例外の有効期間と例外日が一致しません。', allowedActions: ['例外の有効期間を修正する', '例外を無効化する'] });
    if (invalidProvenance) add({ severity: 'ERROR', code: 'INVALID_EXCEPTION_PROVENANCE', staffId: null, date, source: `TenantRuleException:${exception.id}`, reason: '管理者例外の確認者・確認日時・理由・ADMIN_CONFIRMED出典が不足しています。', allowedActions: ['不正な例外を無効化する', '管理者が内容を再確認して登録し直す'] });
    const config = objectValue(exception.configuration); const staffCode = stringValue(config.staffCode); const patternCode = stringValue(config.workPatternCode);
    if (staffCode) {
      const staff = context.staff.find((row) => row.employeeNumber === staffCode);
      if (!staff || (patternCode && !patternByCode.has(patternCode))) add({ severity: 'ERROR', code: 'INVALID_RULE_EXCEPTION_REFERENCE', staffId: staff?.id ?? null, date, source: `TenantRuleException:${exception.id}`, reason: '日付限定例外が存在しない職員または勤務パターンを参照しています。', allowedActions: ['例外内容を修正する', '例外を無効化する'] });
      else if (!invalidPeriod && !invalidProvenance) { const type=exception.exceptionType.split(':')[0]; if(type==='STAFF_WORK_PATTERN')baseAssignmentExceptionKey.add(`${staff.id}:${date}`); if(type==='HARD_RULE_OVERRIDE')hardOverrideKey.add(`${staff.id}:${date}`); }
    }
  }
  const customConfig = context.features.TENANT_CUSTOM_RULES.configuration;
  if (context.features.TENANT_CUSTOM_RULES.enabled) try {
    readProvisionalSoftRules(customConfig.release1ProvisionalSoftRules, context.staff, context.workPatterns);
  } catch {
    add({ severity: 'ERROR', code: 'INVALID_PROVISIONAL_SOFT_RULE', staffId: null, date: month, source: 'TenantFeature:TENANT_CUSTOM_RULES', reason: '暫定SOFT条件の出典または職員・勤務パターン参照が不正です。', allowedActions: ['暫定条件の設定を確認する'] });
  }
  if (Array.isArray(customConfig.approvedWeeklyThirdAssignmentExceptions) && customConfig.approvedWeeklyThirdAssignmentExceptions.length) add({ severity: 'WARNING', code: 'LEGACY_RULE_EXCEPTION_PRESENT', staffId: null, date: month, source: 'TenantFeature:TENANT_CUSTOM_RULES', reason: 'Feature設定に旧形式の承認例外があります。runtime条件には使用しません。', allowedActions: ['TenantRuleExceptionへ移行する', '旧設定を削除する'] });

  for (const staffId of context.fixedStaffIds) {
    const staff = staffById.get(staffId); const contracts = context.contracts.filter((row) => row.staffId === staffId && !row.voidedAt);
    if (!context.excludedStaffIds.has(staffId)) add({ severity: 'ERROR', code: 'FIXED_GENERATOR_DOUBLE_HANDLING', staffId, date: month, source: 'StaffAttributeAssignment', reason: '固定勤務対象がrotation除外になっていません。二重生成の可能性があります。', allowedActions: ['GENERATOR_EXCLUDED属性を設定する', 'FIXED_ASSIGNMENT属性を解除する'] });
    if (!staff?.regularWorkStartTime || !staff.regularWorkEndTime || (contracts.length !== 1 && !(contracts.length === 0 && hasApprovedFixedTime(context.workRules, staffId, staff.regularWorkStartTime, staff.regularWorkEndTime, context.range)))) add({ severity: 'ERROR', code: 'FIXED_CONTRACT_UNRESOLVED', staffId, date: month, source: 'StaffWorkContract', reason: '固定勤務に必要な有効契約または互換勤務時刻を一意に確定できません。', allowedActions: ['勤務契約を確認する', '固定勤務時刻を設定する'] });
  }

  for (const request of context.approvedRequests.filter((row) => row.requestType === ShiftRequestType.HALF_DAY_AM || row.requestType === ShiftRequestType.HALF_DAY_PM)) {
    const date = iso(request.requestDate); const fixed = fixedRule(context.workRules, request.staffId, request.requestDate);
    const storedBase = phase === 'CONFIRM' && context.assignments.some((assignment) => assignment.staffId === request.staffId && iso(assignment.workDate) === date && working.has(assignment.shiftType) && !!assignment.attendanceModifier);
    if (!fixed && !storedBase && !context.fixedStaffIds.has(request.staffId) && !baseAssignmentExceptionKey.has(`${request.staffId}:${date}`)) add({ severity: 'ERROR', code: 'HALF_DAY_BASE_ASSIGNMENT_UNCONFIRMED', staffId: request.staffId, date, source: `ShiftRequest:${request.id}`, reason: `${date} ${staffById.get(request.staffId)?.displayName ?? request.staffId}さん：半休申請がありますが基礎勤務が未確定です。`, allowedActions: ['基礎勤務を指定する', '申請内容を確認する', '保留して戻る'] });
  }

  for (const rule of context.workRules) if ((rule.startDate && rule.endDate && rule.startDate > rule.endDate) || (rule.dayOfWeek != null && (rule.dayOfWeek < 0 || rule.dayOfWeek > 6))) add({ severity: 'ERROR', code: 'INVALID_WORK_RULE_PERIOD', staffId: rule.staffId, date: rule.startDate ? iso(rule.startDate) : month, source: `StaffWorkRule:${rule.id}`, reason: '勤務ルールの有効期間または曜日が不正です。', allowedActions: ['勤務ルールを修正する', '勤務ルールを無効化する'] });

  for (const event of context.events.filter((row) => row.affectsGeneration)) {
    const date = iso(event.eventDate); const targetCodes = jsonStrings(event.targetStaffCodes); const allowedCodes = jsonStrings(event.allowedWorkPatternCodes);
    for (const code of targetCodes) if (!context.staff.some((staff) => staff.employeeNumber === code)) add({ severity: 'ERROR', code: 'EVENT_UNKNOWN_STAFF', staffId: null, date, source: `TenantEvent:${event.id}`, reason: `行事「${event.name}」が存在しない職員コードを参照しています。`, allowedActions: ['行事の対象職員を修正する'] });
    for (const code of allowedCodes) if (!patternByCode.has(code)) add({ severity: 'ERROR', code: 'EVENT_UNKNOWN_WORK_PATTERN', staffId: null, date, source: `TenantEvent:${event.id}`, reason: `行事「${event.name}」が存在しない勤務パターンを参照しています。`, allowedActions: ['行事の許可勤務を修正する'] });
  }

  if (phase === 'CONFIRM') {
    issues.push(...validateWeeklyRotationLimits(context));
    const requestByKey = new Map(context.approvedRequests.map((row) => [`${row.staffId}:${iso(row.requestDate)}`, row]));
    for (const assignment of context.assignments) {
      const date = iso(assignment.workDate); const request = requestByKey.get(`${assignment.staffId}:${date}`);
      const closed = context.closedDates.some((row) => iso(row.closedDate) === date) || (context.shiftSetting?.sundayOperationEnabled === false && assignment.workDate.getUTCDay() === 0);
      if (closed && working.has(assignment.shiftType)) add({ severity: 'ERROR', code: 'CLOSED_DATE_WORK_CONFLICT', staffId: assignment.staffId, date, source: 'TenantClosedDate/TenantShiftSetting', reason: '休園日または非営業の日曜日に勤務が割り当てられています。', allowedActions: ['勤務を休みに変更する', '休園日・日曜設定を確認する'] });
      if (request && fullLeave.has(request.requestType) && working.has(assignment.shiftType)) add({ severity: 'ERROR', code: 'APPROVED_REQUEST_CONFLICT', staffId: assignment.staffId, date, source: `ShiftRequest:${request.id}`, reason: '承認済み休暇と勤務Assignmentが競合しています。', allowedActions: ['勤務を休暇へ変更する', '申請承認を見直す'] });
      const type = assignment.workPattern?.code && Object.values(ShiftType).includes(assignment.workPattern.code as ShiftType) ? assignment.workPattern.code as ShiftType : assignment.shiftType;
      const conflict = prohibitionConflict(context.workRules, assignment.staffId, assignment.workDate, type, assignment.startTime && assignment.endTime ? { startTime: assignment.startTime, endTime: assignment.endTime } : null, assignment.workPatternId ?? undefined);
      if (conflict?.isHardConstraint && !hardOverrideKey.has(`${assignment.staffId}:${date}`)) add({ severity: 'ERROR', code: 'HARD_WORK_RULE_CONFLICT', staffId: assignment.staffId, date, source: `StaffWorkRule:${conflict.id}`, reason: '確定予定の勤務がHARD勤務禁止条件に違反しています。', allowedActions: ['勤務を変更する', 'その日だけ例外として承認する', '条件を確認して再生成する', '保留して戻る'] });
      const fixed = fixedRule(context.workRules, assignment.staffId, assignment.workDate); const fixedType = fixed ? patternType(fixed) : null;
      if (!closed && fixed?.isHardConstraint && fixedType && fixedType !== type && !hardOverrideKey.has(`${assignment.staffId}:${date}`)) add({ severity: 'ERROR', code: 'HARD_FIXED_ASSIGNMENT_CONFLICT', staffId: assignment.staffId, date, source: `StaffWorkRule:${fixed.id}`, reason: '確定予定の勤務がHARD固定勤務と一致しません。', allowedActions: ['勤務を固定勤務へ変更する', 'その日だけ例外として承認する', '保留して戻る'] });
      for (const event of context.events.filter((row) => row.affectsGeneration && iso(row.eventDate) === date)) {
        if (event.fixedTimeStaffAllowed && context.fixedStaffIds.has(assignment.staffId)) continue;
        const targetCodes = jsonStrings(event.targetStaffCodes); const targetClasses = jsonStrings(event.targetClasses); const staff = staffById.get(assignment.staffId);
        if (targetCodes.length && !targetCodes.includes(staff?.employeeNumber ?? '')) continue;
        if (targetClasses.length && !targetClasses.includes(staff?.assignedClass ?? '')) continue;
        const allowedCodes = jsonStrings(event.allowedWorkPatternCodes);
        if (allowedCodes.length && !allowedCodes.includes(assignment.workPattern?.code ?? assignment.shiftType)) add({ severity: 'ERROR', code: 'EVENT_WORK_PATTERN_CONFLICT', staffId: assignment.staffId, date, source: `TenantEvent:${event.id}`, reason: `行事「${event.name}」で許可されていない勤務です。`, allowedActions: ['勤務を変更する', '行事条件を確認する', '日付限定例外を登録する'] });
      }
    }
    const custom = context.features.TENANT_CUSTOM_RULES.configuration;
    const transitions = Array.isArray(custom.nextDayBlockedPatternTransitions) ? custom.nextDayBlockedPatternTransitions.map(objectValue) : [];
    const byStaff = new Map<string, typeof context.assignments>();
    for (const assignment of context.assignments) { const rows = byStaff.get(assignment.staffId) ?? []; rows.push(assignment); byStaff.set(assignment.staffId, rows); }
    for (const [staffId, rows] of byStaff) {
      const ordered = rows.slice().sort((a, b) => a.workDate.getTime() - b.workDate.getTime());
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1]; const current = ordered[index]; if (current.workDate.getTime() - previous.workDate.getTime() !== 86400000) continue;
        const from = previous.workPattern?.code ?? previous.shiftType; const to = current.workPattern?.code ?? current.shiftType;
        if (transitions.some((row) => stringArray(row.fromPatternCodes).includes(from) && stringArray(row.toPatternCodes).includes(to))) add({ severity: 'ERROR', code: 'BLOCKED_PATTERN_TRANSITION', staffId, date: iso(current.workDate), source: 'TenantFeature:TENANT_CUSTOM_RULES', reason: `${from}の翌日に${to}が割り当てられています。`, allowedActions: ['翌日の勤務を変更する', '前日の勤務を変更する', '条件を確認して再生成する'] });
      }
    }
    const closedKeys = new Set(context.closedDates.map((row) => iso(row.closedDate)));
    if (context.features.ADVANCED_STAFFING_REQUIREMENTS.enabled) for (const evaluation of evaluateStaffingRequirements(context.staffingRequirements, context.attributes, context.assignments.map((row) => ({ staffId: row.staffId, workDate: row.workDate, shiftType: row.shiftType, workPatternId: row.workPatternId, startTime: row.startTime, endTime: row.endTime, breakMinutes: row.breakMinutes, note: row.note, assignedClass: row.assignedClass })))) if (!closedKeys.has(evaluation.date) && !(context.shiftSetting?.sundayOperationEnabled === false && new Date(`${evaluation.date}T00:00:00.000Z`).getUTCDay() === 0) && evaluation.constraintLevel === StaffingConstraintLevel.HARD && !evaluation.isSatisfied) add({ severity: 'ERROR', code: 'STAFFING_REQUIREMENT_HARD', staffId: null, date: evaluation.date, source: `ShiftStaffingRequirement:${evaluation.requirementId}`, reason: evaluation.message, allowedActions: ['勤務を変更する', '必要人数条件を確認する', '日付限定例外を登録する'] });
    if (context.features.ADVANCED_STAFFING_REQUIREMENTS.enabled) for (const requirement of context.conditionalStaffingRequirements.filter((row) => row.constraintLevel === StaffingConstraintLevel.HARD)) for (const date of [...new Set(context.assignments.map((row) => iso(row.workDate)))]) {
      const workDate = new Date(`${date}T00:00:00.000Z`); if (closedKeys.has(date) || (context.shiftSetting?.sundayOperationEnabled === false && workDate.getUTCDay() === 0) || (requirement.startDate && requirement.startDate > workDate) || (requirement.endDate && requirement.endDate < workDate) || (requirement.dayOfWeek != null && requirement.dayOfWeek !== workDate.getUTCDay())) continue;
      const day = context.assignments.filter((row) => iso(row.workDate) === date); const triggerCount = day.filter((row) => row.workPatternId === requirement.triggerWorkPatternId && hasActiveAttribute(context, row.staffId, requirement.triggerAttributeDefinitionId, workDate)).length;
      if (triggerCount < requirement.triggerCount) continue; const targetCount = new Set(day.filter((row) => row.workPatternId === requirement.targetWorkPatternId && hasActiveAttribute(context, row.staffId, requirement.targetAttributeDefinitionId, workDate)).map((row) => row.staffId)).size;
      if (targetCount < requirement.requiredCount) add({ severity: 'ERROR', code: 'CONDITIONAL_STAFFING_REQUIREMENT_HARD', staffId: null, date, source: `ConditionalShiftStaffingRequirement:${requirement.id}`, reason: `${requirement.name}は${requirement.requiredCount}名必要ですが、${targetCount}名しか配置されていません。`, allowedActions: ['勤務を変更する', '条件付き必要人数を確認する', '日付限定例外を登録する'] });
    }
  } else if (context.features.ADVANCED_STAFFING_REQUIREMENTS.enabled) {
    for (let date = new Date(context.range.start); date < context.range.end; date.setUTCDate(date.getUTCDate() + 1)) for (const requirement of activeRequirements(context.staffingRequirements, date).filter((row) => row.constraintLevel === StaffingConstraintLevel.HARD)) {
      const candidates = context.staff.filter((staff) => context.attributes.some((attribute) => attribute.staffId === staff.id && attribute.attributeDefinitionId === requirement.attributeDefinitionId && (!attribute.startDate || attribute.startDate <= date) && (!attribute.endDate || attribute.endDate >= date)));
      if (candidates.length < requirement.requiredCount) add({ severity: 'ERROR', code: 'STAFFING_REQUIREMENT_IMPOSSIBLE', staffId: null, date: iso(date), source: `ShiftStaffingRequirement:${requirement.id}`, reason: `${requirement.name}は${requirement.requiredCount}名必要ですが、属性を持つ候補者が${candidates.length}名しかいません。`, allowedActions: ['職員条件を確認する', '必要人数条件を確認する'] });
    }
  }
  return dedupe(issues.map(classifyGenerationDiagnostic));
}

export function hasBlockingDiagnostics(diagnostics: GenerationDiagnostic[]) { return diagnostics.some((item) => item.severity === 'ERROR'); }

export function validateWeeklyRotationLimits(context: MonthlyGenerationContext): GenerationDiagnostic[] {
  const configuration = objectValue(context.features.TENANT_CUSTOM_RULES.configuration.weeklyPatternGroupLimit);
  const patternCodes = new Set(stringArray(configuration.patternCodes));
  if (!patternCodes.size) return [];
  const baseMaximum = numberValue(configuration.maxPerWeek) ?? 1;
  const relaxation = objectValue(configuration.relaxation);
  const normalMaximum = relaxation.enabled === true && relaxation.activationMode === 'FORMAL' ? Math.max(baseMaximum, numberValue(relaxation.maxPerWeek) ?? baseMaximum) : baseMaximum;
  const exemptAttributeCode = stringValue(configuration.exemptAttributeCode);
  const exemptStaffIds = new Set(context.attributes.filter((row) => row.attributeDefinition.code === exemptAttributeCode).map((row) => row.staffId));
  const ignoredStaffIds = new Set([...context.fixedStaffIds, ...context.excludedStaffIds, ...exemptStaffIds]);
  const rows = (context.weekBoundaryAssignments.length ? context.weekBoundaryAssignments : context.assignments).filter((row) => !ignoredStaffIds.has(row.staffId) && patternCodes.has(rotationCode(row)));
  const buckets = new Map<string, typeof rows>();
  for (const row of rows) { const key = `${row.staffId}:${monday(row.workDate)}`; const values = buckets.get(key) ?? []; values.push(row); buckets.set(key, values); }
  const exceptions = context.ruleExceptions.filter((row) => row.exceptionType.split(':')[0] === 'WEEKLY_ROTATION_LIMIT' && row.sourceType === 'ADMIN_CONFIRMED' && !!row.confirmedAt).flatMap((row) => {
    const config = objectValue(row.configuration); const maximum = numberValue(config.maxWeeklyRotationCount); const capacity = numberValue(config.maxAssignments);
    return maximum != null && maximum >= 3 && maximum <= 7 && capacity != null && capacity > 0 ? [{ id: row.id, date: iso(row.exceptionDate), maximum, capacity }] : [];
  });
  const claimsByDate = new Map<string, Array<{ staffId: string; week: string; rows: typeof rows }>>(); const violations: GenerationDiagnostic[] = [];
  for (const [key, values] of buckets) {
    const [staffId, week] = splitBucketKey(key); const ordered = values.slice().sort((a, b) => a.workDate.getTime() - b.workDate.getTime());
    if (ordered.length <= normalMaximum) continue;
    const decisionDate = iso(ordered[normalMaximum].workDate); const claims = claimsByDate.get(decisionDate) ?? []; claims.push({ staffId, week, rows: ordered }); claimsByDate.set(decisionDate, claims);
  }
  for (const [date, claims] of claimsByDate) {
    const candidates = exceptions.filter((row) => row.date === date); const orderedClaims = claims.slice().sort((a, b) => (context.staff.find((row) => row.id === a.staffId)?.employeeNumber ?? a.staffId).localeCompare(context.staff.find((row) => row.id === b.staffId)?.employeeNumber ?? b.staffId));
    let used = 0;
    for (const claim of orderedClaims) {
      const exception = candidates.find((row) => row.maximum >= claim.rows.length && used < row.capacity);
      if (exception) { used += 1; continue; }
      violations.push(weeklyViolation(context, claim.staffId, claim.week, claim.rows, normalMaximum, candidates.length ? '管理者承認済み例外の許可人数または許容回数を超えています。' : '週上限超過に対応する管理者承認済みの日付限定例外がありません。'));
    }
  }
  return violations;
}

function weeklyViolation(context: MonthlyGenerationContext, staffId: string, week: string, rows: MonthlyGenerationContext['assignments'], allowed: number, detail: string, canApproveThird = true): GenerationDiagnostic {
  const member = context.staff.find((row) => row.id === staffId); const dates = rows.map((row) => iso(row.workDate)).sort();
  return classifyGenerationDiagnostic({ severity: 'ERROR', code: rows.length >= 4 ? 'WEEKLY_ROTATION_WEEK4_PLUS' : 'WEEKLY_ROTATION_LIMIT_UNAPPROVED', staffId, date: week, source: 'TenantFeature:TENANT_CUSTOM_RULES/TenantRuleException', reason: `${member?.displayName ?? staffId}さん：${week}開始週の対象ローテーション勤務は現在${rows.length}回、許容${allowed}回です。違反日：${dates.join('、')}。${detail}`, impact: `この勤務を維持すると週${rows.length}回になります。変更する場合は該当日の必要人数も再確認してください。`, allowedActions: ['Assignmentを修正する', ...(canApproveThird ? ['週上限の日付限定例外を承認する'] : []), '条件を再確認する'] });
}

function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown) { return typeof value === 'string' ? value : null; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function numberValue(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function monday(value: Date) { const date = new Date(value); const day = (date.getUTCDay() + 6) % 7; date.setUTCDate(date.getUTCDate() - day); return iso(date); }
function splitBucketKey(value: string): [string, string] { const separator = value.lastIndexOf(':'); return [value.slice(0, separator), value.slice(separator + 1)]; }
function rotationCode(row: { shiftType: ShiftType; workPattern?: { code: string } | null }) { return row.shiftType === ShiftType.OTHER ? row.workPattern?.code ?? row.shiftType : row.shiftType; }
function hasActiveAttribute(context: MonthlyGenerationContext, staffId: string, attributeDefinitionId: string, date: Date) { return context.attributes.some((row) => row.staffId === staffId && row.attributeDefinitionId === attributeDefinitionId && (!row.startDate || row.startDate <= date) && (!row.endDate || row.endDate >= date)); }
function dedupe(items: GenerationDiagnostic[]) { const seen = new Set<string>(); return items.filter((item) => { const key = `${item.code}:${item.staffId}:${item.date}:${item.source}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
