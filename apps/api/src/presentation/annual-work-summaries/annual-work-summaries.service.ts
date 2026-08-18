import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { annualWorkSummary, prescribedMinutes } from '../../application/annual-fairness/annual-work-summary-calculator';
import { fiscalYearRange } from '../../application/annual-fairness/fiscal-year-range';
import { prorateAnnualTarget } from '../../application/annual-fairness/annual-target-proration';
import { resolveDailyPrescribedMinutes } from '../../application/annual-fairness/daily-prescribed-minutes';

@Injectable()
export class AnnualWorkSummariesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser, fiscalYear: number) {
    const setting = await this.prisma.tenantShiftSetting.findUnique({
      where: { tenantId: user.tenantId },
      select: { fiscalYearStartMonth: true, defaultBreakMinutes: true, defaultStartNormal: true, defaultEndNormal: true },
    });
    const fiscalYearStartMonth = setting?.fiscalYearStartMonth ?? 4;
    const range = fiscalYearRange(fiscalYear, fiscalYearStartMonth);
    const staff = await this.prisma.staff.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        regularWorkStartTime: true,
        regularWorkEndTime: true,
        workContracts: {
          where: { tenantId: user.tenantId, effectiveFrom: { lt: range.endExclusive }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.start } }] },
          select: { effectiveFrom: true, effectiveTo: true, annualizedTargetMinutes: true, prescribedDailyMinutes: true, voidedAt: true },
        },
        assignments: {
          where: {
            tenantId: user.tenantId,
            workDate: { gte: range.start, lt: range.endExclusive },
            monthlyShift: { status: 'CONFIRMED' },
          },
          select: { workDate: true, shiftType: true, startTime: true, endTime: true, breakMinutes: true },
        },
      },
      orderBy: { employeeNumber: 'asc' },
    });
    const summaries = staff.map((member) => {
      const target = prorateAnnualTarget(range.start, range.endExclusive, member.workContracts);
      const actual = annualWorkSummary(member.assignments, (assignment) => assignment.workDate
        ? resolveDailyPrescribedMinutes(assignment.workDate, member.workContracts, member, {
          defaultStartNormal: setting?.defaultStartNormal ?? null,
          defaultEndNormal: setting?.defaultEndNormal ?? null,
          defaultBreakMinutes: setting?.defaultBreakMinutes ?? 60,
        }).minutes
        : prescribedMinutes(member.regularWorkStartTime, member.regularWorkEndTime, setting?.defaultBreakMinutes ?? 60));
      const leaveEquivalentMinutes = actual.paidLeaveEquivalentMinutes == null || actual.halfLeaveEquivalentMinutes == null
        ? null : actual.paidLeaveEquivalentMinutes + actual.halfLeaveEquivalentMinutes;
      const calculationStatus = actual.calculationStatus === 'UNAVAILABLE' ? 'UNAVAILABLE' : target.calculationStatus;
      const unavailableReason = actual.calculationStatus === 'UNAVAILABLE' ? actual.unavailableReason : target.unavailableReason;
      const achievementRate = target.annualTargetMinutes && actual.fairnessActualMinutes != null
        ? actual.fairnessActualMinutes / target.annualTargetMinutes : null;
      const differenceMinutes = target.annualTargetMinutes != null && actual.fairnessActualMinutes != null
        ? actual.fairnessActualMinutes - target.annualTargetMinutes : null;
      return {
        staffId: member.id,
        annualTargetMinutes: target.annualTargetMinutes,
        ...actual,
        leaveEquivalentMinutes,
        achievementRate,
        differenceMinutes,
        calculationStatus,
        unavailableReason,
        coverageStatus: target.calculationStatus,
        coveredDays: target.coveredDays,
        fiscalYearDays: target.fiscalYearDays,
      };
    });
    return {
      fiscalYear,
      fiscalYearStartMonth,
      fiscalYearStart: iso(range.start),
      fiscalYearEndExclusive: iso(range.endExclusive),
      summaries,
    };
  }
}

function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}
