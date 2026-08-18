import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { annualWorkSummary, prescribedMinutes } from '../../application/annual-fairness/annual-work-summary-calculator';
import { fiscalYearRange } from '../../application/annual-fairness/fiscal-year-range';

@Injectable()
export class AnnualWorkSummariesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser, fiscalYear: number) {
    const setting = await this.prisma.tenantShiftSetting.findUnique({
      where: { tenantId: user.tenantId },
      select: { fiscalYearStartMonth: true, defaultBreakMinutes: true },
    });
    const fiscalYearStartMonth = setting?.fiscalYearStartMonth ?? 4;
    const range = fiscalYearRange(fiscalYear, fiscalYearStartMonth);
    const staff = await this.prisma.staff.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        regularWorkStartTime: true,
        regularWorkEndTime: true,
        assignments: {
          where: {
            tenantId: user.tenantId,
            workDate: { gte: range.start, lt: range.endExclusive },
            monthlyShift: { status: 'CONFIRMED' },
          },
          select: { shiftType: true, startTime: true, endTime: true, breakMinutes: true },
        },
      },
      orderBy: { employeeNumber: 'asc' },
    });
    const summaries = staff.map((member) => ({
      staffId: member.id,
      ...annualWorkSummary(
        member.assignments,
        prescribedMinutes(member.regularWorkStartTime, member.regularWorkEndTime, setting?.defaultBreakMinutes ?? 60),
      ),
    }));
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
