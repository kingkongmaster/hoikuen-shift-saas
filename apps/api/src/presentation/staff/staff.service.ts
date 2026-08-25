import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateStaffDto } from './create-staff.dto';
import { UpdateStaffDto } from './update-staff.dto';
import { AuditService } from '../audit/audit.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { individualRegularWorkHoursError } from '../../domain/staff/staff-master';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly subscriptions: SubscriptionsService) {}

  list(user: AuthenticatedUser, includeInactive: boolean) {
    return this.prisma.staff.findMany({
      where: { tenantId: user.tenantId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ isActive: 'desc' }, { employeeNumber: 'asc' }],
    });
  }

  async get(user: AuthenticatedUser, id: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!staff) throw new NotFoundException('職員が見つかりません。');
    return staff;
  }

  findMine(user: AuthenticatedUser) {
    return this.prisma.staff.findUnique({ where: { tenantId_userId: { tenantId: user.tenantId, userId: user.sub } } });
  }

  async create(user: AuthenticatedUser, input: CreateStaffDto) {
    await this.subscriptions.assertWritable(user.tenantId);
    this.validateRules(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ staffLimit: number; status: SubscriptionStatus; trialEndsAt: Date | null }>>(Prisma.sql`SELECT "staffLimit", "status", "trialEndsAt" FROM "TenantSubscription" WHERE "tenantId" = ${user.tenantId}::uuid FOR UPDATE`);
        const subscription = locked[0] ?? await this.subscriptions.find(user.tenantId);
        const expiredTrial = subscription.status === SubscriptionStatus.TRIAL && subscription.trialEndsAt != null && subscription.trialEndsAt < new Date();
        if (subscription.status === SubscriptionStatus.SUSPENDED) throw new ForbiddenException({ code: 'SUBSCRIPTION_SUSPENDED', message: 'この園の利用は停止されています。' });
        if (expiredTrial || subscription.status === SubscriptionStatus.EXPIRED || subscription.status === SubscriptionStatus.CANCELLED) throw new ForbiddenException({ code: 'SUBSCRIPTION_EXPIRED', message: 'この園の契約は利用期限を過ぎています。' });
        const staffLimit = subscription.staffLimit;
        const count = await tx.staff.count({ where: { tenantId: user.tenantId, isActive: true } });
        if (count >= staffLimit) throw new ConflictException({ code: 'STAFF_LIMIT_REACHED', message: '職員登録上限に達しています。' });
        const created = await tx.staff.create({ data: { ...input, tenantId: user.tenantId, employeeNumber: input.employeeNumber.trim(), displayName: input.displayName.trim(), email: input.email?.trim().toLowerCase() || null, notes: input.notes?.trim() || null } });
        await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'STAFF_CREATED', targetType: 'Staff', targetId: created.id, detail: { employeeNumber: created.employeeNumber } } });
        return created;
      });
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async update(user: AuthenticatedUser, id: string, input: UpdateStaffDto) {
    await this.subscriptions.assertWritable(user.tenantId);
    const current = await this.get(user, id);
    const normalized = {
      ...input,
      ...(input.employeeNumber !== undefined ? { employeeNumber: input.employeeNumber.trim() } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.email !== undefined ? { email: input.email?.trim().toLowerCase() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    };
    this.validateRules({ ...current, ...normalized });
    try {
      const updated=await this.prisma.staff.update({ where: { id: current.id }, data: normalized }); await this.audit.create(user.tenantId,user.sub,'STAFF_UPDATED','Staff',updated.id); return updated;
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async deactivate(user: AuthenticatedUser, id: string) {
    await this.subscriptions.assertWritable(user.tenantId);
    return this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<Array<{ id: string; userId: string | null; isActive: boolean }>>(Prisma.sql`
        SELECT "id", "userId", "isActive" FROM "Staff"
        WHERE "id" = ${id}::uuid AND "tenantId" = ${user.tenantId}::uuid
        FOR UPDATE
      `);
      if (!current) throw new NotFoundException('職員が見つかりません。');
      const membership = current.userId ? (await tx.$queryRaw<Array<{ isActive: boolean }>>(Prisma.sql`
        SELECT "isActive" FROM "Membership"
        WHERE "tenantId" = ${user.tenantId}::uuid AND "userId" = ${current.userId}::uuid
        FOR UPDATE
      `))[0] : undefined;
      const requiresRepair = Boolean(membership?.isActive);
      if (!current.isActive && !requiresRepair) return tx.staff.findUniqueOrThrow({ where: { id: current.id } });
      if (current.isActive) await tx.staff.update({ where: { id: current.id }, data: { isActive: false } });
      if (current.userId && membership && (current.isActive || membership.isActive)) {
        await tx.membership.update({ where: { tenantId_userId: { tenantId: user.tenantId, userId: current.userId } }, data: { isActive: false, tokenVersion: { increment: 1 } } });
      }
      await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'STAFF_DEACTIVATED', targetType: 'Staff', targetId: current.id, detail: { loginAccountDeactivated: Boolean(current.userId), repairedMembershipMismatch: !current.isActive && requiresRepair } } });
      return tx.staff.findUniqueOrThrow({ where: { id: current.id } });
    });
  }

  private validateRules(input: { canWorkEarly: boolean; canWorkRegular: boolean; canWorkLate: boolean; earlyShiftOnly: boolean; lateShiftOnly: boolean; monthlyWorkHourLimit?: number | null; monthlyTargetWorkHours?: number | null; regularWorkStartTime?: string | null; regularWorkEndTime?: string | null }): void {
    if (!input.canWorkEarly && !input.canWorkRegular && !input.canWorkLate) throw new BadRequestException('勤務区分を1つ以上選択してください。');
    if (input.earlyShiftOnly && input.lateShiftOnly) throw new BadRequestException('早出専任と遅出専任は同時に指定できません。');
    if (input.earlyShiftOnly && !input.canWorkEarly) throw new BadRequestException('早出専任には早出可能の指定が必要です。');
    if (input.lateShiftOnly && !input.canWorkLate) throw new BadRequestException('遅出専任には遅出可能の指定が必要です。');
    if (input.monthlyWorkHourLimit && input.monthlyTargetWorkHours && input.monthlyTargetWorkHours > input.monthlyWorkHourLimit) throw new BadRequestException('月間目標勤務時間は月間勤務時間上限以下にしてください。');
    const individualHoursError = individualRegularWorkHoursError(input.regularWorkStartTime, input.regularWorkEndTime);
    if (individualHoursError) throw new BadRequestException(individualHoursError);
  }

  private handleWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('この職員番号は同じ園ですでに使用されています。');
    throw error;
  }
}
