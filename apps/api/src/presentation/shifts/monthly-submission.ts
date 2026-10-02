import { validateItem, type ReviewItem } from '../../application/manager-resolution/resolution';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';

export const submissionCategories = ['REQUESTS', 'LEAVE', 'EVENTS', 'CLOSED_DATES'] as const;
export type SubmissionCategory = typeof submissionCategories[number];
export type SubmissionState = 'NOT_SUBMITTED' | 'SUBMITTED_EMPTY' | 'SUBMITTED_WITH_DATA';
type Db = Prisma.TransactionClient;
const prefix = 'MONTHLY_SUBMISSION:';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function range(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('対象月が不正です。');
  const start = new Date(month + '-01T00:00:00Z');
  return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
}
/** Reads only. A count of zero is never proof that the administrator submitted a month. */
export async function monthlySubmissionStatus(db: Db, tenantId: string, month: string) {
  const { start, end } = range(month);
  const [requests, events, closed, reviews, records] = await Promise.all([
    db.shiftRequest.findMany({ where: { tenantId, requestDate: { gte: start, lt: end } }, orderBy: { id: 'asc' } }),
    db.tenantEvent.findMany({ where: { tenantId, eventDate: { gte: start, lt: end } }, orderBy: { id: 'asc' } }),
    db.tenantClosedDate.findMany({ where: { tenantId, closedDate: { gte: start, lt: end } }, orderBy: { id: 'asc' } }),
    db.tenantRuleException.findMany({ where: { tenantId, isActive: true, exceptionType: { startsWith: 'MANAGER_REVIEW:' }, exceptionDate: { gte: start, lt: end } }, orderBy: { id: 'asc' } }),
    db.tenantRuleException.findMany({ where: { tenantId, isActive: true, exceptionType: { startsWith: prefix }, exceptionDate: start } }),
  ]);
  const effectiveRequests = new Map(requests.filter(r => r.status === 'APPROVED').map(r => [r.staffId + ':' + r.requestDate.toISOString().slice(0,10), r.requestType as string]));
  for (const row of reviews) {
    const item = row.configuration as unknown as ReviewItem; validateItem(item);
    if (item.tenantId !== tenantId || item.month !== month || item.id !== row.id || item.revision !== row.version) throw new ConflictException('月次確認事項の保存状態が一致しません。');
    if (item.status !== 'RESOLVED' || !item.answer) continue;
    for (const effect of item.optionEffects?.[item.answer.option] ?? []) for (const staffId of item.staffIds) for (const date of item.dates) {
      const key = staffId + ':' + date;
      if (effect.type === 'CANCEL_REQUEST') effectiveRequests.delete(key);
      if (effect.type === 'REQUEST') effectiveRequests.set(key,effect.requestType);
      if (effect.type === 'NO_WORK') effectiveRequests.set(key,'DAY_OFF');
    }
  }
  const items = submissionCategories.map(category => {
    const rows = category === 'REQUESTS' ? requests.filter(r => r.requestType === 'DAY_OFF')
      : category === 'LEAVE' ? requests.filter(r => r.requestType !== 'DAY_OFF') : category === 'EVENTS' ? events : closed;
    const pending = category === 'REQUESTS' || category === 'LEAVE'
      ? requests.filter(r => (category === 'REQUESTS' ? r.requestType === 'DAY_OFF' : r.requestType !== 'DAY_OFF') && r.status === 'PENDING').length : 0;
    const activeRows = rows.filter(r => !('status' in r) || r.status === 'APPROVED');
    // Answer changes invalidate prior submission too; no answer text or staff data is returned.
    const inputDigest = digest({ category, rows, reviews: reviews.map(r => ({ id: r.id, version: r.version, configuration: r.configuration })) });
    const record = records.find(r => r.exceptionType === prefix + category);
    const saved = record?.configuration as { state?: SubmissionState; inputDigest?: string } | undefined;
    const count = category === 'REQUESTS' ? [...effectiveRequests.values()].filter(v => v === 'DAY_OFF').length : category === 'LEAVE' ? [...effectiveRequests.values()].filter(v => v !== 'DAY_OFF').length : activeRows.length;
    const expectedState = count ? 'SUBMITTED_WITH_DATA' : 'SUBMITTED_EMPTY';
    const state: SubmissionState = pending === 0 && saved?.inputDigest === inputDigest && saved.state === expectedState ? expectedState : 'NOT_SUBMITTED';
    return { category, state, count, pending, revision: record?.version ?? 0, inputDigest, confirmedAt: state === 'NOT_SUBMITTED' ? null : record?.confirmedAt?.toISOString() ?? null };
  });
  return { month, items, hasUnsubmitted: items.some(i => i.state === 'NOT_SUBMITTED') };
}
export async function assertMonthlySubmitted(db: Db, tenantId: string, month: string) {
  const state = await monthlySubmissionStatus(db, tenantId, month);
  if (state.hasUnsubmitted) throw new ConflictException({ code: 'MONTHLY_INPUT_NOT_SUBMITTED', message: `${Number(month.slice(5))}月の希望休・有給・行事等の確認が完了していないため、正式シフトを確定できません。`, categories: state.items.filter(i => i.state === 'NOT_SUBMITTED').map(i => i.category) });
  return state;
}
export async function confirmMonthlySubmission(prisma: PrismaService, user: AuthenticatedUser, month: string, category: string, revision: number, inputDigest: string, state: string) {
  if (user.role !== 'ADMIN') throw new ForbiddenException();
  if (!submissionCategories.includes(category as SubmissionCategory) || !Number.isInteger(revision) || revision < 0 || !/^[a-f0-9]{64}$/.test(inputDigest) || !['SUBMITTED_EMPTY', 'SUBMITTED_WITH_DATA'].includes(state)) throw new BadRequestException('提出確認が不正です。');
  const { start } = range(month);
  return prisma.$transaction(async db => {
    // Serializes first submission as well as duplicate operations before a MonthlyShift exists.
    const tenants = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Tenant" WHERE id=${user.tenantId}::uuid FOR UPDATE`;
    if (tenants.length !== 1) throw new ForbiddenException();
    const membership = await db.membership.findFirst({ where: { tenantId: user.tenantId, userId: user.sub, role: 'ADMIN', isActive: true } });
    if (!membership) throw new ForbiddenException();
    const schedule = await db.monthlyShift.findUnique({ where: { tenantId_targetMonth: { tenantId: user.tenantId, targetMonth: start } } });
    if (schedule?.status === 'CONFIRMED') throw new ConflictException('確定済みの月は変更できません。');
    const current = (await monthlySubmissionStatus(db, user.tenantId, month)).items.find(i => i.category === category)!;
    const expected = current.count ? 'SUBMITTED_WITH_DATA' : 'SUBMITTED_EMPTY';
    if (current.inputDigest !== inputDigest || current.pending || state !== expected) throw new ConflictException('月次入力が更新されたか、未承認の申請があります。内容を再確認してください。');
    if (current.state === state && (revision === current.revision || revision === current.revision - 1)) return { status: current.state, revision: current.revision, duplicate: true };
    if (revision !== current.revision) throw new ConflictException('確認状態が更新されています。再読込してください。');
    const confirmedAt = new Date();
    const saved = await db.tenantRuleException.upsert({
      where: { tenantId_exceptionDate_exceptionType: { tenantId: user.tenantId, exceptionDate: start, exceptionType: prefix + category } },
      create: { tenantId: user.tenantId, exceptionDate: start, exceptionType: prefix + category, configuration: { state, inputDigest }, reason: '管理者による月次入力確認', sourceType: 'ADMIN_CONFIRMED', confirmedBy: user.sub, confirmedAt },
      update: { configuration: { state, inputDigest }, isActive: true, confirmedBy: user.sub, confirmedAt, version: { increment: 1 } },
    });
    await db.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'MONTHLY_SUBMISSION_CONFIRMED', targetType: 'MonthlySubmission', targetId: saved.id, detail: { month, category, oldState: current.state, newState: state, confirmedAt: confirmedAt.toISOString(), count: current.count } } });
    return { status: state, revision: saved.version, duplicate: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
