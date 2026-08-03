import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ShiftType } from '@prisma/client';
import type { AuthenticatedUser } from '../../../infrastructure/auth/auth.types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { FeaturesService } from '../../features/features.service';

const TENANT_CODE = 'MUSUBI-PROVISIONAL';
const workingTypes = new Set<ShiftType>([ShiftType.EARLY, ShiftType.NORMAL, ShiftType.LATE, ShiftType.OTHER]);
const infantClasses = new Set(['AGE_0', 'AGE_1', 'AGE_2']);
const childClasses = new Set(['AGE_3', 'AGE_4', 'AGE_5']);

@Injectable()
export class MusubiProvisionalService {
  constructor(private readonly prisma: PrismaService, private readonly features: FeaturesService) {}

  async get(user: AuthenticatedUser, month?: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: user.tenantId, code: TENANT_CODE }, select: { id: true, name: true } });
    if (!tenant) throw new NotFoundException('この園では仮運用確認パッケージを利用できません。');
    let enabled = false;
    try { enabled = (await this.features.resolve(user.tenantId, 'TENANT_CUSTOM_RULES')).enabled; } catch { throw new ForbiddenException('園固有機能の状態を確認できません。'); }
    if (!enabled) throw new ForbiddenException('園固有機能が無効です。');
    const targetMonth = this.month(month);
    const end = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 1));
    const [staff, schedule, setting, classRequirements] = await Promise.all([
      this.prisma.staff.findMany({
        where: { tenantId: user.tenantId, isActive: true }, orderBy: { employeeNumber: 'asc' },
        select: { id: true, employeeNumber: true, displayName: true, assignedClass: true, canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: true, regularWorkStartTime: true, regularWorkEndTime: true, notes: true, attributeAssignments: { where: { isActive: true, OR: [{ startDate: null, endDate: null }, { startDate: { lt: end }, endDate: { gte: targetMonth } }] }, select: { attributeDefinition: { select: { code: true } } } } },
      }),
      this.prisma.monthlyShift.findUnique({ where: { tenantId_targetMonth: { tenantId: user.tenantId, targetMonth } }, include: { assignments: { select: { staffId: true, workDate: true, shiftType: true, assignedClass: true } } } }),
      this.prisma.tenantShiftSetting.findUnique({ where: { tenantId: user.tenantId } }),
      this.prisma.classStaffingRequirement.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { classType: 'asc' } }),
    ]);
    const attributeCodes = new Map(staff.map((row) => [row.id, new Set(row.attributeAssignments.map((item) => item.attributeDefinition.code))]));
    const excluded = staff.filter((row) => row.employeeNumber === 'MANAGER-01' || attributeCodes.get(row.id)?.has('GENERATOR_EXCLUDED'));
    const candidateIds = new Set(staff.filter((row) => !excluded.includes(row)).map((row) => row.id));
    const assignments = schedule?.assignments ?? [];
    const countsByStaff = new Map<string, Record<string, number>>();
    for (const row of staff) countsByStaff.set(row.id, { EARLY: 0, NORMAL: 0, LATE: 0, OFF: 0, OTHER: 0, workDays: 0 });
    for (const assignment of assignments) { const count = countsByStaff.get(assignment.staffId); if (!count) continue; count[assignment.shiftType] = (count[assignment.shiftType] ?? 0) + 1; if (workingTypes.has(assignment.shiftType)) count.workDays += 1; }
    const lateByDate = new Map<string, string[]>();
    for (const item of assignments.filter((row) => row.shiftType === ShiftType.LATE)) { const key = item.workDate.toISOString().slice(0, 10); lateByDate.set(key, [...(lateByDate.get(key) ?? []), item.staffId]); }
    const warnings = [...lateByDate.entries()].filter(([, ids]) => ids.length > 0 && ids.every((id) => attributeCodes.get(id)?.has('TEST_NEW'))).map(([date]) => ({ level: 'ERROR', code: 'PROVISIONAL_LATE_ONLY_NEW', date, message: '遅出担当が新人区分のみです。経験者を含む配置を確認してください。' }));
    return {
      provisional: true, productionUseAllowed: false, month: targetMonth.toISOString().slice(0, 7), tenantName: tenant.name,
      notice: 'この画面の人数・クラス・経験区分は匿名の仮設定です。正式運用値ではありません。',
      staffCountNotice: '総職員数は24名と伺っていますが、現在確認できる職員区分は23名分です。残り1名は次回訪問時に確認します。',
      counts: { reportedTotalStaffCount: 24, representedStaffCount: staff.length, unconfirmedStaffCount: 1, generatorCandidateCount: candidateIds.size, generatorExcludedCount: excluded.length },
      generatorExcludedCodes: excluded.map((row) => row.employeeNumber),
      supportRules: [
        { code: 'SUPPORT-01', time: '7:30～16:00', rule: '早出専任。希望休・休日・勤務不可日は配置しません。' },
        { code: 'SUPPORT-02', time: '8:45～17:15', rule: '固定の通常勤務。早出・遅出には配置しません。' },
      ],
      settings: setting ? { weekdayEarlyRequired: setting.weekdayEarlyRequired, weekdayLateRequired: setting.weekdayLateRequired, saturdayMinimumStaff: setting.saturdayMinimumStaff, saturdayEarlyRequired: setting.saturdayEarlyRequired, saturdayLateRequired: setting.saturdayLateRequired } : null,
      classRequirements: classRequirements.map((row) => ({ classType: row.classType, weekdayRequired: row.weekdayRequired, saturdayRequired: row.saturdayRequired })),
      groupAssignmentCounts: { infant: assignments.filter((row) => workingTypes.has(row.shiftType) && row.assignedClass && infantClasses.has(row.assignedClass)).length, child: assignments.filter((row) => workingTypes.has(row.shiftType) && row.assignedClass && childClasses.has(row.assignedClass)).length },
      schedule: schedule ? { id: schedule.id, status: schedule.status, assignmentCount: assignments.length } : null,
      warnings,
      staff: staff.map((row) => ({ code: row.employeeNumber, displayName: row.displayName, assignedClass: row.assignedClass, generatorEligible: candidateIds.has(row.id), experience: [...(attributeCodes.get(row.id) ?? [])].find((code) => code.startsWith('TEST_')) ?? null, workTime: row.regularWorkStartTime && row.regularWorkEndTime ? `${row.regularWorkStartTime}～${row.regularWorkEndTime}` : null, capabilities: { early: row.canWorkEarly, regular: row.canWorkRegular, late: row.canWorkLate, earlyOnly: row.earlyShiftOnly }, shiftCounts: countsByStaff.get(row.id) })),
      unresolvedItems: ['未確認の24人目の職員区分', 'REG-14・REG-15の正式役割', '正式な経験区分とクラス編成', 'PART-04の早出・遅出可否', '子育て支援担当の土曜勤務'],
    };
  }

  private month(value?: string) { const text = value ?? new Date().toISOString().slice(0, 7); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) throw new BadRequestException('monthはYYYY-MM形式で指定してください。'); return new Date(`${text}-01T00:00:00.000Z`); }
}
