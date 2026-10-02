import { assertMonthlySubmitted } from './monthly-submission';
import { ManagerResolutionService, reviewDigest } from './manager-resolution.service';
import { applyMonthlyAnswers, validateAnswerAssignments } from '../../application/manager-resolution/monthly-effects';
import { draftScope } from '../../application/manager-resolution/resolution';
import { readProvisionalSoftRules } from '../../application/shifts/provisional-soft-rules';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MembershipRole, MonthlyShiftStatus, NotificationType, Prisma, ShiftRequestStatus, ShiftType, StaffWorkRuleType } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { shiftManagerRoles, shiftTypeDefaults, workingShiftTypes } from '../../domain/shifts/monthly-shift';
import { generateRuleBasedSchedule } from '../../application/shifts/rule-based-shift-generator';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import type { AssignmentInputDto } from './save-assignments.dto';
import { WorkPatternsService } from '../work-patterns/work-patterns.service';
import { FeaturesService } from '../features/features.service';
import { fiscalYearForDate, fiscalYearRange } from '../../application/annual-fairness/fiscal-year-range';
import { calculateAnnualFairnessProgress } from '../../application/annual-fairness/annual-fairness-progress';
import { resolveDailyPrescribedMinutes } from '../../application/annual-fairness/daily-prescribed-minutes';
import { assignmentTimeBreakdown } from '../../application/attendance/assignment-time-breakdown';
import { materializeFixedAssignments } from '../../application/shifts/fixed-assignment-materializer';
import { MonthlyGenerationContextBuilder, jsonStrings } from '../../application/shifts/monthly-generation-context-builder';
import { classifyGenerationDiagnostic, hasBlockingDiagnostics, validateGenerationContext } from '../../application/shifts/generation-preflight-validator';

const staffSelect = { id: true, userId: true, employeeNumber: true, displayName: true, employmentType: true, assignedClass: true, canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: true, lateShiftOnly: true, canWorkSaturdays: true, monthlyWorkHourLimit: true, monthlyTargetWorkDays: true, monthlyTargetWorkHours: true, weeklyAvailableDays: true, regularWorkStartTime: true, regularWorkEndTime: true, isActive: true } as const;
const assignmentInclude = { staff: { select: staffSelect }, workPattern: { select: { id: true, code: true, name: true, shortName: true, color: true, isActive: true } }, attendanceModifier: true } as const;
type Warning = { code: string; staffId: string; workDate: string; message: string; severity: 'info' | 'warning' | 'blocking' };

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService, private readonly notifications: NotificationsService, private readonly audit: AuditService, private readonly workPatterns: WorkPatternsService, private readonly features: FeaturesService, private readonly generationContexts: MonthlyGenerationContextBuilder, private readonly reviews: ManagerResolutionService) {}

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
    const items=await this.reviews.rows(user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7));const blocked=new Set(draftScope(items,user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7)).blockedCells);if(inputs.some(i=>blocked.has(JSON.stringify([i.staffId,i.workDate]))))throw new ConflictException('管理者確認待ちのセルは直接保存できません。');
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
    await this.validateFixedClassSpecialShiftUniqueness(user.tenantId, schedule.id, inputs, staff);
    const staffById = new Map(staff.map((member) => [member.id, member]));
    await this.prisma.$transaction(async db=>{
      await db.$queryRaw`SELECT id FROM "MonthlyShift" WHERE id=${schedule.id}::uuid AND "tenantId"=${user.tenantId}::uuid FOR UPDATE`;
      const current=await db.monthlyShift.findFirst({where:{id:schedule.id,tenantId:user.tenantId}});
      if(!current||current.status!=='DRAFT'||current.updatedAt.getTime()!==schedule.updatedAt.getTime()||reviewDigest(await this.reviews.rows(user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7),db))!==reviewDigest(items))throw new ConflictException('下書きまたは確認事項が更新されています。');
    for(const input of inputs) await db.shiftAssignment.upsert({
      where: { monthlyShiftId_staffId_workDate: { monthlyShiftId: schedule.id, staffId: input.staffId, workDate: this.date(input.workDate) } },
      create: this.assignmentData(schedule, input, staffById.get(input.staffId)),
      update: this.assignmentData(schedule, input, staffById.get(input.staffId)),
    });
      await db.monthlyShift.update({where:{id:schedule.id},data:{updatedAt:new Date()}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    await this.audit.create(user.tenantId,user.sub,'SHIFT_ASSIGNMENTS_SAVED','MonthlyShift',schedule.id,{assignmentCount:inputs.length}); await this.notifications.notifyRoles(user.tenantId,['ADMIN','DIRECTOR'],NotificationType.SHIFT_UPDATED,'シフト更新','月間シフトが手動更新されました。'); return this.buildView(user, schedule);
  }

  async confirm(user: AuthenticatedUser, id: string) {
    const schedule = await this.requireEditable(user, id);
    await assertMonthlySubmitted(this.prisma,user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7));
    const reviewItems=await this.reviews.rows(user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7));
    if(!draftScope(reviewItems,user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7)).canFinalize)throw new ConflictException('管理者確認または再評価が未完了です。');
    const context = await this.buildGenerationContext(user.tenantId, schedule.targetMonth, schedule.id);
    if(reviewDigest(context.managerReviewItems)!==reviewDigest(reviewItems))throw new ConflictException('確認事項が更新されています。');
    if(validateAnswerAssignments(context,reviewItems).length)throw new ConflictException('管理者回答と保存済み勤務が一致しません。下書きを再評価してください。');
    const diagnostics = validateGenerationContext(context, 'CONFIRM');
    const view = await this.buildView(user, schedule);
    const saturdayBlocking = await this.saturdayMinimumWarnings(user.tenantId, schedule);
    const blocking = [...diagnostics.filter((item) => item.severity === 'ERROR').map((item) => this.diagnosticWarning(item)), ...view.warnings.filter((warning) => warning.severity === 'blocking'), ...saturdayBlocking];
    if (blocking.length) throw new ConflictException({ message: '確定できない勤務条件があります。', diagnostics: diagnostics.filter((item) => item.severity === 'ERROR'), warnings: blocking });
    const confirmed=await this.prisma.$transaction(async db=>{
      await assertMonthlySubmitted(db,user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7));
      await db.$queryRaw`SELECT id FROM "MonthlyShift" WHERE id=${schedule.id}::uuid AND "tenantId"=${user.tenantId}::uuid FOR UPDATE`;
      const current=await db.monthlyShift.findFirst({where:{id:schedule.id,tenantId:user.tenantId}});
      const currentReviews=await this.reviews.rows(user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7),db);
      if(!current||current.status!=='DRAFT'||current.updatedAt.getTime()!==schedule.updatedAt.getTime()||reviewDigest(currentReviews)!==reviewDigest(reviewItems))throw new ConflictException('下書きまたは確認事項が更新されています。');
      if(currentReviews.length){const last=await db.auditLog.findFirst({where:{tenantId:user.tenantId,targetId:schedule.id,action:'MANAGER_REVIEW_DRAFT_EVALUATED'},orderBy:{createdAt:'desc'}});if((last?.detail as {reviewDigest?:string}|null)?.reviewDigest!==reviewDigest(currentReviews))throw new ConflictException('管理者回答後の下書き再評価が必要です。');}
      return db.monthlyShift.update({where:{id:schedule.id},data:{status:MonthlyShiftStatus.CONFIRMED,confirmedByUserId:user.sub,confirmedAt:new Date()}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}); await this.audit.create(user.tenantId,user.sub,'SHIFT_CONFIRMED','MonthlyShift',schedule.id); await this.notifications.notifyTenant(user.tenantId,NotificationType.SHIFT_CONFIRMED,'シフト確定',`${this.isoDate(schedule.targetMonth).slice(0,7)}のシフトが確定しました。`); return confirmed;
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
    await this.workPatterns.ensureSystemPatterns(user.tenantId);
    const generationContext = await this.buildGenerationContext(user.tenantId, schedule.targetMonth, schedule.id);
    const reviewItems=generationContext.managerReviewItems;
    const reviewState=draftScope(reviewItems,user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7));
    const managerReviewCells=reviewState.blockedCells.map(key=>{const [staffId,date]=JSON.parse(key) as [string,string];return {staffId,date};});
    const preflightDiagnostics = validateGenerationContext(generationContext, 'GENERATE').filter(d=>!(d.code==='HALF_DAY_BASE_ASSIGNMENT_UNCONFIRMED'&&managerReviewCells.some(c=>c.staffId===d.staffId&&c.date===d.date)));
    if (hasBlockingDiagnostics(preflightDiagnostics)) throw new ConflictException({ message: '生成前に解決が必要な勤務条件があります。', diagnostics: preflightDiagnostics, warnings: preflightDiagnostics.filter((item) => item.severity === 'ERROR').map((item) => this.diagnosticWarning(item)) });
    let staffingFeatureEnabled = false; let staffingFeatureLookupFailed = false; let workRuleFeatureEnabled = false; let workRuleFeatureLookupFailed = false; let customRulesEnabled = false;
    try { staffingFeatureEnabled = (await this.features.resolve(user.tenantId, 'ADVANCED_STAFFING_REQUIREMENTS')).enabled; } catch { staffingFeatureLookupFailed = true; }
    try { workRuleFeatureEnabled = (await this.features.resolve(user.tenantId, 'STAFF_WORK_RULES')).enabled; } catch (error) { workRuleFeatureLookupFailed = true; this.logger.warn('StaffWorkRule feature lookup failed; legacy allocation will be used.', error instanceof Error ? error.name : 'UnknownError'); }
    try { customRulesEnabled = (await this.features.resolve(user.tenantId, 'TENANT_CUSTOM_RULES')).enabled; } catch { customRulesEnabled = false; }
    const [staff, requests, setting, requirements, closedDates, managerMemberships, systemPatterns, staffingRequirements, conditionalStaffingRequirements, staffAttributeAssignments, generatorExclusions, staffWorkRules] = await Promise.all([
      Promise.resolve(generationContext.staff),
      Promise.resolve(generationContext.approvedRequests),
      this.settings.ensureSetting(user.tenantId),
      this.settings.requirements(user),
      Promise.resolve(generationContext.closedDates),
      Promise.resolve(generationContext.directorMemberships),
      Promise.resolve(generationContext.workPatterns.filter((pattern) => pattern.isSystem && ['EARLY', 'NORMAL', 'LATE', 'OFF'].includes(pattern.code))),
      Promise.resolve(staffingFeatureEnabled ? generationContext.staffingRequirements : []),
      Promise.resolve(staffingFeatureEnabled ? generationContext.conditionalStaffingRequirements : []),
      Promise.resolve(staffingFeatureEnabled ? generationContext.attributes.map(({ attributeDefinition: _definition, ...row }) => row) : []),
      Promise.resolve(customRulesEnabled ? generationContext.attributes.filter((row) => row.attributeDefinition.code === 'GENERATOR_EXCLUDED').map((row) => ({ staffId: row.staffId })) : []),
      Promise.resolve(workRuleFeatureEnabled ? generationContext.workRules : []),
    ]);
    const managerUserIds = new Set(managerMemberships.map((item) => item.userId));
    const excludedStaffIds = new Set(generatorExclusions.map((item) => item.staffId));
    const fixedAssignmentMarks = customRulesEnabled ? generationContext.attributes.filter((row) => row.attributeDefinition.code === 'FIXED_ASSIGNMENT').map((row) => ({ staffId: row.staffId })) : [];
    const fixedMarkedIds = new Set(fixedAssignmentMarks.map((item) => item.staffId));
    const approvedFixedRequests = generationContext.approvedRequests.filter((row) => fixedMarkedIds.has(row.staffId));
    // The shared preflight above has validated either an existing contract or approved source-backed times.
    const fixedStaff = staff.filter((item) => fixedMarkedIds.has(item.id));
    if (fixedStaff.some((item) => !excludedStaffIds.has(item.id))) throw new ConflictException('固定勤務materialization対象者はローテーション生成対象外である必要があります。');
    if (fixedMarkedIds.size !== fixedStaff.length) throw new ConflictException('固定勤務materialization対象者には対象月に有効な勤務時間の根拠が必要です。');
    const generationStaff = staff.filter((item) => (!item.userId || !managerUserIds.has(item.userId)) && !excludedStaffIds.has(item.id) && !fixedMarkedIds.has(item.id));
    const patternByCode = new Map(systemPatterns.map((pattern) => [pattern.code, pattern]));
    const early = patternByCode.get('EARLY'); const normal = patternByCode.get('NORMAL'); const late = patternByCode.get('LATE');
    const customRuleConfiguration = customRulesEnabled ? generationContext.features.TENANT_CUSTOM_RULES.configuration : {};
    const weeklyGroupConfiguration = customRuleConfiguration.weeklyPatternGroupLimit && typeof customRuleConfiguration.weeklyPatternGroupLimit === 'object' && !Array.isArray(customRuleConfiguration.weeklyPatternGroupLimit) ? customRuleConfiguration.weeklyPatternGroupLimit as Record<string, unknown> : null;
    const weeklyRelaxationConfiguration = weeklyGroupConfiguration?.relaxation && typeof weeklyGroupConfiguration.relaxation === 'object' && !Array.isArray(weeklyGroupConfiguration.relaxation) ? weeklyGroupConfiguration.relaxation as Record<string, unknown> : null;
    const weeklyPatternCodes = Array.isArray(weeklyGroupConfiguration?.patternCodes) ? weeklyGroupConfiguration.patternCodes.filter((value): value is string => typeof value === 'string') : [];
    const weeklyPatternRows = generationContext.workPatterns.filter((row) => weeklyPatternCodes.includes(row.code)).map(({ id, code }) => ({ id, code }));
    const transitionConfigurations = Array.isArray(customRuleConfiguration.nextDayBlockedPatternTransitions) ? customRuleConfiguration.nextDayBlockedPatternTransitions.filter((value): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)) : [];
    const meetingDayRules = Array.isArray(customRuleConfiguration.meetingDayRules) ? customRuleConfiguration.meetingDayRules.filter((value): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)).flatMap((value) => typeof value.dayOfWeek === 'number' && typeof value.occurrence === 'number' && typeof value.minimumEndTime === 'string' ? [{ dayOfWeek: value.dayOfWeek, occurrence: value.occurrence, minimumEndTime: value.minimumEndTime }] : []) : [];
    const formalExceptionRows = customRulesEnabled ? generationContext.ruleExceptions : [];
    const formalApprovedExceptions = formalExceptionRows.filter((row) => row.exceptionType === 'WEEKLY_ROTATION_LIMIT').flatMap((row) => { const configuration = row.configuration && typeof row.configuration === 'object' && !Array.isArray(row.configuration) ? row.configuration as Record<string, unknown> : {}; return configuration.maxWeeklyRotationCount === 3 && typeof configuration.maxAssignments === 'number' && row.sourceType === 'ADMIN_CONFIRMED' && row.confirmedAt ? [{ date: this.isoDate(row.exceptionDate), maxPerWeek: 3 as const, maxAssignments: configuration.maxAssignments, sourceType: 'ADMIN_CONFIRMED' as const, sourceReference: row.sourceReference ?? `TenantRuleException:${row.id}`, confirmedAt: this.isoDate(row.confirmedAt), reason: row.reason }] : []; });
    const staffByCode = new Map(staff.map((row) => [row.employeeNumber, row]));
    const staffPatternExceptionRows = formalExceptionRows.flatMap((row) => {
      const configuration = row.configuration && typeof row.configuration === 'object' && !Array.isArray(row.configuration) ? row.configuration as Record<string, unknown> : {};
      const logicalType = row.exceptionType.split(':')[0];
      return (logicalType === 'STAFF_WORK_PATTERN' || logicalType === 'HARD_RULE_OVERRIDE') && typeof configuration.staffCode === 'string' && typeof configuration.workPatternCode === 'string' && row.sourceType === 'ADMIN_CONFIRMED' && row.confirmedAt
        ? [{ row, configuration, logicalType, staffCode: configuration.staffCode, workPatternCode: configuration.workPatternCode }]
        : [];
    });
    const exceptionPatterns = generationContext.workPatterns.filter((row) => new Set(staffPatternExceptionRows.map((item) => item.workPatternCode)).has(row.code));
    const exceptionPatternByCode = new Map(exceptionPatterns.map((row) => [row.code, row]));
    const dateSpecificWorkRules = staffPatternExceptionRows.flatMap((item) => { const member = staffByCode.get(item.staffCode); const pattern = exceptionPatternByCode.get(item.workPatternCode); return member && pattern ? [{ id: `TenantRuleException:${item.row.id}`, staffId: member.id, ruleType: StaffWorkRuleType.FIXED_WORK_PATTERN, dayOfWeek: null, startDate: item.row.exceptionDate, endDate: item.row.exceptionDate, startTime: null, endTime: null, numericValue: null, priority: 0, isHardConstraint: true, workPattern: pattern }] : []; });
    const approvedHardRuleOverrides = staffPatternExceptionRows.filter((item) => item.logicalType === 'HARD_RULE_OVERRIDE').flatMap((item) => { const member = staffByCode.get(item.staffCode); const pattern = exceptionPatternByCode.get(item.workPatternCode); return member && pattern ? [{ date: this.isoDate(item.row.exceptionDate), staffId: member.id, workPatternId: pattern.id, sourceType: 'ADMIN_CONFIRMED' as const, sourceReference: item.row.sourceReference ?? `TenantRuleException:${item.row.id}`, confirmedAt: this.isoDate(item.row.confirmedAt!), reason: item.row.reason }] : []; });
    const approvedWeeklyThirdAssignmentExceptions = formalApprovedExceptions;
    const weeklyExemptAttributeCode = typeof weeklyGroupConfiguration?.exemptAttributeCode === 'string' ? weeklyGroupConfiguration.exemptAttributeCode : null;
    const weeklyExemptAssignments = weeklyExemptAttributeCode ? generationContext.attributes.filter((row) => row.attributeDefinition.code === weeklyExemptAttributeCode).map((row) => ({ staffId: row.staffId })) : [];
    const effectiveSetting = { ...setting, defaultStartEarly: early?.startTime ?? setting.defaultStartEarly, defaultEndEarly: early?.endTime ?? setting.defaultEndEarly, defaultStartNormal: normal?.startTime ?? setting.defaultStartNormal, defaultEndNormal: normal?.endTime ?? setting.defaultEndNormal, defaultStartLate: late?.startTime ?? setting.defaultStartLate, defaultEndLate: late?.endTime ?? setting.defaultEndLate, defaultBreakMinutes: normal?.breakMinutes ?? setting.defaultBreakMinutes };
    const fiscalRange = fiscalYearRange(fiscalYearForDate(schedule.targetMonth, setting.fiscalYearStartMonth), setting.fiscalYearStartMonth); const generationStaffIds = generationStaff.map((member) => member.id);
    const historyYears = typeof weeklyRelaxationConfiguration?.historyYears === 'number' && weeklyRelaxationConfiguration.historyYears >= 2 && weeklyRelaxationConfiguration.historyYears <= 3 ? weeklyRelaxationConfiguration.historyYears : 3;
    const recentWindowDays = typeof weeklyRelaxationConfiguration?.recentWindowDays === 'number' && weeklyRelaxationConfiguration.recentWindowDays >= 28 && weeklyRelaxationConfiguration.recentWindowDays <= 180 ? weeklyRelaxationConfiguration.recentWindowDays : 90;
    const longTermStart = new Date(range.start); longTermStart.setUTCFullYear(longTermStart.getUTCFullYear() - historyYears);
    const recentStart = new Date(range.start); recentStart.setUTCDate(recentStart.getUTCDate() - recentWindowDays);
    const [contracts, confirmedAssignments] = await Promise.all([
      this.prisma.staffWorkContract.findMany({ where: { tenantId: user.tenantId, staffId: { in: generationStaffIds }, effectiveFrom: { lt: fiscalRange.endExclusive }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: longTermStart } }] }, select: { staffId: true, effectiveFrom: true, effectiveTo: true, annualizedTargetMinutes: true, prescribedDailyMinutes: true, voidedAt: true } }),
      this.prisma.shiftAssignment.findMany({ where: { tenantId: user.tenantId, staffId: { in: generationStaffIds }, workDate: { gte: longTermStart, lt: fiscalRange.endExclusive }, monthlyShift: { status: MonthlyShiftStatus.CONFIRMED } }, select: { staffId: true, workDate: true, shiftType: true, workPatternId: true, startTime: true, endTime: true, breakMinutes: true } }),
    ]);
    const annualFairnessByStaff = new Map(generationStaff.map((member) => { const workContracts = contracts.filter((contract) => contract.staffId === member.id); const assignments = confirmedAssignments.filter((assignment) => assignment.staffId === member.id && assignment.workDate >= fiscalRange.start && assignment.workDate < fiscalRange.endExclusive); const progress = calculateAnnualFairnessProgress({ ...member, workContracts, assignments }, fiscalRange, effectiveSetting); if (progress.calculationStatus !== 'COMPLETE' || progress.target.annualTargetMinutes == null || progress.actual.fairnessActualMinutes == null) return [member.id, undefined] as const; const prescribedMinutesByDate: Record<string, number> = {}; for (let current = new Date(range.start); current < range.end; current.setUTCDate(current.getUTCDate() + 1)) { const resolved = resolveDailyPrescribedMinutes(current, workContracts, member, effectiveSetting).minutes; if (resolved != null) prescribedMinutesByDate[this.isoDate(current)] = resolved; } return [member.id, { annualTargetMinutes: progress.target.annualTargetMinutes, confirmedFairnessMinutes: progress.actual.fairnessActualMinutes, prescribedMinutesByDate }] as const; }));
    const staffingOptions = staffingRequirements.length || conditionalStaffingRequirements.length ? { staffingRequirements, conditionalStaffingRequirements, staffAttributeAssignments } : {};
    const eventWorkRules = generationContext.events.filter((event) => event.affectsGeneration).flatMap((event) => {
      const targetCodes = jsonStrings(event.targetStaffCodes); const targetClasses = jsonStrings(event.targetClasses); const allowedCodes = new Set(jsonStrings(event.allowedWorkPatternCodes));
      if (!allowedCodes.size) return [];
      return staff.filter((member) => (!targetCodes.length || targetCodes.includes(member.employeeNumber)) && (!targetClasses.length || targetClasses.includes(member.assignedClass)) && !(event.fixedTimeStaffAllowed && fixedMarkedIds.has(member.id))).flatMap((member) => generationContext.workPatterns.filter((pattern) => pattern.isWorking && !allowedCodes.has(pattern.code)).map((pattern) => ({ id: `TenantEvent:${event.id}:${member.id}:${pattern.id}`, staffId: member.id, ruleType: StaffWorkRuleType.UNAVAILABLE_WORK_PATTERN, dayOfWeek: null, startDate: event.eventDate, endDate: event.eventDate, startTime: null, endTime: null, numericValue: null, priority: -1, isHardConstraint: true, workPattern: pattern })));
    });
    const effectiveStaffWorkRules = [...staffWorkRules, ...dateSpecificWorkRules, ...eventWorkRules];
    const workRuleOptions = effectiveStaffWorkRules.length ? { staffWorkRules: effectiveStaffWorkRules } : {};
    const priorAssignments = confirmedAssignments.filter((assignment) => assignment.workDate < range.start).map(({ staffId, workDate, shiftType, workPatternId }) => ({ staffId, workDate, shiftType, workPatternId }));
    const maxPerWeek = typeof weeklyGroupConfiguration?.maxPerWeek === 'number' && weeklyGroupConfiguration.maxPerWeek > 0 ? weeklyGroupConfiguration.maxPerWeek : 1;
    const weeklyPatternGroups = weeklyPatternRows.length ? [{ groupCode: typeof weeklyGroupConfiguration?.groupCode === 'string' ? weeklyGroupConfiguration.groupCode : 'TENANT_WEEKLY_PATTERN_GROUP', maxPerWeek, workPatternIds: weeklyPatternRows.map((row) => row.id) }] : undefined;
    const activationMode = weeklyRelaxationConfiguration?.activationMode === 'FORMAL' ? 'FORMAL' as const : weeklyRelaxationConfiguration?.activationMode === 'PROVISIONAL_VALIDATION' ? 'PROVISIONAL_VALIDATION' as const : null;
    const weeklyPatternRelaxation = weeklyRelaxationConfiguration?.enabled === true && activationMode ? { enabled: true, maxPerWeek: typeof weeklyRelaxationConfiguration.maxPerWeek === 'number' && weeklyRelaxationConfiguration.maxPerWeek > maxPerWeek ? weeklyRelaxationConfiguration.maxPerWeek : maxPerWeek + 1, explanationLevel: weeklyRelaxationConfiguration.explanationLevel === 'WARNING' ? 'WARNING' as const : 'INFO' as const, historyYears, recentWindowDays, formalStatus: activationMode } : undefined;
    const systemWorkPatternIds = { [ShiftType.EARLY]: early?.id, [ShiftType.NORMAL]: normal?.id, [ShiftType.LATE]: late?.id };
    const configuredPatternByCode = new Map([...systemPatterns, ...weeklyPatternRows].map((row) => [row.code, row]));
    const patternTransitionBlocks = transitionConfigurations.map((configuration) => ({ fromWorkPatternIds: (Array.isArray(configuration.fromPatternCodes) ? configuration.fromPatternCodes : []).flatMap((code) => typeof code === 'string' && configuredPatternByCode.get(code) ? [configuredPatternByCode.get(code)!.id] : []), toWorkPatternIds: (Array.isArray(configuration.toPatternCodes) ? configuration.toPatternCodes : []).flatMap((code) => typeof code === 'string' && configuredPatternByCode.get(code) ? [configuredPatternByCode.get(code)!.id] : []) })).filter((block) => block.fromWorkPatternIds.length && block.toWorkPatternIds.length);
    const provisionalSoftRules = readProvisionalSoftRules(customRuleConfiguration.release1ProvisionalSoftRules, generationContext.staff, generationContext.workPatterns);
    const generated = generateRuleBasedSchedule(schedule.targetMonth, generationStaff.map((item) => ({ ...item, isDirector: false, annualFairness: annualFairnessByStaff.get(item.id) })), requests, { ...effectiveSetting, managerReviewCells, provisionalSoftRules, directorClassPlacementMode: setting.directorClassPlacementMode as 'NONE' | 'SHORTAGE_ONLY' | 'NORMAL', classRequirements: requirements, closedDates, priorAssignments, weeklyPatternGroups, weeklyPatternGroupExemptStaffIds: weeklyExemptAssignments.map((row) => row.staffId), fixedWorkPatternOverridesWeeklyLimit: customRuleConfiguration.fixedWorkPatternOverridesWeeklyLimit === true, weeklyPatternRelaxation, approvedWeeklyThirdAssignmentExceptions, approvedHardRuleOverrides, fairnessWindows: { recentStart, fiscalStart: fiscalRange.start, longTermStart }, patternTransitionBlocks, systemWorkPatternIds, replaceLegacyShiftTargetsWhenPatternRequirementsActive: customRuleConfiguration.replaceLegacyShiftTargetsWhenPatternRequirementsActive === true, fillOpenUnassignedWithNormal: customRuleConfiguration.fillOpenUnassignedWithNormal === true, meetingDayRules, ...staffingOptions, ...workRuleOptions });
    const fixedAssignments = materializeFixedAssignments({ managerReviewCells, staff: fixedStaff, requests: approvedFixedRequests, start: range.start, end: range.end, closedDates: closedDates.map((item) => item.closedDate), sundayOperationEnabled: setting.sundayOperationEnabled, defaultBreakMinutes: setting.defaultBreakMinutes });
    const allAssignments = [...generated.assignments, ...fixedAssignments];
    if (staffingFeatureLookupFailed) generated.warnings.push({ code: 'STAFFING_REQUIREMENT_FEATURE_LOOKUP_FAILED', level: 'WARNING', workDate: this.isoDate(schedule.targetMonth), message: '属性別配置条件のFeature状態を確認できなかったため、従来方式で生成しました。' });
    if (workRuleFeatureLookupFailed) generated.warnings.push({ code: 'STAFF_WORK_RULE_FEATURE_LOOKUP_FAILED', level: 'WARNING', workDate: this.isoDate(schedule.targetMonth), message: '個別勤務ルールのFeature状態を確認できなかったため、従来方式で生成しました。' });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "MonthlyShift" WHERE id=${schedule.id}::uuid AND "tenantId"=${user.tenantId}::uuid FOR UPDATE`;
      const latest=await transaction.monthlyShift.findFirst({where:{id:schedule.id,tenantId:user.tenantId}});
      if(!latest||latest.status!=='DRAFT'||latest.updatedAt.getTime()!==schedule.updatedAt.getTime()||reviewDigest(await this.reviews.rows(user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7),transaction))!==reviewDigest(reviewItems))throw new ConflictException('下書きまたは確認事項が更新されています。再実行前に確認してください。');
      await transaction.monthlyShift.update({where:{id:schedule.id},data:{updatedAt:new Date()}});
      await transaction.auditLog.create({data:{tenantId:user.tenantId,memberId:user.sub,action:'MANAGER_REVIEW_DRAFT_EVALUATED',targetType:'MonthlyShift',targetId:schedule.id,detail:{reviewDigest:reviewDigest(reviewItems)}}});
      await transaction.shiftAssignment.deleteMany({ where: { monthlyShiftId: schedule.id } });
      await transaction.shiftAssignment.createMany({ data: allAssignments.map(({ countsTowardStaffing: _countsTowardStaffing, attendanceModifier: _attendanceModifier, ...assignment }) => ({ tenantId: user.tenantId, monthlyShiftId: schedule.id, ...assignment, workPatternId: assignment.workPatternId ?? patternByCode.get(assignment.shiftType)?.id ?? null })) });
      const modifierRows = allAssignments.filter((item) => item.attendanceModifier);
      if (!modifierRows.length) return;
      const stored = await transaction.shiftAssignment.findMany({ where: { monthlyShiftId: schedule.id, OR: modifierRows.map((item) => ({ staffId: item.staffId, workDate: item.workDate })) }, select: { id: true, staffId: true, workDate: true } });
      await transaction.shiftAttendanceModifier.createMany({ data: modifierRows.map((item) => { const storedAssignment = stored.find((row) => row.staffId === item.staffId && row.workDate.getTime() === item.workDate.getTime()); if (!storedAssignment || !item.attendanceModifier) throw new Error('Generated attendance modifier assignment was not persisted.'); const request = requests.find((row) => row.staffId === item.staffId && row.requestDate.getTime() === item.workDate.getTime()); return { tenantId: user.tenantId, shiftAssignmentId: storedAssignment.id, modifierType: item.attendanceModifier.modifierType, effectiveStartTime: item.attendanceModifier.effectiveStartTime, effectiveEndTime: item.attendanceModifier.effectiveEndTime, sourceType: item.attendanceModifier.sourceType, sourceReference: request?.id ?? null, confirmedAt: new Date(), confirmedBy: 'APPROVED_REQUEST' }; }) });
    });
    const processingTimeMs = Date.now() - startedAt;
    const workingAssignmentCount = allAssignments.filter((item) => (workingShiftTypes as readonly ShiftType[]).includes(item.shiftType)).length;
    const offAssignmentCount = allAssignments.filter((item) => item.shiftType === ShiftType.OFF).length;
    const leaveAssignmentCount = allAssignments.length - workingAssignmentCount - offAssignmentCount;
    const evaluations = 'staffingRequirementEvaluations' in generated ? generated.staffingRequirementEvaluations : undefined;
    const staffingSummary = { applied: !!evaluations, conditionCount: staffingRequirements.length, hardUnmetCount: evaluations?.filter((item) => item.constraintLevel === 'HARD' && !item.isSatisfied).length ?? 0, softUnmetCount: evaluations?.filter((item) => item.constraintLevel === 'SOFT' && !item.isSatisfied).length ?? 0, infoCount: evaluations?.filter((item) => item.constraintLevel === 'INFO').length ?? 0, featureLookupFailed: staffingFeatureLookupFailed };
    const staffWorkRuleSummary = { applied: staffWorkRules.length > 0, ruleCount: staffWorkRules.length, fixedBlockedCount: generated.warnings.filter((item) => item.code === 'STAFF_WORK_RULE_FIXED_BLOCKED' || item.code === 'STAFF_WORK_RULE_FIXED_PROHIBITED').length, featureLookupFailed: workRuleFeatureLookupFailed };
    const weeklyPatternRelaxationSummary = { applied: !!weeklyPatternRelaxation, formalStatus: weeklyPatternRelaxation?.formalStatus ?? null, historyYears: weeklyPatternRelaxation?.historyYears ?? null, recentWindowDays: weeklyPatternRelaxation?.recentWindowDays ?? null, relaxationCount: generated.weeklyPatternRelaxations.length };
    const presentedWarnings = generated.warnings.map((warning) => ({ ...warning, category: warning.level === 'ERROR' ? 'BUSINESS_DECISION_REQUIRED' as const : warning.level, impact: warning.level === 'ERROR' ? '未解決のままFINAL確定できません。勤務修正・条件確認・対象限定例外を管理者が選択してください。' : '内容を確認してください。', overrideAllowed: warning.level === 'ERROR' }));
    await this.audit.create(user.tenantId,user.sub,'SHIFT_GENERATED','MonthlyShift',schedule.id,{generatedCount:allAssignments.length,rotationGeneratedCount:generated.assignments.length,fixedMaterializedCount:fixedAssignments.length,workingAssignmentCount,offAssignmentCount,leaveAssignmentCount,weeklyPatternRelaxationSummary,approvedWeeklyThirdAssignments:generated.approvedWeeklyThirdAssignments,staffingRequirementSummary:staffingSummary,staffWorkRuleSummary}); await this.notifications.notifyRoles(user.tenantId,['ADMIN','DIRECTOR'],NotificationType.SHIFT_UPDATED,'シフト自動生成','月間シフトを自動生成しました。'); return { generatedCount: allAssignments.length, rotationGeneratedCount: generated.assignments.length, fixedMaterializedCount: fixedAssignments.length, workingAssignmentCount, offAssignmentCount, leaveAssignmentCount, warnings: presentedWarnings, weeklyPatternRelaxations: generated.weeklyPatternRelaxations, approvedWeeklyThirdAssignments: generated.approvedWeeklyThirdAssignments, weeklyPatternRelaxationSummary, processingTimeMs, durationMs: processingTimeMs, warningSummary: this.warningSummary(presentedWarnings), appliedSettingsSummary: { weekdayEarlyRequired: setting.weekdayEarlyRequired, weekdayLateRequired: setting.weekdayLateRequired, saturdayEarlyRequired: setting.saturdayEarlyRequired, saturdayLateRequired: setting.saturdayLateRequired, saturdayMinimumStaff: setting.saturdayMinimumStaff, saturdayOperationEnabled: setting.saturdayOperationEnabled, sundayOperationEnabled: setting.sundayOperationEnabled, maxConsecutiveWorkDays: setting.maxConsecutiveWorkDays, maxConsecutiveEarlyDays: setting.maxConsecutiveEarlyDays, maxConsecutiveLateDays: setting.maxConsecutiveLateDays }, closedDateCount: closedDates.length, ...(evaluations ? { staffingRequirementEvaluations: evaluations } : {}) };
  }

  async precheck(user: AuthenticatedUser, id: string) {
    const schedule = await this.requireEditable(user, id);
    await this.workPatterns.ensureSystemPatterns(user.tenantId);
    const [context, setting, requirements] = await Promise.all([this.buildGenerationContext(user.tenantId, schedule.targetMonth, schedule.id), this.settings.ensureSetting(user.tenantId), this.settings.requirements(user)]);
    const reviewItems=context.managerReviewItems;const blocked=new Set(draftScope(reviewItems,user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7)).blockedCells);
    const staff = context.staff; const diagnostics = validateGenerationContext(context, 'PRECHECK').filter(d=>!(d.code==='HALF_DAY_BASE_ASSIGNMENT_UNCONFIRMED'&&blocked.has(JSON.stringify([d.staffId,d.date]))));
    const warnings: Array<{ code: string; level: 'INFO' | 'WARNING' | 'ERROR'; category?: string; message: string; staffId?: string; workDate?: string; source?: string; reason?: string; impact?: string; allowedActions?: string[]; overrideAllowed?: boolean }> = diagnostics.map((item) => ({ code: item.code, level: item.severity, category: item.category, message: item.reason, ...(item.staffId ? { staffId: item.staffId } : {}), workDate: item.date, source: item.source, reason: item.reason, impact: item.impact, allowedActions: item.allowedActions, overrideAllowed: item.overrideAllowed }));
    const early = staff.filter((item) => item.canWorkEarly).length; const late = staff.filter((item) => item.canWorkLate).length; const saturday = staff.filter((item) => item.canWorkSaturdays).length;
    const capacity = (code: string, message: string) => classifyGenerationDiagnostic({ severity: 'ERROR', code, staffId: null, date: this.isoDate(schedule.targetMonth), source: 'TenantShiftSetting', reason: message, allowedActions: ['別の職員を選択する', '必要人数条件を確認する', '対象限定例外を承認する', '保留して戻る'] });
    if (early < setting.weekdayEarlyRequired) { const item=capacity('EARLY_CAPACITY',`早出可能職員が平日必要人数を${setting.weekdayEarlyRequired - early}人下回っています。`); warnings.push({code:item.code,level:item.severity,category:item.category,message:item.reason,workDate:item.date,source:item.source,impact:item.impact,allowedActions:item.allowedActions,overrideAllowed:item.overrideAllowed}); }
    if (late < setting.weekdayLateRequired) { const item=capacity('LATE_CAPACITY',`遅出可能職員が平日必要人数を${setting.weekdayLateRequired - late}人下回っています。`); warnings.push({code:item.code,level:item.severity,category:item.category,message:item.reason,workDate:item.date,source:item.source,impact:item.impact,allowedActions:item.allowedActions,overrideAllowed:item.overrideAllowed}); }
    if (setting.saturdayOperationEnabled && saturday < setting.saturdayMinimumStaff) { const item=capacity('SATURDAY_CAPACITY',`土曜勤務可能職員が最低人数を${setting.saturdayMinimumStaff - saturday}人下回っています。`); warnings.push({code:item.code,level:item.severity,category:item.category,message:item.reason,workDate:item.date,source:item.source,impact:item.impact,allowedActions:item.allowedActions,overrideAllowed:item.overrideAllowed}); }
    for (const requirement of requirements.filter((item) => item.isActive)) { const count = staff.filter((item) => item.assignedClass === requirement.classType).length; if (count < requirement.weekdayRequired) warnings.push({ code: 'CLASS_CAPACITY', level: 'WARNING', message: `${requirement.classType}の所属職員が平日必要人数を満たしていません。` }); }
    const fatalIssues = warnings.filter((item) => item.level === 'ERROR');
    return { canGenerate: fatalIssues.length === 0, fatalIssues, warnings, diagnostics, warningSummary: this.warningSummary(warnings), summary: { activeStaffCount: staff.length, earlyCapableCount: early, lateCapableCount: late, saturdayCapableCount: saturday, classCounts: Object.fromEntries(requirements.map((r) => [r.classType, staff.filter((item) => item.assignedClass === r.classType).length])), closedDateCount: context.closedDates.length, approvedRequestCount: context.approvedRequests.length, pendingRequestCount: context.pendingRequests.length, settings: setting } };
  }

  private async buildView(user: AuthenticatedUser, schedule: { id: string; tenantId: string; targetMonth: Date; status: MonthlyShiftStatus; createdByUserId: string; confirmedByUserId: string | null; confirmedAt: Date | null; createdAt: Date; updatedAt: Date }, staffId?: string) {
    const range = this.monthRange(schedule.targetMonth);
    const manager = this.isManager(user);
    const [rawAssignments, rawStaff, rawRequests, directorMemberships] = await Promise.all([
      this.prisma.shiftAssignment.findMany({ where: { monthlyShiftId: schedule.id, ...(staffId ? { staffId } : {}) }, include: assignmentInclude, orderBy: [{ staff: { employeeNumber: 'asc' } }, { workDate: 'asc' }] }),
      manager ? this.activeStaff(user.tenantId, staffId) : Promise.resolve([]),
      manager ? this.prisma.shiftRequest.findMany({ where: { tenantId: user.tenantId, requestDate: { gte: range.start, lt: range.end }, ...(staffId ? { staffId } : {}) }, include: { staff: { select: { id: true, displayName: true } } }, orderBy: { requestDate: 'asc' } }) : Promise.resolve([]),
      this.prisma.membership.findMany({ where: { tenantId: user.tenantId, role: MembershipRole.DIRECTOR, isActive: true }, select: { userId: true } }),
    ]);
    const directorUserIds = new Set(directorMemberships.map((item) => item.userId));
    const mark = <T extends { id: string; userId: string | null }>(item: T) => ({ ...item, isDirector: !!item.userId && directorUserIds.has(item.userId) });
    const assignments = rawAssignments.map((item) => ({ ...item, staff: mark(item.staff) }));
    const staff = rawStaff.map(mark) as Array<(typeof rawAssignments)[number]['staff'] & { isDirector: boolean }>;
    const summaries = staff.map((member) => { const rows = assignments.filter((item) => item.staffId === member.id); const workDays = rows.filter((item) => (workingShiftTypes as readonly ShiftType[]).includes(item.shiftType)).length; const workMinutes = rows.reduce((sum, item) => sum + this.minutes(item), 0); const targetMinutes = member.monthlyTargetWorkHours == null ? null : Math.round(member.monthlyTargetWorkHours * 60); const limitMinutes = member.monthlyWorkHourLimit == null ? null : member.monthlyWorkHourLimit * 60; const statuses = [member.monthlyTargetWorkDays != null && workDays < member.monthlyTargetWorkDays ? '目標未達' : null, member.monthlyTargetWorkDays != null && workDays > member.monthlyTargetWorkDays ? '目標超過' : null, targetMinutes != null && workMinutes < targetMinutes ? '目標未達' : null, targetMinutes != null && workMinutes > targetMinutes ? '目標超過' : null, limitMinutes != null && workMinutes > limitMinutes ? '上限超過' : null, limitMinutes != null && workMinutes <= limitMinutes && workMinutes >= limitMinutes * 0.9 ? '上限接近' : null].filter((value, index, all): value is string => !!value && all.indexOf(value) === index); return { staffId: member.id, workDays, targetWorkDays: member.monthlyTargetWorkDays, workDaysDifference: member.monthlyTargetWorkDays == null ? null : workDays - member.monthlyTargetWorkDays, workMinutes, targetWorkMinutes: targetMinutes, workMinutesDifference: targetMinutes == null ? null : workMinutes - targetMinutes, monthlyWorkHourLimit: member.monthlyWorkHourLimit, statuses: statuses.length ? statuses : ['目標内'] }; });
    const reviewItems=manager?await this.reviews.rows(user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7)):[];
    let requests=rawRequests;
    if(reviewItems.some(i=>i.status==='RESOLVED'&&i.answer&&i.optionEffects?.[i.answer.option]?.some(e=>['REQUEST','CANCEL_REQUEST','NO_WORK'].includes(e.type)))){
      const context=applyMonthlyAnswers(await this.generationContexts.build(user.tenantId,schedule.targetMonth,schedule.id),reviewItems);
      requests=context.requests.filter(r=>!staffId||r.staffId===staffId).map(r=>{const original=rawRequests.find(old=>old.id===r.id);const item=reviewItems.find(i=>i.status==='RESOLVED'&&i.staffIds.includes(r.staffId)&&i.dates.includes(this.isoDate(r.requestDate)));if(!original&&!item?.answeredAt)throw new ConflictException('月次回答の出典が一致しません。');return {...r,tenantId:user.tenantId,createdAt:original?.createdAt??new Date(item!.answeredAt!),updatedAt:original?.updatedAt??new Date(item!.answeredAt!),adminComment:original?.adminComment??JSON.stringify({sourceType:'MANAGER_CONFIRMED',reviewId:item!.id,sourceReferences:item!.sourceReferences}),staff:{id:r.staffId,displayName:rawStaff.find(s=>s.id===r.staffId)?.displayName??'対象職員'}};});
    }
    const reviewState=draftScope(reviewItems,user.tenantId,this.isoDate(schedule.targetMonth).slice(0,7));
    const pendingReviewCells=reviewState.blockedCells.map(key=>{const [staffId,workDate]=JSON.parse(key) as [string,string];return {staffId,workDate};});
    const viewWarnings = manager ? this.warnings(assignments, requests) : [];
    const enrichedSummaries = summaries.map((summary) => {
      const rows = assignments.filter((item) => item.staffId === summary.staffId); const staffRequests = requests.filter((item) => item.staffId === summary.staffId);
      return { ...summary, paidLeaveCount: rows.filter((item) => item.shiftType === ShiftType.PAID_LEAVE).length, halfDayCount: rows.filter((item) => !!item.attendanceModifier).length, requestCount: staffRequests.length, pendingRequestCount: staffRequests.filter((item) => item.status === ShiftRequestStatus.PENDING).length, offCount: rows.filter((item) => item.shiftType === ShiftType.OFF).length, earlyCount: rows.filter((item) => item.shiftType === ShiftType.EARLY).length, lateCount: rows.filter((item) => item.shiftType === ShiftType.LATE).length, saturdayWorkCount: rows.filter((item) => item.workDate.getUTCDay() === 6 && (workingShiftTypes as readonly ShiftType[]).includes(item.shiftType)).length, hardViolationCount: viewWarnings.filter((item) => item.staffId === summary.staffId && item.severity === 'blocking').length, warningCount: viewWarnings.filter((item) => item.staffId === summary.staffId && item.severity === 'warning').length };
    });
    return { schedule, assignments:assignments.filter(a=>!pendingReviewCells.some(c=>c.staffId===a.staffId&&c.workDate===this.isoDate(a.workDate))), pendingReviewCells, managerReviewCount:reviewState.reviewCount, staff, requests, summaries: enrichedSummaries, warnings: viewWarnings };
  }

  private async validateFixedClassSpecialShiftUniqueness(tenantId: string, scheduleId: string, inputs: AssignmentInputDto[], inputStaff: Array<{ id: string; assignedClass: any }>) {
    const existing = await this.prisma.shiftAssignment.findMany({ where: { monthlyShiftId: scheduleId }, select: { staffId: true, workDate: true, shiftType: true, staff: { select: { assignedClass: true } } } });
    const inputKeys = new Set(inputs.map((item) => `${item.staffId}:${item.workDate}`));
    const classByStaff = new Map(inputStaff.map((item) => [item.id, item.assignedClass]));
    const rows = existing.filter((item) => !inputKeys.has(`${item.staffId}:${this.isoDate(item.workDate)}`)).map((item) => ({ staffId: item.staffId, workDate: this.isoDate(item.workDate), shiftType: item.shiftType, assignedClass: item.staff.assignedClass }))
      .concat(inputs.map((item) => ({ staffId: item.staffId, workDate: item.workDate, shiftType: item.shiftType, assignedClass: classByStaff.get(item.staffId) })));
    const seen = new Set<string>();
    for (const row of rows) {
      if ((row.shiftType !== ShiftType.EARLY && row.shiftType !== ShiftType.LATE) || !String(row.assignedClass).startsWith('AGE_')) continue;
      const key = `${row.workDate}:${row.assignedClass}:${row.shiftType}`;
      if (seen.has(key)) throw new ConflictException({ message: '同じ担当クラスの職員を同じ早出または同じ遅出に配置できません。', warnings: [{ code: 'FIXED_CLASS_SPECIAL_SHIFT_DUPLICATE', staffId: row.staffId, workDate: row.workDate, message: `${row.workDate}：${row.assignedClass}で${row.shiftType === ShiftType.EARLY ? '早出' : '遅出'}職員が重複しています。`, severity: 'blocking' }] });
      seen.add(key);
    }
  }

  private warnings(assignments: Array<any>, requests: Array<any>): Warning[] {
    const warnings: Warning[] = [];
    const specialShiftClasses = new Set<string>();
    const requestMap = new Map(requests.filter((request) => request.status === ShiftRequestStatus.APPROVED || request.status === ShiftRequestStatus.PENDING).map((request) => [`${request.staffId}:${this.isoDate(request.requestDate)}`, request]));
    const byStaff = new Map<string, Array<any>>();
    for (const assignment of assignments) {
      const key = `${assignment.staffId}:${this.isoDate(assignment.workDate)}`;
      const request = requestMap.get(key);
      const date = this.isoDate(assignment.workDate);
      if (request && request.requestType !== 'HALF_DAY_AM' && request.requestType !== 'HALF_DAY_PM' && workingShiftTypes.includes(assignment.shiftType)) warnings.push({ code: request.status === ShiftRequestStatus.APPROVED ? 'APPROVED_REQUEST_CONFLICT' : 'PENDING_REQUEST_CONFLICT', staffId: assignment.staffId, workDate: date, message: `${assignment.staff.displayName}さんの${request.status === ShiftRequestStatus.APPROVED ? '承認済み' : '申請中'}希望休と勤務が重複しています。`, severity: request.status === ShiftRequestStatus.APPROVED ? 'blocking' : 'warning' });
      if (assignment.shiftType === ShiftType.EARLY && !assignment.staff.canWorkEarly) warnings.push(this.warning('EARLY_NOT_AVAILABLE', assignment, '早出不可の職員に早出を割り当てています。'));
      if (assignment.shiftType === ShiftType.LATE && !assignment.staff.canWorkLate) warnings.push(this.warning('LATE_NOT_AVAILABLE', assignment, '遅出不可の職員に遅出を割り当てています。'));
      if ((assignment.shiftType === ShiftType.EARLY || assignment.shiftType === ShiftType.LATE) && String(assignment.staff.assignedClass).startsWith('AGE_')) {
        const classKey = `${date}:${assignment.staff.assignedClass}:${assignment.shiftType}`;
        if (specialShiftClasses.has(classKey)) warnings.push({ code: 'FIXED_CLASS_SPECIAL_SHIFT_DUPLICATE', staffId: assignment.staffId, workDate: date, message: `${date}：${assignment.staff.assignedClass}で${assignment.shiftType === ShiftType.EARLY ? '早出' : '遅出'}職員が重複しています。`, severity: 'blocking' });
        specialShiftClasses.add(classKey);
      }
      if (new Date(`${date}T00:00:00Z`).getUTCDay() === 6 && workingShiftTypes.includes(assignment.shiftType) && !assignment.staff.canWorkSaturdays) warnings.push(this.warning('SATURDAY_NOT_AVAILABLE', assignment, '土曜日勤務不可の職員に勤務を割り当てています。'));
      const list = byStaff.get(assignment.staffId) ?? []; list.push(assignment); byStaff.set(assignment.staffId, list);
    }
    for (const [staffId, list] of byStaff) {
      const staff = list[0].staff;
      const minutes = list.reduce((sum, assignment) => sum + this.minutes(assignment), 0);
      if (staff.monthlyWorkHourLimit && minutes > staff.monthlyWorkHourLimit * 60) warnings.push({ code: 'MONTHLY_HOURS_LIMIT', staffId, workDate: this.isoDate(list[0].workDate), message: `${staff.displayName}さんの月間勤務時間が上限を超えています（概算）。`, severity: 'warning' });
      const workDays = list.filter((item) => workingShiftTypes.includes(item.shiftType)).length;
      if (staff.monthlyTargetWorkDays && workDays !== staff.monthlyTargetWorkDays) warnings.push({ code: workDays < staff.monthlyTargetWorkDays ? 'TARGET_WORK_DAYS_SHORTAGE' : 'TARGET_WORK_DAYS_EXCESS', staffId, workDate: this.isoDate(list[0].workDate), message: `${staff.displayName}さんの勤務日数は目標${staff.monthlyTargetWorkDays}日に対して${workDays}日です。`, severity: workDays < staff.monthlyTargetWorkDays ? 'warning' : 'info' });
      const targetMinutes = staff.monthlyTargetWorkHours == null ? null : Math.round(staff.monthlyTargetWorkHours * 60);
      if (targetMinutes != null && minutes !== targetMinutes) warnings.push({ code: minutes < targetMinutes ? 'TARGET_WORK_HOURS_SHORTAGE' : 'TARGET_WORK_HOURS_EXCESS', staffId, workDate: this.isoDate(list[0].workDate), message: `${staff.displayName}さんの勤務時間は目標${staff.monthlyTargetWorkHours}時間に対して${Number((minutes / 60).toFixed(2))}時間です。`, severity: minutes < targetMinutes ? 'warning' : 'info' });
      const weeks = new Map<string, number>();
      for (const assignment of list.filter((item) => workingShiftTypes.includes(item.shiftType))) { const week = this.weekKey(this.isoDate(assignment.workDate)); weeks.set(week, (weeks.get(week) ?? 0) + 1); }
      if (staff.weeklyAvailableDays && [...weeks.values()].some((days) => days > staff.weeklyAvailableDays)) warnings.push({ code: 'WEEKLY_DAYS_LIMIT', staffId, workDate: this.isoDate(list[0].workDate), message: `${staff.displayName}さんの週勤務可能日数を超えています。`, severity: 'warning' });
    }
    return warnings;
  }

  private assignmentData(
    schedule: { id: string; tenantId: string },
    input: AssignmentInputDto,
    staff?: { regularWorkStartTime: string | null; regularWorkEndTime: string | null },
  ) {
    const individualRegularHours = input.shiftType === ShiftType.NORMAL && staff?.regularWorkStartTime && staff.regularWorkEndTime
      ? { startTime: staff.regularWorkStartTime, endTime: staff.regularWorkEndTime }
      : null;
    const defaults = individualRegularHours ?? shiftTypeDefaults[input.shiftType as ShiftType];
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
  private async buildGenerationContext(tenantId:string,targetMonth:Date,scheduleId:string){try{const context=await this.generationContexts.build(tenantId,targetMonth,scheduleId);const managerReviewItems=await this.reviews.rows(tenantId,this.isoDate(targetMonth).slice(0,7));return {...applyMonthlyAnswers(context,managerReviewItems),managerReviewItems};}catch(error){this.logger.error('MonthlyGenerationContext build failed.',error instanceof Error?error.stack:undefined);const diagnostic=classifyGenerationDiagnostic({severity:'ERROR',category:'SYSTEM_SAFETY_BLOCK',code:'GENERATION_CONTEXT_UNAVAILABLE',staffId:null,date:this.isoDate(targetMonth),source:'MonthlyGenerationContext',reason:'対象月の正式条件をDBから一貫して取得できません。',allowedActions:['DB接続とmigration状態を確認する','Feature設定を確認して再試行する'],overrideAllowed:false});throw new ConflictException({message:'システム安全性を確認できないため停止しました。',diagnostics:[diagnostic],warnings:[this.diagnosticWarning(diagnostic)]});}}
  private isManager(user: AuthenticatedUser) { return shiftManagerRoles.includes(user.role as any); }
  private monthDate(month: string) { const date = new Date(`${month}-01T00:00:00.000Z`); if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 7) !== month) throw new BadRequestException('monthが正しい年月ではありません。'); return date; }
  private monthRange(month: Date) { const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)); return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) }; }
  private date(value: string) { const date = new Date(`${value}T00:00:00.000Z`); if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('workDateが正しい日付ではありません。'); return date; }
  private validateAssignmentInput(input: AssignmentInputDto, range: { start: Date; end: Date }) { const workDate = this.date(input.workDate); if (workDate < range.start || workDate >= range.end) throw new BadRequestException('対象月外の日付は登録できません。'); if (input.startTime && input.endTime && input.startTime >= input.endTime) throw new BadRequestException('startTimeはendTimeより前に指定してください。'); }
  private validateUniqueInputs(inputs: AssignmentInputDto[]) { const keys = new Set(inputs.map((input) => `${input.staffId}:${input.workDate}`)); if (keys.size !== inputs.length) throw new ConflictException('同一職員・同一日の明細を重複して保存できません。'); }
  private warning(code: string, assignment: any, message: string): Warning { return { code, staffId: assignment.staffId, workDate: this.isoDate(assignment.workDate), message: `${assignment.staff.displayName}さん：${message}`, severity: 'warning' }; }
  private diagnosticWarning(item: { code: string; staffId: string | null; date: string; reason: string }): Warning { return { code: item.code, staffId: item.staffId ?? '', workDate: item.date, message: item.reason, severity: 'blocking' }; }
  private warningSummary(warnings: Array<{ code: string; level: string }>) { const byCode: Record<string, number> = {}; const levels = { INFO: 0, WARNING: 0, ERROR: 0 }; for (const warning of warnings) { byCode[warning.code] = (byCode[warning.code] ?? 0) + 1; if (warning.level in levels) levels[warning.level as keyof typeof levels] += 1; } return { ...levels, byCode }; }
  private isoDate(value: Date) { return value.toISOString().slice(0, 10); }
  private minutes(assignment: any) { try { return assignmentTimeBreakdown(assignment).actualWorkMinutes; } catch { return 0; } }
  private weekKey(dateValue: string) { const date = new Date(`${dateValue}T00:00:00Z`); const day = (date.getUTCDay() + 6) % 7; date.setUTCDate(date.getUTCDate() - day); return date.toISOString().slice(0, 10); }
}
