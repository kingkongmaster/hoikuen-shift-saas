import { Injectable } from '@nestjs/common';
import { MembershipRole, MonthlyShiftStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { FeaturesService } from '../../presentation/features/features.service';

export type GenerationFeatureCode = 'ADVANCED_STAFFING_REQUIREMENTS' | 'STAFF_WORK_RULES' | 'TENANT_CUSTOM_RULES';
export type GenerationFeatureState = { enabled: boolean; lookupFailed: boolean; configuration: Record<string, unknown> };

const staffSelect = { id: true, userId: true, employeeNumber: true, displayName: true, assignedClass: true, employmentType: true, canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: true, lateShiftOnly: true, canWorkSaturdays: true, monthlyWorkHourLimit: true, monthlyTargetWorkDays: true, monthlyTargetWorkHours: true, weeklyAvailableDays: true, regularWorkStartTime: true, regularWorkEndTime: true, isActive: true } as const;
const patternSelect = { id: true, code: true, name: true, shortName: true, startTime: true, endTime: true, breakMinutes: true, isWorking: true, countsTowardStaffing: true, isActive: true, isSystem: true } as const;
const workRuleSelect = { id: true, staffId: true, ruleType: true, dayOfWeek: true, startDate: true, endDate: true, startTime: true, endTime: true, numericValue: true, priority: true, isHardConstraint: true, workPattern: { select: patternSelect } } as const;

@Injectable()
export class MonthlyGenerationContextBuilder {
  constructor(private readonly prisma: PrismaService, private readonly features: FeaturesService) {}

  async build(tenantId: string, targetMonth: Date, monthlyShiftId?: string) {
    const range = monthRange(targetMonth);
    const historyStart = new Date(range.start); historyStart.setUTCFullYear(historyStart.getUTCFullYear() - 3);
    const boundaryStart = weekStart(range.start); const boundaryEnd = weekStart(range.end); boundaryEnd.setUTCDate(boundaryEnd.getUTCDate() + 7);
    const featureCodes: GenerationFeatureCode[] = ['ADVANCED_STAFFING_REQUIREMENTS', 'STAFF_WORK_RULES', 'TENANT_CUSTOM_RULES'];
    const featureEntries = await Promise.all(featureCodes.map(async (code) => {
      try {
        const [resolution, row] = await Promise.all([
          this.features.resolve(tenantId, code, range.start),
          this.prisma.tenantFeature.findUnique({ where: { tenantId_featureCode: { tenantId, featureCode: code } }, select: { configuration: true } }),
        ]);
        const configuration = row?.configuration && typeof row.configuration === 'object' && !Array.isArray(row.configuration) ? row.configuration as Record<string, unknown> : {};
        return [code, { enabled: resolution.enabled, lookupFailed: false, configuration }] as const;
      } catch {
        return [code, { enabled: false, lookupFailed: true, configuration: {} }] as const;
      }
    }));
    const features = Object.fromEntries(featureEntries) as Record<GenerationFeatureCode, GenerationFeatureState>;

    const [tenant, shiftSetting, staff, workPatterns, contracts, workRules, staffingRequirements, conditionalStaffingRequirements, requests, paidLeaveGrants, paidLeaveUsages, closedDates, events, ruleExceptions, attributes, directorMemberships, priorAssignments, confirmedAssignments, assignments, weekBoundaryAssignments] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } }),
      this.prisma.tenantShiftSetting.findUnique({ where: { tenantId } }),
      this.prisma.staff.findMany({ where: { tenantId, isActive: true }, select: staffSelect, orderBy: { employeeNumber: 'asc' } }),
      this.prisma.workPattern.findMany({ where: { tenantId, isActive: true }, select: patternSelect, orderBy: { code: 'asc' } }),
      this.prisma.staffWorkContract.findMany({ where: { tenantId, effectiveFrom: { lt: range.end }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.start } }] }, orderBy: [{ staffId: 'asc' }, { effectiveFrom: 'asc' }] }),
      features.STAFF_WORK_RULES.enabled ? this.prisma.staffWorkRule.findMany({ where: { tenantId, isActive: true, staff: { isActive: true }, OR: [{ startDate: null, endDate: null }, { startDate: { lt: range.end }, endDate: { gte: range.start } }] }, select: workRuleSelect }) : Promise.resolve([]),
      features.ADVANCED_STAFFING_REQUIREMENTS.enabled ? this.prisma.shiftStaffingRequirement.findMany({ where: { tenantId, isActive: true, attributeDefinition: { isActive: true }, OR: [{ startDate: null, endDate: null }, { startDate: { lt: range.end }, endDate: { gte: range.start } }] }, include: { workPattern: { select: patternSelect } } }) : Promise.resolve([]),
      features.ADVANCED_STAFFING_REQUIREMENTS.enabled ? this.prisma.conditionalShiftStaffingRequirement.findMany({ where: { tenantId, isActive: true, triggerAttributeDefinition: { isActive: true }, targetAttributeDefinition: { isActive: true }, targetWorkPattern: { isActive: true }, OR: [{ startDate: null, endDate: null }, { startDate: { lt: range.end }, endDate: { gte: range.start } }] }, include: { targetWorkPattern: { select: patternSelect } } }) : Promise.resolve([]),
      this.prisma.shiftRequest.findMany({ where: { tenantId, requestDate: { gte: range.start, lt: range.end } }, select: { id: true, staffId: true, requestDate: true, requestType: true, status: true, reason: true }, orderBy: [{ requestDate: 'asc' }, { staffId: 'asc' }] }),
      this.prisma.paidLeaveGrant.findMany({ where: { tenantId, staff: { isActive: true }, grantDate: { lt: range.end }, expiresAt: { gte: range.start } } }),
      this.prisma.paidLeaveUsage.findMany({ where: { tenantId, usageDate: { gte: range.start, lt: range.end } }, include: { allocations: true } }),
      this.prisma.tenantClosedDate.findMany({ where: { tenantId, closedDate: { gte: range.start, lt: range.end } }, orderBy: { closedDate: 'asc' } }),
      this.prisma.tenantEvent.findMany({ where: { tenantId, eventDate: { gte: range.start, lt: range.end }, isActive: true }, orderBy: { eventDate: 'asc' } }),
      features.TENANT_CUSTOM_RULES.enabled ? this.prisma.tenantRuleException.findMany({ where: { tenantId, isActive: true, exceptionDate: { gte: range.start, lt: range.end } }, orderBy: { exceptionDate: 'asc' } }) : Promise.resolve([]),
      this.prisma.staffAttributeAssignment.findMany({ where: { tenantId, isActive: true, staff: { isActive: true }, attributeDefinition: { isActive: true }, OR: [{ startDate: null, endDate: null }, { startDate: { lt: range.end }, endDate: { gte: range.start } }] }, select: { staffId: true, attributeDefinitionId: true, startDate: true, endDate: true, attributeDefinition: { select: { code: true } } } }),
      this.prisma.membership.findMany({ where: { tenantId, role: MembershipRole.DIRECTOR, isActive: true }, select: { userId: true } }),
      this.prisma.shiftAssignment.findMany({ where: { tenantId, workDate: { gte: new Date(range.start.getTime() - 24 * 60 * 60 * 1000), lt: range.start }, monthlyShift: { status: MonthlyShiftStatus.CONFIRMED } }, select: { staffId: true, workDate: true, shiftType: true, workPatternId: true, startTime: true, endTime: true, breakMinutes: true } }),
      this.prisma.shiftAssignment.findMany({ where: { tenantId, workDate: { gte: historyStart, lt: range.start }, monthlyShift: { status: MonthlyShiftStatus.CONFIRMED } }, select: { staffId: true, workDate: true, shiftType: true, workPatternId: true, startTime: true, endTime: true, breakMinutes: true } }),
      monthlyShiftId ? this.prisma.shiftAssignment.findMany({ where: { tenantId, monthlyShiftId }, include: { attendanceModifier: true, workPattern: { select: patternSelect } } }) : Promise.resolve([]),
      this.prisma.shiftAssignment.findMany({ where: { tenantId, workDate: { gte: boundaryStart, lt: boundaryEnd } }, include: { attendanceModifier: true, workPattern: { select: patternSelect } }, orderBy: [{ staffId: 'asc' }, { workDate: 'asc' }] }),
    ]);

    return {
      tenantId, targetMonth, range, tenant, shiftSetting, staff, workPatterns, contracts, workRules,
      staffingRequirements, conditionalStaffingRequirements, requests, paidLeaveGrants, paidLeaveUsages,
      closedDates, events: events.map((event) => ({ ...event, affectsGeneration: jsonStrings(event.targetClasses).length > 0 || jsonStrings(event.targetStaffCodes).length > 0 || jsonStrings(event.allowedWorkPatternCodes).length > 0 })),
      ruleExceptions, attributes, directorMemberships, priorAssignments, confirmedAssignments, assignments, weekBoundaryAssignments, features,
      approvedRequests: requests.filter((request) => request.status === 'APPROVED'),
      pendingRequests: requests.filter((request) => request.status === 'PENDING'),
      fixedStaffIds: new Set(attributes.filter((row) => row.attributeDefinition.code === 'FIXED_ASSIGNMENT').map((row) => row.staffId)),
      excludedStaffIds: new Set(attributes.filter((row) => row.attributeDefinition.code === 'GENERATOR_EXCLUDED').map((row) => row.staffId)),
    };
  }
}

export type MonthlyGenerationContext = Awaited<ReturnType<MonthlyGenerationContextBuilder['build']>>;

export function monthRange(month: Date) {
  const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
}

export function jsonStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function weekStart(value: Date) { const date = new Date(value); const day = (date.getUTCDay() + 6) % 7; date.setUTCDate(date.getUTCDate() - day); return date; }
