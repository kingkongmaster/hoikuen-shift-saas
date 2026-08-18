import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type StaffWorkContract } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { StaffWorkContractInputDto } from './staff-work-contract.dto';

type ContractData = {
  tenantId: string;
  staffId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  annualizedTargetMinutes: number;
  prescribedDailyMinutes: number;
};

@Injectable()
export class StaffWorkContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async list(user: AuthenticatedUser, staffId: string) {
    await this.staff(user.tenantId, staffId);
    return this.prisma.staffWorkContract.findMany({
      where: { tenantId: user.tenantId, staffId },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(user: AuthenticatedUser, staffId: string, input: StaffWorkContractInputDto) {
    await this.subscriptions.assertWritable(user.tenantId);
    await this.staff(user.tenantId, staffId, true);
    const data = this.data(user.tenantId, staffId, input);
    await this.assertNoOverlap(data);
    try {
      const row = await this.prisma.staffWorkContract.create({ data });
      await this.audit.create(user.tenantId, user.sub, 'STAFF_WORK_CONTRACT_CREATED', 'StaffWorkContract', row.id, this.detail(staffId, null, row));
      return row;
    } catch (error) { this.handleWriteError(error); }
  }

  async update(user: AuthenticatedUser, staffId: string, contractId: string, input: StaffWorkContractInputDto) {
    await this.subscriptions.assertWritable(user.tenantId);
    await this.staff(user.tenantId, staffId, true);
    const before = await this.contract(user.tenantId, staffId, contractId);
    if (before.voidedAt) throw new ConflictException('無効化済みの勤務契約は変更できません。');
    const data = this.data(user.tenantId, staffId, input);
    await this.assertNoOverlap(data, contractId);
    try {
      const row = await this.prisma.staffWorkContract.update({ where: { id: before.id }, data });
      const action = before.effectiveTo == null && row.effectiveTo != null ? 'STAFF_WORK_CONTRACT_ENDED' : 'STAFF_WORK_CONTRACT_UPDATED';
      await this.audit.create(user.tenantId, user.sub, action, 'StaffWorkContract', row.id, this.detail(staffId, before, row));
      return row;
    } catch (error) { this.handleWriteError(error); }
  }

  async void(user: AuthenticatedUser, staffId: string, contractId: string) {
    await this.subscriptions.assertWritable(user.tenantId);
    await this.staff(user.tenantId, staffId);
    const before = await this.contract(user.tenantId, staffId, contractId);
    if (before.voidedAt) return before;
    const row = await this.prisma.staffWorkContract.update({ where: { id: before.id }, data: { voidedAt: new Date() } });
    await this.audit.create(user.tenantId, user.sub, 'STAFF_WORK_CONTRACT_VOIDED', 'StaffWorkContract', row.id, this.detail(staffId, before, row));
    return row;
  }

  private data(tenantId: string, staffId: string, input: StaffWorkContractInputDto): ContractData {
    if (input.effectiveTo && input.effectiveFrom > input.effectiveTo) throw new BadRequestException('適用開始日は適用終了日以前にしてください。');
    return {
      tenantId,
      staffId,
      effectiveFrom: date(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? date(input.effectiveTo) : null,
      annualizedTargetMinutes: input.annualizedTargetMinutes,
      prescribedDailyMinutes: input.prescribedDailyMinutes,
    };
  }

  private async assertNoOverlap(data: ContractData, excludeId?: string) {
    const rows = await this.prisma.staffWorkContract.findMany({
      where: { tenantId: data.tenantId, staffId: data.staffId, voidedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { effectiveFrom: true, effectiveTo: true },
    });
    if (rows.some((row) => overlaps(row.effectiveFrom, row.effectiveTo, data.effectiveFrom, data.effectiveTo))) {
      throw new ConflictException('勤務契約の適用期間が既存契約と重複しています。');
    }
  }

  private async staff(tenantId: string, id: string, active = false) {
    const row = await this.prisma.staff.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('職員が見つかりません。');
    if (active && !row.isActive) throw new BadRequestException('無効な職員へ勤務契約を追加・変更できません。');
    return row;
  }

  private async contract(tenantId: string, staffId: string, id: string) {
    const row = await this.prisma.staffWorkContract.findFirst({ where: { id, tenantId, staffId } });
    if (!row) throw new NotFoundException('勤務契約が見つかりません。');
    return row;
  }

  private handleWriteError(error: unknown): never {
    if (isStaffWorkContractOverlapError(error)) {
      throw new ConflictException('勤務契約の適用期間が既存契約と重複しています。');
    }
    throw error;
  }

  private detail(staffId: string, before: StaffWorkContract | null, after: StaffWorkContract): Prisma.InputJsonValue {
    return { staffId, before: before ? snapshot(before) : null, after: snapshot(after) } as Prisma.InputJsonValue;
  }
}

const OVERLAP_CONSTRAINT = 'StaffWorkContract_no_active_period_overlap';

export function isStaffWorkContractOverlapError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError)) return false;
  const message = error.message;
  return message.includes('23P01') && message.includes(OVERLAP_CONSTRAINT);
}

function date(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
function overlaps(aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null): boolean {
  return aStart <= (bEnd ?? new Date('9999-12-31T00:00:00.000Z')) && bStart <= (aEnd ?? new Date('9999-12-31T00:00:00.000Z'));
}
function snapshot(row: StaffWorkContract) {
  return {
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
    annualizedTargetMinutes: row.annualizedTargetMinutes,
    prescribedDailyMinutes: row.prescribedDailyMinutes,
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}
