import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaidLeaveUsageStatus, PaidLeaveUsageUnit, Prisma, ShiftRequestType, ShiftType } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { PaidLeaveCorrectionDto, PaidLeaveGrantInputDto, PaidLeaveUsageInputDto } from './paid-leave.dto';

const usageInclude = { allocations: { orderBy: { createdAt: 'asc' as const } } } as const;
const paidRequestTypes = new Set<ShiftRequestType>([ShiftRequestType.PAID_LEAVE, ShiftRequestType.HALF_DAY_AM, ShiftRequestType.HALF_DAY_PM]);
const paidShiftTypes = new Set<ShiftType>([ShiftType.PAID_LEAVE, ShiftType.AM_HALF, ShiftType.PM_HALF]);

@Injectable()
export class PaidLeaveService {
  constructor(private readonly prisma: PrismaService, private readonly subscriptions: SubscriptionsService) {}

  async grants(user: AuthenticatedUser, staffId: string) {
    await this.staff(user.tenantId, staffId);
    return this.prisma.paidLeaveGrant.findMany({ where: { tenantId: user.tenantId, staffId }, include: { allocations: { where: { usage: { status: PaidLeaveUsageStatus.CONFIRMED } } } }, orderBy: [{ grantDate: 'asc' }, { createdAt: 'asc' }] });
  }

  async createGrant(user: AuthenticatedUser, staffId: string, input: PaidLeaveGrantInputDto) {
    await this.subscriptions.assertWritable(user.tenantId);
    await this.staff(user.tenantId, staffId, true);
    const grantDate = date(input.grantDate); const validFrom = date(input.validFrom); const expiresAt = date(input.expiresAt);
    if (validFrom > expiresAt) throw new BadRequestException('有効開始日は失効日以前にしてください。');
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.paidLeaveGrant.create({ data: { tenantId: user.tenantId, staffId, grantDate, validFrom, expiresAt, grantedHalfDays: input.grantedHalfDays, source: input.source, note: input.note?.trim() || null, createdByUserId: user.sub } });
      await this.audit(tx, user, 'PAID_LEAVE_GRANT_CREATED', 'PaidLeaveGrant', row.id, { before: null, after: grantSnapshot(row), reason: input.note?.trim() || null });
      return row;
    });
  }

  async voidGrant(user: AuthenticatedUser, staffId: string, grantId: string, reason: string) {
    await this.subscriptions.assertWritable(user.tenantId);
    await this.staff(user.tenantId, staffId);
    return this.safeSerializable(async (tx) => {
      await this.lockGrants(tx, user.tenantId, [grantId]);
      const before = await tx.paidLeaveGrant.findFirst({ where: { id: grantId, tenantId: user.tenantId, staffId } });
      if (!before) throw new NotFoundException('有給付与記録が見つかりません。');
      if (before.voidedAt) throw new ConflictException('この有給付与記録はすでに取消されています。');
      const allocated = await tx.paidLeaveAllocation.count({ where: { tenantId: user.tenantId, grantId, usage: { status: PaidLeaveUsageStatus.CONFIRMED } } });
      if (allocated) throw new ConflictException('確定済み取得に割り当てられた付与記録は取消できません。先に取得記録を訂正または取消してください。');
      const row = await tx.paidLeaveGrant.update({ where: { id: before.id }, data: { voidedAt: new Date(), voidedByUserId: user.sub, voidReason: reason.trim() } });
      await this.audit(tx, user, 'PAID_LEAVE_GRANT_VOIDED', 'PaidLeaveGrant', row.id, { before: grantSnapshot(before), after: grantSnapshot(row), reason: reason.trim() });
      return row;
    });
  }

  async usages(user: AuthenticatedUser, staffId: string) {
    await this.staff(user.tenantId, staffId);
    return this.prisma.paidLeaveUsage.findMany({ where: { tenantId: user.tenantId, staffId }, include: usageInclude, orderBy: [{ usageDate: 'asc' }, { createdAt: 'asc' }] });
  }

  async confirm(user: AuthenticatedUser, staffId: string, input: PaidLeaveUsageInputDto) {
    await this.subscriptions.assertWritable(user.tenantId);
    await this.staff(user.tenantId, staffId, true);
    return this.safeSerializable((tx) => this.createConfirmed(tx, user, staffId, input, null));
  }

  async cancel(user: AuthenticatedUser, staffId: string, usageId: string, reason: string) {
    await this.subscriptions.assertWritable(user.tenantId);
    await this.staff(user.tenantId, staffId);
    return this.safeSerializable(async (tx) => {
      await this.lockUsage(tx, user.tenantId, staffId, usageId);
      const before = await this.usage(tx, user.tenantId, staffId, usageId);
      if (before.status !== PaidLeaveUsageStatus.CONFIRMED) throw new ConflictException('確定済みの取得記録だけを取消できます。');
      const changed = await tx.paidLeaveUsage.updateMany({ where: { id: before.id, tenantId: user.tenantId, staffId, status: PaidLeaveUsageStatus.CONFIRMED }, data: { status: PaidLeaveUsageStatus.CANCELLED, cancellationReason: reason.trim(), cancelledByUserId: user.sub, cancelledAt: new Date() } });
      if (changed.count !== 1) throw new ConflictException('この有給取得は別の操作ですでに変更されています。');
      const row = await tx.paidLeaveUsage.findUniqueOrThrow({ where: { id: before.id }, include: usageInclude });
      await this.audit(tx, user, 'PAID_LEAVE_USAGE_CANCELLED', 'PaidLeaveUsage', row.id, { before: usageSnapshot(before), after: usageSnapshot(row), reason: reason.trim() });
      return row;
    });
  }

  async correct(user: AuthenticatedUser, staffId: string, usageId: string, input: PaidLeaveCorrectionDto) {
    await this.subscriptions.assertWritable(user.tenantId);
    await this.staff(user.tenantId, staffId, true);
    return this.safeSerializable(async (tx) => {
      await this.lockUsage(tx, user.tenantId, staffId, usageId);
      const before = await this.usage(tx, user.tenantId, staffId, usageId);
      if (before.status !== PaidLeaveUsageStatus.CONFIRMED) throw new ConflictException('確定済みの取得記録だけを訂正できます。');
      const changed = await tx.paidLeaveUsage.updateMany({ where: { id: before.id, tenantId: user.tenantId, staffId, status: PaidLeaveUsageStatus.CONFIRMED }, data: { status: PaidLeaveUsageStatus.CORRECTED, correctionReason: input.reason.trim(), correctedByUserId: user.sub, correctedAt: new Date() } });
      if (changed.count !== 1) throw new ConflictException('この有給取得は別の操作ですでに変更されています。');
      const replacement = await this.createConfirmed(tx, user, staffId, input, before.id, false);
      const corrected = await tx.paidLeaveUsage.update({ where: { id: before.id }, data: { supersededById: replacement.id }, include: usageInclude });
      await this.audit(tx, user, 'PAID_LEAVE_USAGE_CORRECTED', 'PaidLeaveUsage', before.id, { before: usageSnapshot(before), after: usageSnapshot(corrected), replacement: usageSnapshot(replacement), reason: input.reason.trim() });
      return { corrected, replacement };
    });
  }

  async balance(user: AuthenticatedUser, staffId: string, asOfValue?: string) {
    await this.staff(user.tenantId, staffId);
    const asOf = asOfValue ? date(asOfValue) : date(await this.businessDate(user.tenantId));
    const grants = await this.prisma.paidLeaveGrant.findMany({ where: { tenantId: user.tenantId, staffId, voidedAt: null }, include: { allocations: { where: { usage: { status: PaidLeaveUsageStatus.CONFIRMED, usageDate: { lte: asOf } } } } }, orderBy: [{ validFrom: 'asc' }, { createdAt: 'asc' }] });
    const rows = grants.map((grant) => { const usedHalfDays = grant.allocations.reduce((sum, row) => sum + row.allocatedHalfDays, 0); const remainingHalfDays = grant.grantedHalfDays - usedHalfDays; const available = grant.validFrom <= asOf && grant.expiresAt >= asOf; return { grantId: grant.id, grantDate: iso(grant.grantDate), validFrom: iso(grant.validFrom), expiresAt: iso(grant.expiresAt), source: grant.source, grantedHalfDays: grant.grantedHalfDays, usedHalfDays, remainingHalfDays, available }; });
    return { staffId, asOf: iso(asOf), unit: 'HALF_DAY', grantedHalfDays: rows.reduce((sum, row) => sum + row.grantedHalfDays, 0), usedHalfDays: rows.reduce((sum, row) => sum + row.usedHalfDays, 0), availableHalfDays: rows.filter((row) => row.available).reduce((sum, row) => sum + row.remainingHalfDays, 0), grants: rows };
  }

  private async createConfirmed(tx: Prisma.TransactionClient, user: AuthenticatedUser, staffId: string, input: PaidLeaveUsageInputDto, correctsId: string | null, audit = true) {
    const usedHalfDays = input.unit === PaidLeaveUsageUnit.DAY ? 2 : 1;
    if (!input.allocations.length || input.allocations.reduce((sum, row) => sum + row.allocatedHalfDays, 0) !== usedHalfDays) throw new BadRequestException('付与からの割当合計が取得量と一致しません。');
    if (new Set(input.allocations.map((row) => row.grantId)).size !== input.allocations.length) throw new BadRequestException('同じ付与記録を重複して指定できません。');
    const usageDate = date(input.usageDate);
    const grantIds = input.allocations.map((row) => row.grantId).sort();
    await this.lockGrants(tx, user.tenantId, grantIds);
    await this.references(tx, user.tenantId, staffId, input.shiftRequestId, input.shiftAssignmentId, usageDate);
    const duplicate = await tx.paidLeaveUsage.findFirst({ where: { tenantId: user.tenantId, staffId, status: PaidLeaveUsageStatus.CONFIRMED, OR: [input.shiftRequestId ? { shiftRequestId: input.shiftRequestId } : undefined, input.shiftAssignmentId ? { shiftAssignmentId: input.shiftAssignmentId } : undefined].filter(Boolean) as Prisma.PaidLeaveUsageWhereInput[] } });
    if (duplicate) throw new ConflictException('同じ申請またはシフト明細の有給取得がすでに確定されています。');
    const grants = await tx.paidLeaveGrant.findMany({ where: { id: { in: grantIds }, tenantId: user.tenantId, staffId, voidedAt: null }, include: { allocations: { where: { usage: { status: PaidLeaveUsageStatus.CONFIRMED } } } } });
    if (grants.length !== grantIds.length) {
      const unavailable = await tx.paidLeaveGrant.findMany({ where: { id: { in: grantIds }, tenantId: user.tenantId, staffId } });
      if (unavailable.some((row) => row.voidedAt)) throw new ConflictException('指定した有給付与は別の操作で取消されました。最新状態を確認してください。');
      throw new BadRequestException('別園・別職員の付与記録は使用できません。');
    }
    for (const allocation of input.allocations) { const grant = grants.find((row) => row.id === allocation.grantId)!; if (usageDate < grant.validFrom || usageDate > grant.expiresAt) throw new BadRequestException('取得日は付与記録の有効期間内にしてください。'); const used = grant.allocations.reduce((sum, row) => sum + row.allocatedHalfDays, 0); if (used + allocation.allocatedHalfDays > grant.grantedHalfDays) throw new ConflictException('有給残高が不足しています。'); }
    const created = await tx.paidLeaveUsage.create({ data: { tenantId: user.tenantId, staffId, usageDate, unit: input.unit, usedHalfDays, status: PaidLeaveUsageStatus.CONFIRMED, shiftRequestId: input.shiftRequestId ?? null, shiftAssignmentId: input.shiftAssignmentId ?? null, confirmedByUserId: user.sub, confirmedAt: new Date(), decisionNote: input.decisionNote.trim() } });
    await tx.paidLeaveAllocation.createMany({ data: input.allocations.map((item) => ({ tenantId: user.tenantId, usageId: created.id, grantId: item.grantId, allocatedHalfDays: item.allocatedHalfDays })) });
    const row = await tx.paidLeaveUsage.findUniqueOrThrow({ where: { id: created.id }, include: usageInclude });
    if (audit) await this.audit(tx, user, 'PAID_LEAVE_USAGE_CONFIRMED', 'PaidLeaveUsage', row.id, { before: null, after: usageSnapshot(row), correctsId, reason: input.decisionNote.trim() });
    return row;
  }

  private async references(tx: Prisma.TransactionClient, tenantId: string, staffId: string, requestId: string | null | undefined, assignmentId: string | null | undefined, usageDate: Date) {
    if (requestId) { const row = await tx.shiftRequest.findFirst({ where: { id: requestId, tenantId, staffId } }); if (!row || row.requestDate.getTime() !== usageDate.getTime() || !paidRequestTypes.has(row.requestType)) throw new BadRequestException('有給取得に対応する同一園・職員・日付の申請を指定してください。'); }
    if (assignmentId) { const row = await tx.shiftAssignment.findFirst({ where: { id: assignmentId, tenantId, staffId } }); if (!row || row.workDate.getTime() !== usageDate.getTime() || !paidShiftTypes.has(row.shiftType)) throw new BadRequestException('有給取得に対応する同一園・職員・日付のシフト明細を指定してください。'); }
  }

  private async staff(tenantId: string, staffId: string, active = false) { const row = await this.prisma.staff.findFirst({ where: { id: staffId, tenantId } }); if (!row) throw new NotFoundException('職員が見つかりません。'); if (active && !row.isActive) throw new BadRequestException('無効な職員へ有給記録を追加できません。'); return row; }
  private async usage(tx: Prisma.TransactionClient, tenantId: string, staffId: string, usageId: string) { const row = await tx.paidLeaveUsage.findFirst({ where: { id: usageId, tenantId, staffId }, include: usageInclude }); if (!row) throw new NotFoundException('有給取得記録が見つかりません。'); return row; }
  private async lockGrants(tx: Prisma.TransactionClient, tenantId: string, grantIds: string[]) { if (!grantIds.length) return; await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PaidLeaveGrant" WHERE "tenantId" = ${tenantId}::uuid AND "id" IN (${Prisma.join(grantIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY "id" FOR UPDATE`); }
  private async lockUsage(tx: Prisma.TransactionClient, tenantId: string, staffId: string, usageId: string) { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PaidLeaveUsage" WHERE "tenantId" = ${tenantId}::uuid AND "staffId" = ${staffId}::uuid AND "id" = ${usageId}::uuid FOR UPDATE`); }
  private async businessDate(tenantId: string) { const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } }); if (!tenant?.timezone) throw new ConflictException('園のタイムゾーン設定がありません。設定を確認してください。'); try { return businessDateAt(new Date(), tenant.timezone); } catch { throw new ConflictException('園のタイムゾーン設定が正しくありません。設定を確認してください。'); } }
  private async safeSerializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> { try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); } catch (error) { if (isTransactionConflict(error)) throw new ConflictException('同時に別の操作が行われました。最新状態を確認してもう一度お試しください。'); throw error; } }
  private audit(tx: Prisma.TransactionClient, user: AuthenticatedUser, action: string, targetType: string, targetId: string, detail: Prisma.InputJsonValue) { return tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action, targetType, targetId, detail } }); }
}

function date(value: string): Date { const parsed = new Date(`${value}T00:00:00.000Z`); if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException('日付が正しくありません。'); return parsed; }
function iso(value: Date): string { return value.toISOString().slice(0, 10); }
function grantSnapshot(row: any) { return { id: row.id, staffId: row.staffId, grantDate: iso(row.grantDate), validFrom: iso(row.validFrom), expiresAt: iso(row.expiresAt), grantedHalfDays: row.grantedHalfDays, source: row.source, note: row.note, voidedAt: row.voidedAt?.toISOString() ?? null, voidReason: row.voidReason }; }
function usageSnapshot(row: any) { return { id: row.id, staffId: row.staffId, usageDate: iso(row.usageDate), unit: row.unit, usedHalfDays: row.usedHalfDays, status: row.status, allocations: row.allocations?.map((item: any) => ({ grantId: item.grantId, allocatedHalfDays: item.allocatedHalfDays })) ?? [], shiftRequestId: row.shiftRequestId, shiftAssignmentId: row.shiftAssignmentId, confirmedByUserId: row.confirmedByUserId, confirmedAt: row.confirmedAt?.toISOString() ?? null, decisionNote: row.decisionNote, cancellationReason: row.cancellationReason, correctionReason: row.correctionReason, supersededById: row.supersededById }; }
function isTransactionConflict(error: unknown): boolean { if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false; if (['P2002', 'P2034'].includes(error.code)) return true; const databaseCode = typeof error.meta?.code === 'string' ? error.meta.code : ''; return error.code === 'P2010' && ['40001', '40P01'].includes(databaseCode); }
export function businessDateAt(now: Date, timeZone: string): string { const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; }
