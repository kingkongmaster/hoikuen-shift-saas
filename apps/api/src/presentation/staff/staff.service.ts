import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateStaffDto } from './create-staff.dto';
import { UpdateStaffDto } from './update-staff.dto';
import { AuditService } from '../audit/audit.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

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
    await this.subscriptions.assertWritable(user.tenantId); await this.subscriptions.assertStaffCapacity(user.tenantId);
    this.validateRules(input);
    try {
      const created = await this.prisma.staff.create({
        data: {
          ...input,
          tenantId: user.tenantId,
          employeeNumber: input.employeeNumber.trim(),
          displayName: input.displayName.trim(),
          email: input.email?.trim().toLowerCase() || null,
          notes: input.notes?.trim() || null,
        },
      }); await this.audit.create(user.tenantId,user.sub,'STAFF_CREATED','Staff',created.id,{employeeNumber:created.employeeNumber}); return created;
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
    const current = await this.get(user, id);
    if (!current.isActive) return current;
    const updated=await this.prisma.staff.update({ where: { id: current.id }, data: { isActive: false } }); await this.audit.create(user.tenantId,user.sub,'STAFF_DEACTIVATED','Staff',updated.id); return updated;
  }

  private validateRules(input: { canWorkEarly: boolean; canWorkRegular: boolean; canWorkLate: boolean; earlyShiftOnly: boolean; lateShiftOnly: boolean }): void {
    if (!input.canWorkEarly && !input.canWorkRegular && !input.canWorkLate) throw new BadRequestException('勤務区分を1つ以上選択してください。');
    if (input.earlyShiftOnly && input.lateShiftOnly) throw new BadRequestException('早出専任と遅出専任は同時に指定できません。');
    if (input.earlyShiftOnly && !input.canWorkEarly) throw new BadRequestException('早出専任には早出可能の指定が必要です。');
    if (input.lateShiftOnly && !input.canWorkLate) throw new BadRequestException('遅出専任には遅出可能の指定が必要です。');
  }

  private handleWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('この職員番号は同じ園ですでに使用されています。');
    throw error;
  }
}
