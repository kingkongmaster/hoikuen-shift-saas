/** Monthly decisions are not permanent rules. Answers remain blocked until applied and revalidated. */
export type MonthlyEffect =
 | { type: 'REQUEST'; requestType: 'DAY_OFF' | 'PAID_LEAVE' | 'SUMMER_LEAVE' | 'HALF_DAY_AM' | 'HALF_DAY_PM' | 'BEREAVEMENT' }
 | { type: 'PATTERN'; code: string; startTime?: string; endTime?: string }
 | { type: 'TIME'; startTime: string; endTime: string; basePatternCode: string }
 | { type: 'REMOVE_EVENT_TARGET'; eventId: string }
 | { type: 'CANCEL_REQUEST'; requestType: 'PAID_LEAVE' | 'DAY_OFF' }
 | { type: 'KEEP_CONDITIONS' }
 | { type: 'NO_WORK' };
export type ReviewStatus = 'NEEDS_MANAGER_REVIEW' | 'ANSWERED_PENDING_REEVALUATION' | 'RESOLVED';
export type ReviewKind = 'EARLY_DEPARTURE' | 'HALF_DAY_BASE' | 'EVENT_CONFLICT' | 'REQUEST_MEANING' | 'LEAVE_CATEGORY';
export type Answer = { option: string; time?: string; startTime?: string; endTime?: string };
export type ReviewItem = {
  id: string; groupId: string; tenantId: string; month: string; dates: string[]; staffIds: string[];
  kind: ReviewKind; reason: string; knownConditions: string[]; impact: string;
  options: string[]; sourceReferences: string[]; status: ReviewStatus; revision: number;
  optionEffects?: Record<string, MonthlyEffect[]>; optionLabels?: Record<string,string>; resolvedAt?: string; answer?: Answer; answeredBy?: string; answeredAt?: string;
};
export type Actor = { tenantId: string; userId: string; role: string };
const fail = (code: string): never => { throw new Error(code); };
export function authorize(actor: Actor, tenantId: string) {
  if (actor.tenantId !== tenantId || actor.role !== 'ADMIN') fail('MANAGER_ACCESS_DENIED');
}
export function validateItem(item: ReviewItem) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(item.month) || !item.id || !item.groupId || !item.tenantId || !Number.isInteger(item.revision) || item.revision < 1) fail('INVALID_REVIEW_ITEM');
  if (!Array.isArray(item.options) || !item.options.length || !Array.isArray(item.knownConditions) || typeof item.reason !== 'string' || typeof item.impact !== 'string') fail('INVALID_REVIEW_ITEM');
  if (!Array.isArray(item.dates)||!Array.isArray(item.staffIds)||!Array.isArray(item.sourceReferences)||!item.dates.length || !item.staffIds.length || !item.sourceReferences.length) fail('INCOMPLETE_REVIEW_SCOPE');
  for (const date of item.dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(item.month + '-') || new Date(date+'T00:00:00Z').toISOString().slice(0,10) !== date) fail('INVALID_REVIEW_DATE');
  }
  if (!['NEEDS_MANAGER_REVIEW','ANSWERED_PENDING_REEVALUATION','RESOLVED'].includes(item.status)) fail('INVALID_REVIEW_STATUS');
}
export function submitAnswer(item: ReviewItem, actor: Actor, revision: number, answer: Answer, now: string): ReviewItem {
  authorize(actor, item.tenantId); validateItem(item);
  if (item.revision !== revision || !['NEEDS_MANAGER_REVIEW','ANSWERED_PENDING_REEVALUATION'].includes(item.status)) fail('REVIEW_REVISION_CONFLICT');
  if (!answer || Object.keys(answer).some(key=>!['option','time','startTime','endTime'].includes(key))) fail('INVALID_ANSWER');
  if (!item.options.includes(answer.option)) fail('INVALID_ANSWER_OPTION');
  const time = (value?: string) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (item.kind === 'EARLY_DEPARTURE') {
    if (answer.option !== 'TIME' || !time(answer.time) || answer.startTime || answer.endTime) fail('INVALID_DEPARTURE_TIME');
    const base=item.optionEffects?.TIME?.find(effect=>effect.type==='TIME');
    if(base?.type==='TIME'&&(answer.time!<=base.startTime||answer.time!>base.endTime))fail('DEPARTURE_OUTSIDE_BASE');
  } else if (item.kind === 'HALF_DAY_BASE' && answer.option === 'OTHER_TIME') {
    if (!time(answer.startTime) || !time(answer.endTime) || answer.startTime! >= answer.endTime! || answer.time) fail('INVALID_BASE_TIME');
  } else if (answer.time || answer.startTime || answer.endTime) fail('UNEXPECTED_ANSWER_TIME');
  if (!Number.isFinite(Date.parse(now))) fail('INVALID_AUDIT_TIME');
  return { ...item, answer: {...answer}, answeredBy: actor.userId, answeredAt: now, revision: revision+1, status: 'ANSWERED_PENDING_REEVALUATION' };
}
/** Call BEFORE solving, not after allocation: masked cells must contribute no staffing capacity. */
export function draftScope(items: ReviewItem[], tenantId: string, month: string) {
  const open = items.filter(item=>item.status !== 'RESOLVED');
  for (const item of items) { validateItem(item); if(item.tenantId !== tenantId || item.month !== month) fail('REVIEW_SCOPE_MISMATCH'); }
  const blockedCells = [...new Set(open.flatMap(item=>item.staffIds.flatMap(staffId=>item.dates.map(date=>JSON.stringify([staffId,date])))))];
  return { status: open.length ? 'NEEDS_MANAGER_REVIEW' : 'READY_FOR_AUDIT', blockedCells,
    reviewCount: new Set(open.map(item=>item.groupId)).size, canFinalize: open.length === 0, requiresCapacityRecalculation: open.length > 0 };
}
export function assertFinalAllowed(items: ReviewItem[], tenantId: string, month: string, hardBlockers: number) {
  const scope = draftScope(items,tenantId,month);
  if (!Number.isInteger(hardBlockers) || hardBlockers < 0 || hardBlockers > 0 || !scope.canFinalize) fail('FINAL_BLOCKED');
}
