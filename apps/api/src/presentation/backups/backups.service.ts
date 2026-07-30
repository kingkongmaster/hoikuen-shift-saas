import { BadRequestException, Injectable, PayloadTooLargeException, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'crypto';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';

const MAX_BYTES = 10 * 1024 * 1024;
const legacyArrays = ['members', 'staff', 'shiftRequests', 'monthlyShifts', 'shiftAssignments', 'classRequirements', 'closedDates', 'notifications', 'shiftSwapRequests', 'auditLogs'] as const;
const version2RequiredArrays = [...legacyArrays, 'tenantFeatures'] as const;
const arrays = [...version2RequiredArrays, 'workPatterns', 'staffWorkRules', 'staffAttributeDefinitions', 'staffAttributeAssignments'] as const;
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
    for (const key of this.arrayKeys(checked.version)) preview[key] = this.compare((checked.data[key] ?? []) as Array<{ id?: string; updatedAt?: string }>, (current[key] ?? []) as Array<{ id?: string; updatedAt?: string }>);
    const settingsChanged = this.stable(checked.data.shiftSetting) !== this.stable(current.shiftSetting);
    const destructiveChanges = Object.fromEntries(Object.entries(preview).map(([key, value]) => [key, value.missing]));
    await this.audit.create(user.tenantId, user.sub, 'RESTORE_PREVIEWED', 'TenantBackup', user.tenantId, { version: checked.version, checksumPrefix: checked.integrity.checksum.slice(0, 12), destructiveChanges });
    return { valid: true, sourceMetadata: this.metadata(checked), currentTenantSummary: this.counts(current), preview: { ...preview, tenantShiftSetting: { changed: settingsChanged } }, warnings: ['これは復元内容の確認画面です。現在のデータは変更されません。'], destructiveChanges };
  }

  private async collect(tenantId: string): Promise<BackupData> {
    const [tenant, memberships, staff, shiftRequests, monthlyShifts, shiftAssignments, shiftSetting, classRequirements, closedDates, notifications, shiftSwapRequests, auditLogs, tenantFeatures, workPatterns, staffWorkRules, staffAttributeDefinitions, staffAttributeAssignments] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, name: true, createdAt: true, updatedAt: true } }),
      this.prisma.membership.findMany({ where: { tenantId }, include: { user: { select: { id: true, email: true, displayName: true, isActive: true, createdAt: true, updatedAt: true } } } }),
      this.prisma.staff.findMany({ where: { tenantId } }), this.prisma.shiftRequest.findMany({ where: { tenantId } }), this.prisma.monthlyShift.findMany({ where: { tenantId } }), this.prisma.shiftAssignment.findMany({ where: { tenantId } }), this.prisma.tenantShiftSetting.findUnique({ where: { tenantId } }), this.prisma.classStaffingRequirement.findMany({ where: { tenantId } }), this.prisma.tenantClosedDate.findMany({ where: { tenantId } }), this.prisma.notification.findMany({ where: { tenantId } }), this.prisma.shiftSwapRequest.findMany({ where: { tenantId } }), this.prisma.auditLog.findMany({ where: { tenantId } }), this.prisma.tenantFeature.findMany({ where: { tenantId } }),
      this.prisma.workPattern.findMany({ where: { tenantId } }),
      this.prisma.staffWorkRule.findMany({ where: { tenantId } }),
      this.prisma.staffAttributeDefinition.findMany({ where: { tenantId } }),
      this.prisma.staffAttributeAssignment.findMany({ where: { tenantId } }),
    ]);
    return { tenant: this.clean(tenant), members: memberships.map((item) => this.clean(item)), staff: staff.map((item) => this.clean(item)), shiftRequests: shiftRequests.map((item) => this.clean(item)), monthlyShifts: monthlyShifts.map((item) => this.clean(item)), shiftAssignments: shiftAssignments.map((item) => this.clean(item)), shiftSetting: shiftSetting ? this.clean(shiftSetting) : null, classRequirements: classRequirements.map((item) => this.clean(item)), closedDates: closedDates.map((item) => this.clean(item)), notifications: notifications.map((item) => this.clean(item)), shiftSwapRequests: shiftSwapRequests.map((item) => this.clean(item)), auditLogs: auditLogs.map((item) => this.clean(item)), tenantFeatures: tenantFeatures.map((item) => this.clean(item)), workPatterns: workPatterns.map((item) => this.clean(item)), staffWorkRules: staffWorkRules.map((item) => this.clean(item)), staffAttributeDefinitions:staffAttributeDefinitions.map(item=>this.clean(item)), staffAttributeAssignments:staffAttributeAssignments.map(item=>this.clean(item)) };
  }

  private wrap(tenantId: string, data: BackupData) { const counts = this.counts(data); const integrity = { algorithm: 'SHA-256', checksum: this.checksum(data) }; return { format: 'enshift-backup', version: 2, exportedAt: new Date().toISOString(), tenantId, tenantName: String(data.tenant.name), application: 'EnShift', counts, data, integrity }; }
  private validateShape(value: unknown): any {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('バックアップJSONが正しくありません。'); const backup = value as any;
    if (backup.format !== 'enshift-backup' || backup.application !== 'EnShift') throw new BadRequestException('対応していないバックアップ形式です。'); if (![1, 2].includes(backup.version)) throw new BadRequestException('対応していないバックアップversionです。'); if (!backup.tenantId || !backup.tenantName || !backup.data || !backup.counts || !backup.integrity) throw new BadRequestException('バックアップの必須項目が不足しています。'); if (backup.integrity.algorithm !== 'SHA-256' || typeof backup.integrity.checksum !== 'string') throw new BadRequestException('チェックサム情報が正しくありません。');
    for (const key of this.requiredArrayKeys(backup.version)) { if (!Array.isArray(backup.data[key]) || backup.counts[key] !== backup.data[key].length) throw new UnprocessableEntityException(`バックアップ件数が一致しません: ${key}`); if (backup.data[key].length > 100000) throw new UnprocessableEntityException('バックアップ件数が上限を超えています。'); }
    if (backup.version === 2 && Object.prototype.hasOwnProperty.call(backup.data, 'workPatterns')) { if (!Array.isArray(backup.data.workPatterns) || backup.counts.workPatterns !== backup.data.workPatterns.length) throw new UnprocessableEntityException('バックアップ件数が一致しません: workPatterns'); }
    if (backup.version === 2 && Object.prototype.hasOwnProperty.call(backup.data, 'staffWorkRules')) { if (!Array.isArray(backup.data.staffWorkRules) || backup.counts.staffWorkRules !== backup.data.staffWorkRules.length) throw new UnprocessableEntityException('バックアップ件数が一致しません: staffWorkRules'); }
    for (const key of ['staffAttributeDefinitions','staffAttributeAssignments']) if (backup.version===2&&Object.prototype.hasOwnProperty.call(backup.data,key)&&(!Array.isArray(backup.data[key])||backup.counts[key]!==backup.data[key].length)) throw new UnprocessableEntityException(`バックアップ件数が一致しません: ${key}`);
    if (!backup.data.tenant || !Object.prototype.hasOwnProperty.call(backup.data, 'shiftSetting')) throw new UnprocessableEntityException('バックアップdata構造が正しくありません。'); if (this.checksum(backup.data) !== backup.integrity.checksum) throw new BadRequestException('バックアップのチェックサムが一致しません。');
    for (const key of this.presentArrayKeys(backup)) { const ids = backup.data[key].map((item: any) => item?.id).filter(Boolean); if (ids.length !== new Set(ids).size) throw new UnprocessableEntityException(`重複IDが含まれています: ${key}`); }
    this.validateWorkPatternReferences(backup);
    this.validateStaffWorkRules(backup);
    this.validateStaffAttributes(backup);
    return backup;
  }
  private counts(data: BackupData) { return Object.fromEntries(arrays.map((key) => [key, data[key].length])); }
  private arrayKeys(version: number): readonly (typeof arrays)[number][] { return version === 1 ? legacyArrays : arrays; }
  private requiredArrayKeys(version: number): readonly string[] { return version === 1 ? legacyArrays : version2RequiredArrays; }
  private presentArrayKeys(backup: any): readonly string[] { return this.arrayKeys(backup.version).filter((key) => Array.isArray(backup.data[key])); }
  private validateWorkPatternReferences(backup: any) {
    const patterns = Array.isArray(backup.data.workPatterns) ? backup.data.workPatterns : [];
    const ids = new Set(patterns.map((row: any) => row.id));
    const systemCodes = new Set(['EARLY', 'NORMAL', 'LATE', 'OFF']);
    for (const row of patterns) {
      if (row.tenantId !== backup.tenantId) throw new UnprocessableEntityException('別Tenantの勤務パターンを含むバックアップは利用できません。');
      if (row.isSystem) {
        if (!systemCodes.has(row.code) || row.isActive !== true) throw new UnprocessableEntityException('標準勤務パターンの不変条件が壊れています。');
        if (row.code === 'OFF' && (row.isWorking !== false || row.startTime != null || row.endTime != null || row.breakMinutes !== 0 || row.isDefault)) throw new UnprocessableEntityException('OFF勤務パターンの不変条件が壊れています。');
        if (row.code !== 'OFF' && row.isWorking !== true) throw new UnprocessableEntityException('標準勤務パターンの不変条件が壊れています。');
      }
    }
    for (const assignment of backup.data.shiftAssignments) {
      if (assignment.tenantId !== backup.tenantId) throw new UnprocessableEntityException('別Tenantのシフト割り当てを含むバックアップは利用できません。');
      if (assignment.workPatternId != null && !ids.has(assignment.workPatternId)) throw new UnprocessableEntityException('存在しない勤務パターンを参照するシフトが含まれています。');
    }
  }
  private validateStaffWorkRules(backup: any) {
    const rules = Array.isArray(backup.data.staffWorkRules) ? backup.data.staffWorkRules : [];
    const staffIds = new Set(backup.data.staff.map((row: any) => row.id));
    const patternIds = new Set((backup.data.workPatterns ?? []).map((row: any) => row.id));
    const patternRules = new Set(['AVAILABLE_WORK_PATTERN','UNAVAILABLE_WORK_PATTERN','FIXED_WORK_PATTERN','PREFERRED_WORK_PATTERN']);
    const dayRules = new Set(['AVAILABLE_DAY_OF_WEEK','UNAVAILABLE_DAY_OF_WEEK','REQUIRED_DAY_OFF']);
    const timeRules = new Set(['AVAILABLE_TIME_RANGE','UNAVAILABLE_TIME_RANGE']);
    const numericLimits: Record<string, number> = { MAX_WORK_DAYS_PER_WEEK:7, MAX_WORK_DAYS_PER_MONTH:31, MIN_WORK_DAYS_PER_MONTH:31, MAX_CONSECUTIVE_WORK_DAYS:31, MAX_WORK_MINUTES_PER_MONTH:44640, MIN_WORK_MINUTES_PER_MONTH:44640 };
    for (const row of rules) {
      if (row.tenantId !== backup.tenantId || !staffIds.has(row.staffId)) throw new UnprocessableEntityException('別Tenantまたは存在しない職員を参照する勤務条件があります。');
      if (row.workPatternId != null && !patternIds.has(row.workPatternId)) throw new UnprocessableEntityException('別Tenantまたは存在しない勤務パターンを参照する勤務条件があります。');
      if (row.startDate != null && row.endDate != null && row.startDate > row.endDate) throw new UnprocessableEntityException('勤務条件の日付範囲が正しくありません。');
      if (row.startTime != null && row.endTime != null && row.startTime >= row.endTime) throw new UnprocessableEntityException('勤務条件の時刻範囲が正しくありません。');
      if (row.dayOfWeek != null && (!Number.isInteger(row.dayOfWeek) || row.dayOfWeek < 0 || row.dayOfWeek > 6)) throw new UnprocessableEntityException('勤務条件の曜日が正しくありません。');
      const pattern = row.workPatternId != null, day = row.dayOfWeek != null, time = row.startTime != null && row.endTime != null, numeric = Number.isInteger(row.numericValue) && row.numericValue >= 0 && row.numericValue <= (numericLimits[row.ruleType] ?? -1);
      if (row.booleanValue != null || !Number.isInteger(row.priority) || row.priority < 0 || row.priority > 1000 || typeof row.isHardConstraint !== 'boolean' || typeof row.isActive !== 'boolean') throw new UnprocessableEntityException('勤務条件の共通項目が正しくありません。');
      if (typeof row.reason === 'string' && (row.reason.length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(row.reason))) throw new UnprocessableEntityException('勤務条件の理由が正しくありません。');
      if (patternRules.has(row.ruleType) ? !pattern : dayRules.has(row.ruleType) ? !day : timeRules.has(row.ruleType) ? !time : numericLimits[row.ruleType] != null ? !numeric : true) throw new UnprocessableEntityException('勤務条件の種別と入力値が一致しません。');
    }
    const active = rules.filter((row: any) => row.isActive);
    for (let i=0;i<active.length;i++) for (let j=i+1;j<active.length;j++) { const a=active[i],b=active[j]; if(a.staffId!==b.staffId||!this.rulePeriodsOverlap(a,b)||!this.ruleDaysOverlap(a,b))continue; const exact=a.ruleType===b.ruleType&&a.workPatternId===b.workPatternId&&a.dayOfWeek===b.dayOfWeek&&a.startDate===b.startDate&&a.endDate===b.endDate&&a.startTime===b.startTime&&a.endTime===b.endTime&&a.numericValue===b.numericValue; const opposite=new Set([`${a.ruleType}:${b.ruleType}`,`${b.ruleType}:${a.ruleType}`]); if(exact||opposite.has('AVAILABLE_WORK_PATTERN:UNAVAILABLE_WORK_PATTERN')&&a.workPatternId===b.workPatternId||opposite.has('AVAILABLE_DAY_OF_WEEK:UNAVAILABLE_DAY_OF_WEEK')||opposite.has('AVAILABLE_TIME_RANGE:UNAVAILABLE_TIME_RANGE')&&a.startTime===b.startTime&&a.endTime===b.endTime||a.ruleType==='FIXED_WORK_PATTERN'&&b.ruleType==='FIXED_WORK_PATTERN'&&a.workPatternId!==b.workPatternId)throw new UnprocessableEntityException('有効な勤務条件に重複または矛盾があります。'); }
  }
  private rulePeriodsOverlap(a:any,b:any){if(a.startDate==null||a.endDate==null||b.startDate==null||b.endDate==null)return true;return a.startDate<=b.endDate&&b.startDate<=a.endDate;}
  private ruleDaysOverlap(a:any,b:any){return a.dayOfWeek==null||b.dayOfWeek==null||a.dayOfWeek===b.dayOfWeek;}
  private validateStaffAttributes(backup:any){const defs=Array.isArray(backup.data.staffAttributeDefinitions)?backup.data.staffAttributeDefinitions:[];const assignments=Array.isArray(backup.data.staffAttributeAssignments)?backup.data.staffAttributeAssignments:[];const staffIds=new Set(backup.data.staff.map((row:any)=>row.id));const defIds=new Set(defs.map((row:any)=>row.id));const codes=new Set<string>();const categories=new Set(['ROLE','QUALIFICATION','ASSIGNMENT','SKILL']);const control=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;for(const row of defs){if(row.tenantId!==backup.tenantId||!categories.has(row.category)||!/^[A-Z][A-Z0-9_]{0,49}$/.test(row.code)||codes.has(row.code)||typeof row.name!=='string'||!row.name.trim()||row.name.length>100||typeof row.shortName==='string'&&(row.shortName.length>30||control.test(row.shortName))||!Number.isInteger(row.displayOrder)||row.displayOrder<0||row.displayOrder>100000||row.color!=null&&!/^#[0-9A-Fa-f]{6}$/.test(row.color)||typeof row.isActive!=='boolean'||typeof row.isSystem!=='boolean'||row.isSystem&&!row.isActive)throw new UnprocessableEntityException('属性定義が正しくありません。');codes.add(row.code);if(typeof row.description==='string'&&(row.description.length>500||control.test(row.description)))throw new UnprocessableEntityException('属性定義の説明が正しくありません。');}const active=assignments.filter((row:any)=>row.isActive);for(const row of assignments){const def=defs.find((item:any)=>item.id===row.attributeDefinitionId);if(row.tenantId!==backup.tenantId||!staffIds.has(row.staffId)||!defIds.has(row.attributeDefinitionId)||typeof row.isPrimary!=='boolean'||typeof row.isActive!=='boolean'||(row.startDate==null)!==(row.endDate==null)||row.startDate!=null&&row.startDate>row.endDate||row.isPrimary&&!['ROLE','ASSIGNMENT'].includes(def?.category))throw new UnprocessableEntityException('職員属性割当が正しくありません。');if(typeof row.notes==='string'&&(row.notes.length>500||control.test(row.notes)))throw new UnprocessableEntityException('職員属性の備考が正しくありません。');}for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){const a=active[i],b=active[j];if(a.staffId!==b.staffId||!this.attributePeriodsOverlap(a,b))continue;if(a.attributeDefinitionId===b.attributeDefinitionId)throw new UnprocessableEntityException('職員属性の期間が重複しています。');const ad=defs.find((d:any)=>d.id===a.attributeDefinitionId),bd=defs.find((d:any)=>d.id===b.attributeDefinitionId);if(a.isPrimary&&b.isPrimary&&ad?.category===bd?.category)throw new UnprocessableEntityException('同一カテゴリの主属性期間が重複しています。');}}
  private attributePeriodsOverlap(a:any,b:any){if(a.startDate==null||a.endDate==null||b.startDate==null||b.endDate==null)return true;return a.startDate<=b.endDate&&b.startDate<=a.endDate;}
  private metadata(backup: any) { return { format: backup.format, version: backup.version, exportedAt: backup.exportedAt, tenantName: backup.tenantName, integrity: backup.integrity }; }
  private compare(source: Array<{ id?: string; updatedAt?: string }>, current: Array<{ id?: string; updatedAt?: string }>) { const currentById = new Map(current.filter((item) => item.id).map((item) => [item.id, item])); let add = 0; let update = 0; for (const item of source) { const existing = item.id ? currentById.get(item.id) : undefined; if (!existing) add += 1; else if (this.stable(item) !== this.stable(existing)) update += 1; } const sourceIds = new Set(source.map((item) => item.id).filter(Boolean)); return { add, update, missing: current.filter((item) => item.id && !sourceIds.has(item.id)).length }; }
  private checksum(data: unknown) { return createHash('sha256').update(this.stable(data), 'utf8').digest('hex'); }
  private stable(value: any): string { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map((item) => this.stable(item)).join(',')}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${this.stable(value[key])}`).join(',')}}`; }
  private clean(value: any): any { if (value instanceof Date) return value.toISOString(); if (Array.isArray(value)) return value.map((item) => this.clean(item)); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/(password|token|secret|api.?key|authorization)/i.test(key)).map(([key, item]) => [key, this.clean(item)])); return value; }
  private enforceSize(value: unknown) { if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BYTES) throw new PayloadTooLargeException('バックアップファイルは10MB以下にしてください。'); }
  private rejectDangerous(value: any): void { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new BadRequestException('危険なキーを含むバックアップは利用できません。'); this.rejectDangerous(child); } }
}
