import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, MonthlyShiftStatus, NotificationType, Prisma, ShiftRequestStatus, ShiftType } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { shiftManagerRoles, shiftTypeDefaults, workingShiftTypes } from '../../domain/shifts/monthly-shift';
import { generateRuleBasedSchedule } from '../../application/shifts/rule-based-shift-generator';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import type { AssignmentInputDto } from './save-assignments.dto';

const staffSelect = { id: true, userId: true, employeeNumber: true, displayName: true, employmentType: true, assignedClass: true, canWorkEarly: true, canWorkLate: true, earlyShiftOnly: true, lateShiftOnly: true, canWorkSaturdays: true, monthlyWorkHourLimit: true, weeklyAvailableDays: true, isActive: true } as const;
const assignmentInclude = { staff: { select: staffSelect } } as const;
type Warning = { code: string; staffId: string; workDate: string; message: string; severity: 'warning' | 'blocking' };

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService, private readonly notifications: NotificationsService, private readonly audit: AuditService) {}

  async list(user: AuthenticatedUser, month: string, requestedStaffId?: string) {
    const targetMonth = this.monthDate(month);
    const manager = this.isManager(user);
    const ownStaff = manager ? undefined : await this.requireOwnStaff(user);
    if (!manager && requestedStaffId && requestedStaffId !== ownStaff!.id) throw new ForbiddenException('他の職員のシフトは参照できません。');
    if (manager && requestedStaffId) await this.requireTenantStaff(user.tenantId, requestedStaffId);
    const staffId = manager ? requestedStaffId : ownStaff!.id;
    const schedule = await this.prisma.monthlyShift.findUnique({ where: { tenantId_targetMonth: { tenantId: user.tenantId, targetMonth } } });
    if (!schedule || (!manager && schedule.status !== MonthlyShiftStatus.CONFIRMED)) return { schedule: null, assignments: [], staff: manager ? await this.activeStaff(user.tenantId, staffId) : [], requests: [], warnings: [] };
    return this.buildView(user, schedule, staffId);
  }

  async get(user: AuthenticatedUser, id: string) {
    const schedule = await this.prisma.monthlyShift.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!schedule) throw new NotFoundException('月間シフトが見つかりません。');
    const manager = this.isManager(user);
    if (!manager && schedule.status !== MonthlyShiftStatus.CONFIRMED) throw new NotFoundException('月間シフトが見つかりません。');
    const ownStaff = manager ? undefined : await this.requireOwnStaff(user);
    return this.buildView(user, schedule, ownStaff?.id);
  }

  async create(user: AuthenticatedUser, month: string) {
    const targetMonth = this.monthDate(month);
    try {
      return await this.prisma.monthlyShift.create({ data: { tenantId: user.tenantId, targetMonth, createdByUserId: user.sub }, include: { assignments: { include: assignmentInclude } } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('この月の月間シフトはすでに作成されています。');
      throw error;
    }
  }

  async save(user: AuthenticatedUser, id: string, inputs: AssignmentInputDto[]) {
    const schedule = await this.requireEditable(user, id);
    this.validateUniqueInputs(inputs);
    const range = this.monthRange(schedule.targetMonth);
    for (const input of inputs) this.validateAssignmentInput(input, range);
    const staff = await this.prisma.staff.findMany({ where: { tenantId: user.tenantId, id: { in: [...new Set(inputs.map((input) => input.staffId))] } }, select: staffSelect });
    if (staff.length !== new Set(inputs.map((input) => input.staffId)).size) throw new NotFoundException('職員が見つかりません。');
    const workingInputs = inputs.filter((input) => (workingShiftTypes as readonly ShiftType[]).includes(input.shiftType));
    if (workingInputs.length) {
      const approvedRequests = await this.prisma.shiftRequest.findMany({
        where: {
          tenantId: user.tenantId,
          status: ShiftRequestStatus.APPROVED,
          OR: workingInputs.map((input) => ({ staffId: input.staffId, requestDate: this.date(input.workDate) })),
        },
        include: { staff: { select: { displayName: true } } },
      });
      if (approvedRequests.length) {
        throw new ConflictException({
          message: '承認済みの休暇申請日には勤務を保存できません。',
          warnings: approvedRequests.map((request) => ({
            code: 'APPROVED_REQUEST_CONFLICT',
            staffId: request.staffId,
            workDate: this.isoDate(request.requestDate),
            message: `${request.staff.displayName}さんの承認済み休暇申請日には勤務を割り当てられません。`,
            severity: 'blocking',
          })),
        });
      }
    }
    await this.prisma.$transaction(inputs.map((input) => this.prisma.shiftAssignment.upsert({
      where: { monthlyShiftId_staffId_workDate: { monthlyShiftId: schedule.id, staffId: input.staffId, workDate: this.date(input.workDate) } },
      create: this.assignmentData(schedule, input),
      update: this.assignmentData(schedule, input),
    })));
    await this.audit.create(user.tenantId,user.sub,'SHIFT_ASSIGNMENTS_SAVED','MonthlyShift',schedule.id,{assignmentCount:inputs.length}); await this.notifications.notifyRoles(user.tenantId,['ADMIN','DIRECTOR'],NotificationType.SHIFT_UPDATED,'シフト更新','月間シフトが手動更新されました。'); return this.buildView(user, schedule);
  }

  async confirm(user: AuthenticatedUser, id: string) {
    const schedule = await this.requireEditable(user, id);
    const view = await this.buildView(user, schedule);
    const saturdayBlocking = await this.saturdayMinimumWarnings(user.tenantId, schedule);
    const blocking = [...view.warnings.filter((warning) => warning.severity === 'blocking'), ...saturdayBlocking];
    if (blocking.length) throw new ConflictException({ message: '確定できない勤務条件があります。', warnings: blocking });
    const confirmed=await this.prisma.monthlyShift.update({ where: { id: schedule.id }, data: { status: MonthlyShiftStatus.CONFIRMED, confirmedByUserId: user.sub, confirmedAt: new Date() } }); await this.audit.create(user.tenantId,user.sub,'SHIFT_CONFIRMED','MonthlyShift',schedule.id); await this.notifications.notifyTenant(user.tenantId,NotificationType.SHIFT_CONFIRMED,'シフト確定',`${this.isoDate(schedule.targetMonth).slice(0,7)}のシフトが確定しました。`); return confirmed;
  }

  async reopen(user: AuthenticatedUser, id: string) {
    const schedule = await this.prisma.monthlyShift.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!schedule) throw new NotFoundException('月間シフトが見つかりません。');
    if (schedule.status !== MonthlyShiftStatus.CONFIRMED) throw new ConflictException('下書きのシフトは再度下書きに戻せません。');
    return this.prisma.monthlyShift.update({ where: { id: schedule.id }, data: { status: MonthlyShiftStatus.DRAFT, confirmedByUserId: null, confirmedAt: null } });
  }

  async generate(user: AuthenticatedUser, id: string) {
    const startedAt = Date.now();
    const schedule = await this.requireEditable(user, id);
    const range = this.monthRange(schedule.targetMonth);
    const [staff, requests, setting, requirements, closedDates, directorMemberships] = await Promise.all([
      this.prisma.staff.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, userId: true, employeeNumber: true, displayName: true, assignedClass: true, employmentType: true, canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: true, lateShiftOnly: true, canWorkSaturdays: true, monthlyWorkHourLimit: true, weeklyAvailableDays: true }, orderBy: { employeeNumber: 'asc' } }),
      this.prisma.shiftRequest.findMany({ where: { tenantId: user.tenantId, status: ShiftRequestStatus.APPROVED, requestDate: { gte: range.start, lt: range.end } }, select: { staffId: true, requestDate: true, requestType: true, reason: true } }),
      this.settings.ensureSetting(user.tenantId),
      this.settings.requirements(user),
      this.prisma.tenantClosedDate.findMany({ where: { tenantId: user.tenantId, closedDate: { gte: range.start, lt: range.end } }, select: { closedDate: true, name: true } }),
      this.prisma.membership.findMany({ where: { tenantId: user.tenantId, role: MembershipRole.DIRECTOR, isActive: true }, select: { userId: true } }),
    ]);
    const directorUserIds = new Set(directorMemberships.map((item) => item.userId));
    const generated = generateRuleBasedSchedule(schedule.targetMonth, staff.map((item) => ({ ...item, isDirector: !!item.userId && directorUserIds.has(item.userId) })), requests, { ...setting, directorClassPlacementMode: setting.directorClassPlacementMode as 'NONE' | 'SHORTAGE_ONLY' | 'NORMAL', classRequirements: requirements, closedDates });
    await this.prisma.$transaction([
      this.prisma.shiftAssignment.deleteMany({ where: { monthlyShiftId: schedule.id } }),
      this.prisma.shiftAssignment.createMany({ data: generated.assignments.map((assignment) => ({ tenantId: user.tenantId, monthlyShiftId: schedule.id, ...assignment })) }),
    ]);
    const processingTimeMs = Date.now() - startedAt;
    const workingAssignmentCount = generated.assignments.filter((item) => (workingShiftTypes as readonly ShiftType[]).includes(item.shiftType)).length;
    const offAssignmentCount = generated.assignments.filter((item) => item.shiftType === ShiftType.OFF).length;
    const leaveAssignmentCount = generated.assignments.length - workingAssignmentCount - offAssignmentCount;
    await this.audit.create(user.tenantId,user.sub,'SHIFT_GENERATED','MonthlyShift',schedule.id,{generatedCount:generated.assignments.length,workingAssignmentCount,offAssignmentCount,leaveAssignmentCount}); await this.notifications.notifyRoles(user.tenantId,['ADMIN','DIRECTOR'],NotificationType.SHIFT_UPDATED,'シフト自動生成','月間シフトを自動生成しました。'); return { generatedCount: generated.assignments.length, workingAssignmentCount, offAssignmentCount, leaveAssignmentCount, warnings: generated.warnings, processingTimeMs, durationMs: processingTimeMs, warningSummary: this.warningSummary(generated.warnings), appliedSettingsSummary: { weekdayEarlyRequired: setting.weekdayEarlyRequired, weekdayLateRequired: setting.weekdayLateRequired, saturdayEarlyRequired: setting.saturdayEarlyRequired, saturdayLateRequired: setting.saturdayLateRequired, saturdayMinimumStaff: setting.saturdayMinimumStaff, saturdayOperationEnabled: setting.saturdayOperationEnabled, sundayOperationEnabled: setting.sundayOperationEnabled, maxConsecutiveWorkDays: setting.maxConsecutiveWorkDays, maxConsecutiveEarlyDays: setting.maxConsecutiveEarlyDays, maxConsecutiveLateDays: setting.maxConsecutiveLateDays }, closedDateCount: closedDates.length };
  }

  async precheck(user: AuthenticatedUser, id: string) {
    const schedule = await this.requireEditable(user, id); const range = this.monthRange(schedule.targetMonth);
    const [staff, setting, requirements, closedDates, approvedRequests] = await Promise.all([
      this.prisma.staff.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { assignedClass: true, canWorkEarly: true, canWorkLate: true, canWorkSaturdays: true } }),
      this.settings.ensureSetting(user.tenantId), this.settings.requirements(user),
      this.prisma.tenantClosedDate.count({ where: { tenantId: user.tenantId, closedDate: { gte: range.start, lt: range.end } } }),
      this.prisma.shiftRequest.count({ where: { tenantId: user.tenantId, status: ShiftRequestStatus.APPROVED, requestDate: { gte: range.start, lt: range.end } } }),
    ]);
    const warnings: Array<{ code: string; level: 'INFO' | 'WARNING' | 'ERROR'; message: string }> = [];
    const early = staff.filter((item) => item.canWorkEarly).length; const late = staff.filter((item) => item.canWorkLate).length; const saturday = staff.filter((item) => item.canWorkSaturdays).length;
    if (early < setting.weekdayEarlyRequired) warnings.push({ code: 'EARLY_CAPACITY', level: 'ERROR', message: `早出可能職員が平日必要人数を${setting.weekdayEarlyRequired - early}人下回っています。` });
    if (late < setting.weekdayLateRequired) warnings.push({ code: 'LATE_CAPACITY', level: 'ERROR', message: `遅出可能職員が平日必要人数を${setting.weekdayLateRequired - late}人下回っています。` });
    if (setting.saturdayOperationEnabled && saturday < setting.saturdayMinimumStaff) warnings.push({ code: 'SATURDAY_CAPACITY', level: 'ERROR', message: `土曜勤務可能職員が最低人数を${setting.saturdayMinimumStaff - saturday}人下回っています。` });
    for (const requirement of requirements.filter((item) => item.isActive)) { const count = staff.filter((item) => item.assignedClass === requirement.classType).length; if (count < requirement.weekdayRequired) warnings.push({ code: 'CLASS_CAPACITY', level: 'WARNING', message: `${requirement.classType}の所属職員が平日必要人数を満たしていません。` }); }
    return { canGenerate: true, fatalIssues: [], warnings, warningSummary: this.warningSummary(warnings), summary: { activeStaffCount: staff.length, earlyCapableCount: early, lateCapableCount: late, saturdayCapableCount: saturday, classCounts: Object.fromEntries(requirements.map((r) => [r.classType, staff.filter((item) => item.assignedClass === r.classType).length])), closedDateCount: closedDates, approvedRequestCount: approvedRequests, settings: setting } };
  }

  private async buildView(user: AuthenticatedUser, schedule: { id: string; tenantId: string; targetMonth: Date; status: MonthlyShiftStatus; createdByUserId: string; confirmedByUserId: string | null; confirmedAt: Date | null; createdAt: Date; updatedAt: Date }, staffId?: string) {
    const range = this.monthRange(schedule.targetMonth);
    const manager = this.isManager(user);
    const [rawAssignments, rawStaff, requests, directorMemberships] = await Promise.all([
      this.prisma.shiftAssignment.findMany({ where: { monthlyShiftId: schedule.id, ...(staffId ? { staffId } : {}) }, include: assignmentInclude, orderBy: [{ staff: { employeeNumber: 'asc' } }, { workDate: 'asc' }] }),
      manager ? this.activeStaff(user.tenantId, staffId) : Promise.resolve([]),
      manager ? this.prisma.shiftRequest.findMany({ where: { tenantId: user.tenantId, requestDate: { gte: range.start, lt: range.end }, ...(staffId ? { staffId } : {}) }, include: { staff: { select: { id: true, displayName: true } } }, orderBy: { requestDate: 'asc' } }) : Promise.resolve([]),
      this.prisma.membership.findMany({ where: { tenantId: user.tenantId, role: MembershipRole.DIRECTOR, isActive: true }, select: { userId: true } }),
    ]);
    const directorUserIds = new Set(directorMemberships.map((item) => item.userId));
    const mark = <T extends { userId: string | null }>(item: T) => ({ ...item, isDirector: !!item.userId && directorUserIds.has(item.userId) });
    const assignments = rawAssignments.map((item) => ({ ...item, staff: mark(item.staff) }));
    const staff = rawStaff.map(mark);
    return { schedule, assignments, staff, requests, warnings: manager ? this.warnings(assignments, requests) : [] };
  }

  private warnings(assignments: Array<any>, requests: Array<any>): Warning[] {
    const warnings: Warning[] = [];
    const requestMap = new Map(requests.filter((request) => request.status === ShiftRequestStatus.APPROVED || request.status === ShiftRequestStatus.PENDING).map((request) => [`${request.staffId}:${this.isoDate(request.requestDate)}`, request]));
    const byStaff = new Map<string, Array<any>>();
    for (const assignment of assignments) {
      const key = `${assignment.staffId}:${this.isoDate(assignment.workDate)}`;
      const request = requestMap.get(key);
      const date = this.isoDate(assignment.workDate);
      if (request && workingShiftTypes.includes(assignment.shiftType)) warnings.push({ code: request.status === ShiftRequestStatus.APPROVED ? 'APPROVED_REQUEST_CONFLICT' : 'PENDING_REQUEST_CONFLICT', staffId: assignment.staffId, workDate: date, message: `${assignment.staff.displayName}さんの${request.status === ShiftRequestStatus.APPROVED ? '承認済み' : '申請中'}希望休と勤務が重複しています。`, severity: request.status === ShiftRequestStatus.APPROVED ? 'blocking' : 'warning' });
      if (assignment.shiftType === ShiftType.EARLY && !assignment.staff.canWorkEarly) warnings.push(this.warning('EARLY_NOT_AVAILABLE', assignment, '早出不可の職員に早出を割り当てています。'));
      if (assignment.shiftType === ShiftType.LATE && !assignment.staff.canWorkLate) warnings.push(this.warning('LATE_NOT_AVAILABLE', assignment, '遅出不可の職員に遅出を割り当てています。'));
      if (new Date(`${date}T00:00:00Z`).getUTCDay() === 6 && workingShiftTypes.includes(assignment.shiftType) && !assignment.staff.canWorkSaturdays) warnings.push(this.warning('SATURDAY_NOT_AVAILABLE', assignment, '土曜日勤務不可の職員に勤務を割り当てています。'));
      const list = byStaff.get(assignment.staffId) ?? []; list.push(assignment); byStaff.set(assignment.staffId, list);
    }
    for (const [staffId, list] of byStaff) {
      const staff = list[0].staff;
      const minutes = list.reduce((sum, assignment) => sum + this.minutes(assignment), 0);
      if (staff.monthlyWorkHourLimit && minutes > staff.monthlyWorkHourLimit * 60) warnings.push({ code: 'MONTHLY_HOURS_LIMIT', staffId, workDate: this.isoDate(list[0].workDate), message: `${staff.displayName}さんの月間勤務時間が上限を超えています（概算）。`, severity: 'warning' });
      const weeks = new Map<string, number>();
      for (const assignment of list.filter((item) => workingShiftTypes.includes(item.shiftType))) { const week = this.weekKey(this.isoDate(assignment.workDate)); weeks.set(week, (weeks.get(week) ?? 0) + 1); }
      if (staff.weeklyAvailableDays && [...weeks.values()].some((days) => days > staff.weeklyAvailableDays)) warnings.push({ code: 'WEEKLY_DAYS_LIMIT', staffId, workDate: this.isoDate(list[0].workDate), message: `${staff.displayName}さんの週勤務可能日数を超えています。`, severity: 'warning' });
    }
    return warnings;
  }

  private assignmentData(schedule: { id: string; tenantId: string }, input: AssignmentInputDto) {
    const defaults = shiftTypeDefaults[input.shiftType as ShiftType];
    return { tenantId: schedule.tenantId, monthlyShiftId: schedule.id, staffId: input.staffId, workDate: this.date(input.workDate), shiftType: input.shiftType, startTime: input.startTime === undefined ? (defaults?.startTime ?? null) : input.startTime, endTime: input.endTime === undefined ? (defaults?.endTime ?? null) : input.endTime, breakMinutes: input.breakMinutes ?? null, note: input.note?.trim() || null, assignedClass: (workingShiftTypes as readonly ShiftType[]).includes(input.shiftType) ? (input.assignedClass ?? null) : null };
  }

  private async saturdayMinimumWarnings(tenantId: string, schedule: { id: string; targetMonth: Date }): Promise<Warning[]> {
    const setting = await this.settings.ensureSetting(tenantId);
    if (!setting.saturdayOperationEnabled || setting.saturdayMinimumStaff <= 0) return [];
    const range = this.monthRange(schedule.targetMonth);
    const [assignments, closedDates] = await Promise.all([
      this.prisma.shiftAssignment.findMany({ where: { monthlyShiftId: schedule.id }, select: { workDate: true, shiftType: true } }),
      this.prisma.tenantClosedDate.findMany({ where: { tenantId, closedDate: { gte: range.start, lt: range.end } }, select: { closedDate: true } }),
    ]);
    const closed = new Set(closedDates.map((item) => this.isoDate(item.closedDate)));
    const counts = new Map<string, number>();
    for (const assignment of assignments) if ((workingShiftTypes as readonly ShiftType[]).includes(assignment.shiftType)) {
      const date = this.isoDate(assignment.workDate);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    const warnings: Warning[] = [];
    for (let date = new Date(range.start); date < range.end; date.setUTCDate(date.getUTCDate() + 1)) {
      const key = this.isoDate(date);
      if (date.getUTCDay() !== 6 || closed.has(key)) continue;
      const assigned = counts.get(key) ?? 0;
      if (assigned < setting.saturdayMinimumStaff) warnings.push({ code: 'SATURDAY_MINIMUM_SHORTAGE', staffId: '', workDate: key, message: `土曜最低勤務人数${setting.saturdayMinimumStaff}人に対し${assigned}人です。`, severity: 'blocking' });
    }
    return warnings;
  }

  private async requireEditable(user: AuthenticatedUser, id: string) {
    const schedule = await this.prisma.monthlyShift.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!schedule) throw new NotFoundException('月間シフトが見つかりません。');
    if (schedule.status !== MonthlyShiftStatus.DRAFT) throw new ConflictException('確定済みシフトは下書きへ戻してから編集してください。');
    return schedule;
  }
  private async requireOwnStaff(user: AuthenticatedUser) { const staff = await this.prisma.staff.findUnique({ where: { tenantId_userId: { tenantId: user.tenantId, userId: user.sub } } }); if (!staff?.isActive) throw new ForbiddenException('有効な職員情報が紐づいていません。'); return staff; }
  private async requireTenantStaff(tenantId: string, staffId: string) { const staff = await this.prisma.staff.findFirst({ where: { id: staffId, tenantId } }); if (!staff) throw new NotFoundException('職員が見つかりません。'); return staff; }
  private activeStaff(tenantId: string, staffId?: string) { return this.prisma.staff.findMany({ where: { tenantId, isActive: true, ...(staffId ? { id: staffId } : {}) }, select: staffSelect, orderBy: { employeeNumber: 'asc' } }); }
  private isManager(user: AuthenticatedUser) { return shiftManagerRoles.includes(user.role as any); }
  private monthDate(month: string) { const date = new Date(`${month}-01T00:00:00.000Z`); if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 7) !== month) throw new BadRequestException('monthが正しい年月ではありません。'); return date; }
  private monthRange(month: Date) { const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)); return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) }; }
  private date(value: string) { const date = new Date(`${value}T00:00:00.000Z`); if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('workDateが正しい日付ではありません。'); return date; }
  private validateAssignmentInput(input: AssignmentInputDto, range: { start: Date; end: Date }) { const workDate = this.date(input.workDate); if (workDate < range.start || workDate >= range.end) throw new BadRequestException('対象月外の日付は登録できません。'); if (input.startTime && input.endTime && input.startTime >= input.endTime) throw new BadRequestException('startTimeはendTimeより前に指定してください。'); }
  private validateUniqueInputs(inputs: AssignmentInputDto[]) { const keys = new Set(inputs.map((input) => `${input.staffId}:${input.workDate}`)); if (keys.size !== inputs.length) throw new ConflictException('同一職員・同一日の明細を重複して保存できません。'); }
  private warning(code: string, assignment: any, message: string): Warning { return { code, staffId: assignment.staffId, workDate: this.isoDate(assignment.workDate), message: `${assignment.staff.displayName}さん：${message}`, severity: 'warning' }; }
  private warningSummary(warnings: Array<{ code: string; level: string }>) { const byCode: Record<string, number> = {}; const levels = { INFO: 0, WARNING: 0, ERROR: 0 }; for (const warning of warnings) { byCode[warning.code] = (byCode[warning.code] ?? 0) + 1; if (warning.level in levels) levels[warning.level as keyof typeof levels] += 1; } return { ...levels, byCode }; }
  private isoDate(value: Date) { return value.toISOString().slice(0, 10); }
  private minutes(assignment: any) { if (!workingShiftTypes.includes(assignment.shiftType)) return 0; const defaults = shiftTypeDefaults[assignment.shiftType as ShiftType]; const start = assignment.startTime ?? defaults?.startTime; const end = assignment.endTime ?? defaults?.endTime; if (!start || !end) return 0; const [sh, sm] = start.split(':').map(Number); const [eh, em] = end.split(':').map(Number); return Math.max(0, eh * 60 + em - sh * 60 - sm - (assignment.breakMinutes ?? 0)); }
  private weekKey(dateValue: string) { const date = new Date(`${dateValue}T00:00:00Z`); const day = (date.getUTCDay() + 6) % 7; date.setUTCDate(date.getUTCDate() - day); return date.toISOString().slice(0, 10); }
}
