import type { GeneratedAssignment, GenerationWarning, GeneratorOptions, GeneratorStaff } from './rule-based-shift-generator';
import { fixedRule } from './staff-work-rule-evaluator';

// Private replay choices are candidate filters, never fixed rules or HARD overrides.
export type ReplayChoices = Map<string, string>;
export type ReassignmentTrace = Map<string, { normal: string[]; relaxed: string[] }>;
type Result = { assignments: GeneratedAssignment[]; warnings: GenerationWarning[]; staffingRequirementEvaluations?: Array<{ requirementId: string; date: string; constraintLevel: string; isSatisfied: boolean; requiredCount: number; actualCount: number }> };
const MAX_ATTEMPTS = 32;
const MAX_PLANS = 1024;
const MAX_CANDIDATES = 12;
const MAX_REPAIRS = 8;
const NORMAL = '@NORMAL';
const day = (date: Date) => date.toISOString().slice(0, 10);
const week = (date: Date) => { const d = new Date(date); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return day(d); };
export const replayKey = (id: string, date: Date) => `${id}:${day(date)}`;
export const replayValue = (row: Pick<GeneratedAssignment, 'shiftType' | 'workPatternId'>) => row.shiftType === 'NORMAL' ? NORMAL : row.workPatternId ?? row.shiftType;

export function hardDeficits(result: Result) {
  const values = new Map<string, number>();
  for (const row of result.warnings.filter(row => row.level === 'ERROR' && row.code !== 'STAFFING_REQUIREMENT_HARD')) {
    const key = `${row.code}:${row.workDate}:${row.staffId ?? ''}:${row.classType ?? ''}:${row.details?.requirementCode ?? (row.code === 'WORK_PATTERN_REQUIREMENT_SHORTAGE' ? row.message : '')}`;
    values.set(key, Math.max(values.get(key) ?? 0, row.required != null && row.assigned != null ? Math.max(1, row.required - row.assigned) : 1));
  }
  for (const row of result.staffingRequirementEvaluations ?? []) if (row.constraintLevel === 'HARD' && !row.isSatisfied) values.set(`requirement:${row.requirementId}:${row.date}`, row.requiredCount - row.actualCount);
  return values;
}

/** Try a three-cell exchange only after the ordinary weekly rescue is exhausted.
 * Replay the existing generator with exact choices, so all its eligibility checks,
 * counters, fixed/leave processing, class placement and diagnostics run again.
 */
export function repairSameWeek<T extends Result>(initial: T, staff: GeneratorStaff[], options: GeneratorOptions, trace: ReassignmentTrace,
  replay: (choices: ReplayChoices, trace: ReassignmentTrace) => T, requested: Set<string>) {
  let result = initial;
  const summary = { attempts: 0, examined: 0, accepted: 0, maxPlans: MAX_PLANS, maxAttempts: MAX_ATTEMPTS, maxCandidates: MAX_CANDIDATES, maxRepairs: MAX_REPAIRS, limitReached: false };
  const seen = new Set<string>();
  const changes: Array<{ date: string; earlierDate: string; staffId: string; replacementStaffId: string; patternId: string }> = [];
  if (options.sameWeekReassignment === false || !options.weeklyPatternRelaxation?.enabled) return { ...result, sameWeekReassignment: summary };
  const staffIds = new Set(staff.map(row => row.id));
  const normal = (row: GeneratedAssignment) => row.shiftType === 'NORMAL' && row.startTime && row.endTime && !row.attendanceModifier && row.countsTowardStaffing !== false;
  const mutable = (row: GeneratedAssignment) => staffIds.has(row.staffId) && !requested.has(replayKey(row.staffId, row.workDate)) && !fixedRule(options.staffWorkRules ?? [], row.staffId, row.workDate);
  const finish = () => {
    summary.limitReached = summary.attempts >= MAX_ATTEMPTS || summary.examined >= MAX_PLANS || summary.accepted >= MAX_REPAIRS;
    for (const change of changes) result.warnings.push({ code: 'SAME_WEEK_REASSIGNMENT_APPLIED', level: 'INFO', workDate: change.date,
      message: '同一週の合法な勤務交換により必要人数を補完しました。固定・休暇・週上限は変更していません。', details: change });
    if (initial.warnings.some(row => row.code === 'PROVISIONAL_SOFT_DEFERRED_FOR_HARD') && !result.warnings.some(row => row.code === 'PROVISIONAL_SOFT_DEFERRED_FOR_HARD')) result.warnings.push(initial.warnings.find(row => row.code === 'PROVISIONAL_SOFT_DEFERRED_FOR_HARD')!);
    return { ...result, sameWeekReassignment: summary };
  };
  while (summary.attempts < MAX_ATTEMPTS && summary.accepted < MAX_REPAIRS) {
    let improved = false;
    const deficits = hardDeficits(result);
    const shortages = (result.staffingRequirementEvaluations ?? []).filter(row => row.constraintLevel === 'HARD' && !row.isSatisfied).sort((a, b) => a.date.localeCompare(b.date) || a.requirementId.localeCompare(b.requirementId));
    outer: for (const shortage of shortages) {
      const requirement = options.staffingRequirements?.find(row => row.id === shortage.requirementId);
      const patternId = requirement?.workPatternId;
      const group = options.weeklyPatternGroups?.find(row => patternId && row.workPatternIds?.includes(patternId));
      if (!patternId || !group || !requirement?.workPattern) continue;
      const date = new Date(`${shortage.date}T00:00:00.000Z`);
      const rankings = trace.get(`${shortage.date}:${patternId}`);
      const available = result.assignments.filter(row => day(row.workDate) === shortage.date && normal(row) && mutable(row));
      const rank = (ids: string[] | undefined, id: string) => { const index = ids?.indexOf(id) ?? -1; return index < 0 ? Number.MAX_SAFE_INTEGER : index; };
      // Reuse the existing weekly-rescue ranking (SOFT, existing fairness, ID tie-break).
      const movers = available.sort((a, b) => rank(rankings?.relaxed, a.staffId) - rank(rankings?.relaxed, b.staffId)).slice(0, MAX_CANDIDATES);
      for (const target of movers) {
        const earlier = result.assignments.filter(row => row.staffId === target.staffId && row.workDate < date && week(row.workDate) === week(date)
          && row.workPatternId && group.workPatternIds?.includes(row.workPatternId) && mutable(row) && !row.attendanceModifier).sort((a, b) => +a.workDate - +b.workDate);
        for (const old of earlier) {
          const earlierRank = trace.get(`${day(old.workDate)}:${old.workPatternId}`)?.normal;
          const replacements = result.assignments.filter(row => row.staffId !== target.staffId && +row.workDate === +old.workDate && normal(row) && mutable(row))
            .sort((a, b) => rank(earlierRank, a.staffId) - rank(earlierRank, b.staffId)).slice(0, MAX_CANDIDATES);
          for (const replacement of replacements) {
            if (summary.examined >= MAX_PLANS) return finish();
            summary.examined += 1;
            const signature = `${summary.accepted}:${shortage.date}:${target.staffId}:${day(old.workDate)}:${old.workPatternId}:${replacement.staffId}`;
            if (seen.has(signature)) continue;
            seen.add(signature);
            const choices: ReplayChoices = new Map(result.assignments.map(row => [replayKey(row.staffId, row.workDate), replayValue(row)]));
            choices.set(replayKey(old.staffId, old.workDate), NORMAL);
            choices.set(replayKey(replacement.staffId, replacement.workDate), old.workPatternId!);
            choices.set(replayKey(target.staffId, date), patternId);
            // Never manufacture a third assignment, even if a separate explicit
            // third-assignment exception happens to exist elsewhere in the input.
            const withinWeeklyCaps = [target.staffId, replacement.staffId].every(id => (options.weeklyPatternGroups ?? []).every(g => {
              if (options.weeklyPatternGroupExemptStaffIds?.includes(id)) return true;
              const current = result.assignments.filter(row => row.staffId === id && week(row.workDate) === week(date));
              const count = current.filter(row => g.workPatternIds?.includes(choices.get(replayKey(id, row.workDate))!)).length
                + (options.priorAssignments ?? []).filter(row => row.staffId === id && week(row.workDate) === week(date) && (g.workPatternIds?.includes(row.workPatternId ?? '') || g.shiftTypes?.includes(row.shiftType))).length;
              return count <= Math.min(2, options.weeklyPatternRelaxation?.maxPerWeek ?? g.maxPerWeek);
            }));
            if (!withinWeeklyCaps) continue;
            if (summary.attempts >= MAX_ATTEMPTS) return finish();
            summary.attempts += 1;
            const nextTrace: ReassignmentTrace = new Map();
            const candidate = replay(choices, nextTrace);
            // Reject any lost/changed pinned assignment, not just the three edits.
            // Fixed and leave processing may legitimately refuse a proposed choice.
            if (candidate.assignments.length !== result.assignments.length || candidate.assignments.some(row => choices.get(replayKey(row.staffId, row.workDate)) !== replayValue(row))) continue;
            const after = hardDeficits(candidate);
            if ([...after].some(([key, count]) => count > (deficits.get(key) ?? 0))) continue;
            const targetEvaluation = candidate.staffingRequirementEvaluations?.find(row => row.requirementId === shortage.requirementId && row.date === shortage.date);
            if (!targetEvaluation || targetEvaluation.actualCount <= shortage.actualCount) continue;
            // Outside this week even class/time changes are out of scope.
            const previousRows = new Map(result.assignments.map(row => [replayKey(row.staffId, row.workDate), row]));
            if (candidate.assignments.some(row => week(row.workDate) !== week(date) && JSON.stringify(row) !== JSON.stringify(previousRows.get(replayKey(row.staffId, row.workDate))))) continue;
            result = candidate; trace = nextTrace; summary.accepted += 1; improved = true;
            changes.push({ date: shortage.date, earlierDate: day(old.workDate), staffId: target.staffId, replacementStaffId: replacement.staffId, patternId });
            break outer;
          }
        }
      }
    }
    if (!improved) break;
  }
  return finish();
}
