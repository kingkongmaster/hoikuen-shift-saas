import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MonthlyShiftStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';

const BOM = '\ufeff';
const classLabels: Record<string, string> = { AGE_0: '0歳児', AGE_1: '1歳児', AGE_2: '2歳児', AGE_3: '3歳児', AGE_4: '4歳児', AGE_5: '5歳児', FREE: 'フリー', SUPPORT: '補助' };
const employmentLabels: Record<string, string> = { FULL_TIME: '正職員', PART_TIME: 'パート', REEMPLOYED: '再雇用' };

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async shiftsCsv(user: AuthenticatedUser, month: string) {
    const range = this.monthRange(month);
    const schedule = await this.prisma.monthlyShift.findUnique({ where: { tenantId_targetMonth: { tenantId: user.tenantId, targetMonth: range.start } } });
    if (!schedule) throw new NotFoundException('対象月の月間シフトが見つかりません。');
    const [assignments, closed] = await Promise.all([
      this.prisma.shiftAssignment.findMany({ where: { monthlyShiftId: schedule.id, tenantId: user.tenantId }, include: { staff: true }, orderBy: [{ workDate: 'asc' }, { staff: { employeeNumber: 'asc' } }] }),
      this.prisma.tenantClosedDate.findMany({ where: { tenantId: user.tenantId, closedDate: { gte: range.start, lt: range.end } } }),
    ]);
    const closedMap = new Map(closed.map((item) => [this.isoDate(item.closedDate), item.name]));
    const rows = assignments.map((item) => [item.staff.employeeNumber, item.staff.displayName, employmentLabels[item.staff.employmentType], classLabels[item.staff.assignedClass], this.isoDate(item.workDate), this.weekday(item.workDate), item.shiftType, item.assignedClass ? classLabels[item.assignedClass] : '', item.startTime ?? '', item.endTime ?? '', item.breakMinutes ?? '', closedMap.get(this.isoDate(item.workDate)) ?? '', item.note ?? '', schedule.status]);
    await this.audit.create(user.tenantId, user.sub, 'SHIFT_CSV_EXPORTED', 'MonthlyShift', schedule.id, { month, rowCount: rows.length });
    return this.csv(['職員番号', '職員名', '雇用形態', '所属クラス', '日付', '曜日', '勤務区分', '配置クラス', '開始時刻', '終了時刻', '休憩分', '休園日名', '備考', 'シフト状態'], rows);
  }

  async staffCsv(user: AuthenticatedUser) {
    const staff = await this.prisma.staff.findMany({ where: { tenantId: user.tenantId }, orderBy: { employeeNumber: 'asc' } });
    const rows = staff.map((item) => [item.employeeNumber, item.displayName, employmentLabels[item.employmentType], classLabels[item.assignedClass], [item.canWorkEarly ? '早出可' : '', item.canWorkRegular ? '通常可' : '', item.canWorkLate ? '遅出可' : ''].filter(Boolean).join('・'), item.earlyShiftOnly ? 'はい' : 'いいえ', item.lateShiftOnly ? 'はい' : 'いいえ', item.canWorkSaturdays ? '可' : '不可', item.monthlyWorkHourLimit ?? '', item.weeklyAvailableDays ?? '', item.isActive ? '在籍' : '無効', item.notes ?? '']);
    await this.audit.create(user.tenantId, user.sub, 'STAFF_CSV_EXPORTED', 'Staff', user.tenantId, { rowCount: rows.length });
    return this.csv(['職員番号', '氏名', '雇用形態', '担当クラス', '勤務可能区分', '早出専任', '遅出専任', '土曜勤務可否', '月間勤務時間上限', '週勤務可能日数', '在籍状態', '備考'], rows);
  }

  async requestsCsv(user: AuthenticatedUser, month: string) {
    const range = this.monthRange(month);
    const requests = await this.prisma.shiftRequest.findMany({ where: { tenantId: user.tenantId, requestDate: { gte: range.start, lt: range.end } }, include: { staff: true }, orderBy: [{ requestDate: 'asc' }, { staff: { employeeNumber: 'asc' } }] });
    const rows = requests.map((item) => [item.staff.employeeNumber, item.staff.displayName, this.isoDate(item.requestDate), item.requestType, item.status, item.reason ?? '', item.adminComment ?? '', item.createdAt.toISOString(), item.updatedAt.toISOString()]);
    await this.audit.create(user.tenantId, user.sub, 'SHIFT_REQUEST_CSV_EXPORTED', 'ShiftRequest', user.tenantId, { month, rowCount: rows.length });
    return this.csv(['職員番号', '職員名', '対象日', '希望休種別', '状態', '申請コメント', '管理者コメント', '申請日時', '更新日時'], rows);
  }

  async auditCsv(user: AuthenticatedUser, query: { from?: string; to?: string; memberId?: string; action?: string; targetType?: string }) {
    const createdAt = { ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}), ...(query.to ? { lt: new Date(`${query.to}T00:00:00.000Z`) } : {}) };
    const logs = await this.prisma.auditLog.findMany({ where: { tenantId: user.tenantId, ...(query.memberId ? { memberId: query.memberId } : {}), ...(query.action ? { action: query.action } : {}), ...(query.targetType ? { targetType: query.targetType } : {}), ...(Object.keys(createdAt).length ? { createdAt } : {}) }, include: { member: { select: { displayName: true } } }, orderBy: { createdAt: 'desc' }, take: 5000 });
    const rows = logs.map((item) => [item.createdAt.toISOString(), item.member.displayName, item.action, item.targetType, item.targetId, item.detail ? this.safeJson(item.detail) : '']);
    await this.audit.create(user.tenantId, user.sub, 'AUDIT_CSV_EXPORTED', 'AuditLog', user.tenantId, { rowCount: rows.length });
    return this.csv(['発生日時', '操作者', '操作', '対象種別', '対象ID', '詳細'], rows);
  }

  async printData(user: AuthenticatedUser, month: string, ownOnly: boolean) {
    const range = this.monthRange(month);
    const schedule = await this.prisma.monthlyShift.findUnique({ where: { tenantId_targetMonth: { tenantId: user.tenantId, targetMonth: range.start } } });
    if (!schedule) throw new NotFoundException('対象月の月間シフトが見つかりません。');
    if (ownOnly && schedule.status !== MonthlyShiftStatus.CONFIRMED) throw new NotFoundException('確定済みシフトが見つかりません。');
    const ownStaff = ownOnly ? await this.prisma.staff.findUnique({ where: { tenantId_userId: { tenantId: user.tenantId, userId: user.sub } }, select: { id: true } }) : null;
    if (ownOnly && !ownStaff) throw new NotFoundException('職員情報が見つかりません。');
    const [tenant, assignments, closed] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { name: true } }),
      this.prisma.shiftAssignment.findMany({ where: { monthlyShiftId: schedule.id, ...(ownStaff ? { staffId: ownStaff.id } : {}) }, include: { staff: { select: { employeeNumber: true, displayName: true } } }, orderBy: [{ staff: { employeeNumber: 'asc' } }, { workDate: 'asc' }] }),
      this.prisma.tenantClosedDate.findMany({ where: { tenantId: user.tenantId, closedDate: { gte: range.start, lt: range.end } } }),
    ]);
    await this.audit.create(user.tenantId, user.sub, 'SHIFT_PRINT_VIEWED', 'MonthlyShift', schedule.id, { month, ownOnly });
    return { tenantName: tenant.name, month, status: schedule.status, printedAt: new Date().toISOString(), ownOnly, closedDates: closed.map((item) => ({ date: this.isoDate(item.closedDate), name: item.name })), assignments: assignments.map((item) => ({ employeeNumber: item.staff.employeeNumber, staffName: item.staff.displayName, date: this.isoDate(item.workDate), weekday: this.weekday(item.workDate), shiftType: item.shiftType, assignedClass: item.assignedClass ? classLabels[item.assignedClass] : '', startTime: item.startTime, endTime: item.endTime, breakMinutes: item.breakMinutes, note: item.note })) };
  }

  private csv(headers: string[], rows: unknown[][]) { return BOM + [headers, ...rows].map((row) => row.map((value) => this.cell(value)).join(',')).join('\r\n') + '\r\n'; }
  private cell(value: unknown) { let text = String(value ?? '').replace(/\r?\n/g, '\n'); if (/^[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; }
  private monthRange(month: string) { const start = new Date(`${month}-01T00:00:00.000Z`); if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 7) !== month) throw new BadRequestException('monthが正しい年月ではありません。'); return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) }; }
  private isoDate(date: Date) { return date.toISOString().slice(0, 10); }
  private weekday(date: Date) { return ['日', '月', '火', '水', '木', '金', '土'][date.getUTCDay()]; }
  private safeJson(value: unknown) { return JSON.stringify(this.redact(value)); }
  private redact(value: any): any { if (Array.isArray(value)) return value.map((item) => this.redact(item)); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/(password|token|secret|api.?key|authorization)/i.test(key)).map(([key, item]) => [key, this.redact(item)])); return value; }
}
