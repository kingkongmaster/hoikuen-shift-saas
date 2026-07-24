import { BadRequestException, Injectable, PayloadTooLargeException, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'crypto';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';

const MAX_BYTES = 10 * 1024 * 1024;
const arrays = ['members', 'staff', 'shiftRequests', 'monthlyShifts', 'shiftAssignments', 'classRequirements', 'closedDates', 'notifications', 'shiftSwapRequests', 'auditLogs'] as const;
type BackupData = Record<(typeof arrays)[number], unknown[]> & { tenant: Record<string, unknown>; shiftSetting: Record<string, unknown> | null };

@Injectable()
export class BackupsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async export(user: AuthenticatedUser) {
    const data = await this.collect(user.tenantId);
    const backup = this.wrap(user.tenantId, data);
    await this.audit.create(user.tenantId, user.sub, 'BACKUP_EXPORTED', 'TenantBackup', user.tenantId, { version: backup.version, counts: backup.counts, checksumPrefix: backup.integrity.checksum.slice(0, 12) });
    return backup;
  }

  async validate(user: AuthenticatedUser, backup: unknown, audit = true) {
    this.enforceSize(backup); this.rejectDangerous(backup);
    const checked = this.validateShape(backup);
    if (checked.tenantId !== user.tenantId) throw new UnprocessableEntityException('この園のバックアップではありません。');
    if (audit) await this.audit.create(user.tenantId, user.sub, 'BACKUP_VALIDATED', 'TenantBackup', user.tenantId, { version: checked.version, counts: checked.counts, checksumPrefix: checked.integrity.checksum.slice(0, 12) });
    return { valid: true, errors: [], warnings: [], metadata: this.metadata(checked), counts: checked.counts };
  }

  async preview(user: AuthenticatedUser, backup: unknown) {
    await this.validate(user, backup, false);
    const checked = backup as any;
    const current = await this.collect(user.tenantId);
    const preview: Record<string, { add: number; update: number; missing: number }> = {};
    for (const key of arrays) preview[key] = this.compare((checked.data[key] ?? []) as Array<{ id?: string; updatedAt?: string }>, (current[key] ?? []) as Array<{ id?: string; updatedAt?: string }>);
    const settingsChanged = this.stable(checked.data.shiftSetting) !== this.stable(current.shiftSetting);
    const destructiveChanges = Object.fromEntries(Object.entries(preview).map(([key, value]) => [key, value.missing]));
    await this.audit.create(user.tenantId, user.sub, 'RESTORE_PREVIEWED', 'TenantBackup', user.tenantId, { version: checked.version, checksumPrefix: checked.integrity.checksum.slice(0, 12), destructiveChanges });
    return { valid: true, sourceMetadata: this.metadata(checked), currentTenantSummary: this.counts(current), preview: { ...preview, tenantShiftSetting: { changed: settingsChanged } }, warnings: ['これは復元内容の確認画面です。現在のデータは変更されません。'], destructiveChanges };
  }

  private async collect(tenantId: string): Promise<BackupData> {
    const [tenant, memberships, staff, shiftRequests, monthlyShifts, shiftAssignments, shiftSetting, classRequirements, closedDates, notifications, shiftSwapRequests, auditLogs] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, name: true, createdAt: true, updatedAt: true } }),
      this.prisma.membership.findMany({ where: { tenantId }, include: { user: { select: { id: true, email: true, displayName: true, isActive: true, createdAt: true, updatedAt: true } } } }),
      this.prisma.staff.findMany({ where: { tenantId } }), this.prisma.shiftRequest.findMany({ where: { tenantId } }), this.prisma.monthlyShift.findMany({ where: { tenantId } }), this.prisma.shiftAssignment.findMany({ where: { tenantId } }), this.prisma.tenantShiftSetting.findUnique({ where: { tenantId } }), this.prisma.classStaffingRequirement.findMany({ where: { tenantId } }), this.prisma.tenantClosedDate.findMany({ where: { tenantId } }), this.prisma.notification.findMany({ where: { tenantId } }), this.prisma.shiftSwapRequest.findMany({ where: { tenantId } }), this.prisma.auditLog.findMany({ where: { tenantId } }),
    ]);
    return { tenant: this.clean(tenant), members: memberships.map((item) => this.clean(item)), staff: staff.map((item) => this.clean(item)), shiftRequests: shiftRequests.map((item) => this.clean(item)), monthlyShifts: monthlyShifts.map((item) => this.clean(item)), shiftAssignments: shiftAssignments.map((item) => this.clean(item)), shiftSetting: shiftSetting ? this.clean(shiftSetting) : null, classRequirements: classRequirements.map((item) => this.clean(item)), closedDates: closedDates.map((item) => this.clean(item)), notifications: notifications.map((item) => this.clean(item)), shiftSwapRequests: shiftSwapRequests.map((item) => this.clean(item)), auditLogs: auditLogs.map((item) => this.clean(item)) };
  }

  private wrap(tenantId: string, data: BackupData) { const counts = this.counts(data); const integrity = { algorithm: 'SHA-256', checksum: this.checksum(data) }; return { format: 'enshift-backup', version: 1, exportedAt: new Date().toISOString(), tenantId, tenantName: String(data.tenant.name), application: 'EnShift', counts, data, integrity }; }
  private validateShape(value: unknown): any {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('バックアップJSONが正しくありません。'); const backup = value as any;
    if (backup.format !== 'enshift-backup' || backup.application !== 'EnShift') throw new BadRequestException('対応していないバックアップ形式です。'); if (backup.version !== 1) throw new BadRequestException('対応していないバックアップversionです。'); if (!backup.tenantId || !backup.tenantName || !backup.data || !backup.counts || !backup.integrity) throw new BadRequestException('バックアップの必須項目が不足しています。'); if (backup.integrity.algorithm !== 'SHA-256' || typeof backup.integrity.checksum !== 'string') throw new BadRequestException('チェックサム情報が正しくありません。');
    for (const key of arrays) { if (!Array.isArray(backup.data[key]) || backup.counts[key] !== backup.data[key].length) throw new UnprocessableEntityException(`バックアップ件数が一致しません: ${key}`); if (backup.data[key].length > 100000) throw new UnprocessableEntityException('バックアップ件数が上限を超えています。'); }
    if (!backup.data.tenant || !Object.prototype.hasOwnProperty.call(backup.data, 'shiftSetting')) throw new UnprocessableEntityException('バックアップdata構造が正しくありません。'); if (this.checksum(backup.data) !== backup.integrity.checksum) throw new BadRequestException('バックアップのチェックサムが一致しません。');
    for (const key of arrays) { const ids = backup.data[key].map((item: any) => item?.id).filter(Boolean); if (ids.length !== new Set(ids).size) throw new UnprocessableEntityException(`重複IDが含まれています: ${key}`); }
    return backup;
  }
  private counts(data: BackupData) { return Object.fromEntries(arrays.map((key) => [key, data[key].length])); }
  private metadata(backup: any) { return { format: backup.format, version: backup.version, exportedAt: backup.exportedAt, tenantName: backup.tenantName, integrity: backup.integrity }; }
  private compare(source: Array<{ id?: string; updatedAt?: string }>, current: Array<{ id?: string; updatedAt?: string }>) { const currentById = new Map(current.filter((item) => item.id).map((item) => [item.id, item])); let add = 0; let update = 0; for (const item of source) { const existing = item.id ? currentById.get(item.id) : undefined; if (!existing) add += 1; else if (this.stable(item) !== this.stable(existing)) update += 1; } const sourceIds = new Set(source.map((item) => item.id).filter(Boolean)); return { add, update, missing: current.filter((item) => item.id && !sourceIds.has(item.id)).length }; }
  private checksum(data: unknown) { return createHash('sha256').update(this.stable(data), 'utf8').digest('hex'); }
  private stable(value: any): string { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map((item) => this.stable(item)).join(',')}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${this.stable(value[key])}`).join(',')}}`; }
  private clean(value: any): any { if (value instanceof Date) return value.toISOString(); if (Array.isArray(value)) return value.map((item) => this.clean(item)); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/(password|token|secret|api.?key|authorization)/i.test(key)).map(([key, item]) => [key, this.clean(item)])); return value; }
  private enforceSize(value: unknown) { if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BYTES) throw new PayloadTooLargeException('バックアップファイルは10MB以下にしてください。'); }
  private rejectDangerous(value: any): void { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new BadRequestException('危険なキーを含むバックアップは利用できません。'); this.rejectDangerous(child); } }
}
