import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { MonthlyShiftStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async calendar(user: AuthenticatedUser, month: string) {
    const targetMonth = this.monthDate(month);
    const staff = await this.prisma.staff.findUnique({
      where: { tenantId_userId: { tenantId: user.tenantId, userId: user.sub } },
      select: {
        id: true,
        employeeNumber: true,
        displayName: true,
        email: true,
        jobTitle: true,
        employmentType: true,
        assignedClass: true,
        isActive: true,
      },
    });
    if (!staff?.isActive) throw new ForbiddenException('有効な職員情報が紐づいていません。');

    const end = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 1));
    const [schedule, requests] = await Promise.all([
      this.prisma.monthlyShift.findUnique({
        where: { tenantId_targetMonth: { tenantId: user.tenantId, targetMonth } },
        select: {
          id: true,
          status: true,
          targetMonth: true,
          confirmedAt: true,
          assignments: {
            where: { staffId: staff.id },
            select: {
              id: true,
              staffId: true,
              workDate: true,
              shiftType: true,
              startTime: true,
              endTime: true,
              breakMinutes: true,
              assignedClass: true,
              updatedAt: true,
              workPattern: { select: { code: true, name: true, shortName: true, color: true } },
            },
            orderBy: { workDate: 'asc' },
          },
        },
      }),
      this.prisma.shiftRequest.findMany({
        where: { tenantId: user.tenantId, staffId: staff.id, requestDate: { gte: targetMonth, lt: end } },
        select: { id: true, requestDate: true, requestType: true, status: true, reason: true, updatedAt: true },
        orderBy: [{ requestDate: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const published = schedule?.status === MonthlyShiftStatus.CONFIRMED;
    return {
      staff,
      schedule: schedule ? { id: schedule.id, status: schedule.status, targetMonth: schedule.targetMonth, confirmedAt: schedule.confirmedAt } : null,
      assignments: published ? schedule.assignments : [],
      requests,
    };
  }

  private monthDate(month: string) {
    const date = new Date(`${month}-01T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}$/.test(month) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 7) !== month) {
      throw new BadRequestException('monthが正しい年月ではありません。');
    }
    return date;
  }
}
