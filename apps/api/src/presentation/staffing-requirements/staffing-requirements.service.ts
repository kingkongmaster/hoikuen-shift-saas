import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ShiftStaffingRequirement } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ShiftStaffingRequirementInputDto } from './staffing-requirement.dto';

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
type Tx = Prisma.TransactionClient;

@Injectable()
export class StaffingRequirementsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list(user: AuthenticatedUser) {
    return this.prisma.shiftStaffingRequirement.findMany({ where: { tenantId: user.tenantId }, include: { attributeDefinition: true }, orderBy: [{ isActive: 'desc' }, { displayOrder: 'asc' }, { code: 'asc' }] });
  }

  async create(user: AuthenticatedUser, input: ShiftStaffingRequirementInputDto) {
    if (!input.isActive) throw new BadRequestException('新規条件は有効状態で作成してください。');
    const data = await this.data(this.prisma, user.tenantId, input);
    let before: ShiftStaffingRequirement | null = null;
    let action = 'SHIFT_STAFFING_REQUIREMENT_CREATED';
    const row = await this.serializable(async (tx) => {
      const existing = await tx.shiftStaffingRequirement.findFirst({ where: { tenantId: user.tenantId, code: input.code } });
      if (existing?.isActive) throw new ConflictException('同じコードの配置条件があります。');
      await this.checkOverlap(tx, data, existing?.id);
      if (existing) {
        before = existing; action = 'SHIFT_STAFFING_REQUIREMENT_REACTIVATED';
        return tx.shiftStaffingRequirement.update({ where: { id: existing.id }, data: { ...data, isActive: true } });
      }
      return tx.shiftStaffingRequirement.create({ data });
    });
    await this.log(user, action, before, row);
    return this.withDefinition(user.tenantId, row.id);
  }

  async update(user: AuthenticatedUser, id: string, input: ShiftStaffingRequirementInputDto) {
    const current = await this.requirement(user.tenantId, id);
    if (input.code !== current.code) throw new BadRequestException('配置条件コードは作成後に変更できません。');
    const data = await this.data(this.prisma, user.tenantId, input, current.attributeDefinitionId);
    const row = await this.serializable(async (tx) => {
      if (data.isActive) await this.checkOverlap(tx, data, id);
      return tx.shiftStaffingRequirement.update({ where: { id }, data });
    });
    const action = row.isActive && !current.isActive ? 'SHIFT_STAFFING_REQUIREMENT_REACTIVATED' : !row.isActive && current.isActive ? 'SHIFT_STAFFING_REQUIREMENT_DEACTIVATED' : 'SHIFT_STAFFING_REQUIREMENT_UPDATED';
    await this.log(user, action, current, row);
    return this.withDefinition(user.tenantId, row.id);
  }

  async deactivate(user: AuthenticatedUser, id: string) {
    const before = await this.requirement(user.tenantId, id);
    if (!before.isActive) return this.withDefinition(user.tenantId, id);
    const row = await this.prisma.shiftStaffingRequirement.update({ where: { id }, data: { isActive: false } });
    await this.log(user, 'SHIFT_STAFFING_REQUIREMENT_DEACTIVATED', before, row);
    return this.withDefinition(user.tenantId, id);
  }

  private async data(db: PrismaService | Tx, tenantId: string, input: ShiftStaffingRequirementInputDto, currentDefinitionId?: string) {
    if (!input.name.trim()) throw new BadRequestException('名称を入力してください。');
    if (input.reason && CONTROL.test(input.reason)) throw new BadRequestException('理由に制御文字は使用できません。');
    if ((input.startDate == null) !== (input.endDate == null)) throw new BadRequestException('開始日と終了日は両方設定してください。');
    const startDate = input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null;
    const endDate = input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null;
    if (startDate && endDate && startDate > endDate) throw new BadRequestException('開始日は終了日以前にしてください。');
    if (startDate && endDate && startDate.getTime() === endDate.getTime() && input.dayOfWeek != null && startDate.getUTCDay() !== input.dayOfWeek) throw new BadRequestException('特定日の曜日指定が実際の曜日と一致しません。');
    const definition = await db.staffAttributeDefinition.findFirst({ where: { tenantId, id: input.attributeDefinitionId } });
    if (!definition) throw new NotFoundException('属性定義が見つかりません。');
    if (!definition.isActive && (definition.id !== currentDefinitionId || input.isActive)) throw new BadRequestException('無効な属性定義は新規条件・再有効化に指定できません。');
    return { tenantId, code: input.code, name: input.name.trim(), attributeDefinitionId: definition.id, classType: input.classType ?? null, dayOfWeek: input.dayOfWeek ?? null, startDate, endDate, requiredCount: input.requiredCount, constraintLevel: input.constraintLevel, reason: input.reason?.trim() || null, displayOrder: input.displayOrder, isActive: input.isActive };
  }

  private async checkOverlap(tx: Tx, data: Awaited<ReturnType<StaffingRequirementsService['data']>>, excludeId?: string) {
    if (!data.isActive) return;
    const rows = await tx.shiftStaffingRequirement.findMany({ where: { tenantId: data.tenantId, attributeDefinitionId: data.attributeDefinitionId, classType: data.classType, dayOfWeek: data.dayOfWeek, isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (rows.some((row) => this.overlap(row.startDate, row.endDate, data.startDate, data.endDate))) throw new ConflictException('同じ属性・対象・曜日の有効期間が重複しています。');
  }

  private overlap(aStart: Date | null, aEnd: Date | null, bStart: Date | null, bEnd: Date | null) { return !aStart || !aEnd || !bStart || !bEnd || aStart <= bEnd && bStart <= aEnd; }
  private async serializable<T>(work: (tx: Tx) => Promise<T>) { try { return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) throw new ConflictException('同じ配置条件が同時に更新されました。再読み込みしてお試しください。'); throw error; } }
  private async requirement(tenantId: string, id: string) { const row = await this.prisma.shiftStaffingRequirement.findFirst({ where: { tenantId, id } }); if (!row) throw new NotFoundException('配置条件が見つかりません。'); return row; }
  private withDefinition(tenantId: string, id: string) { return this.prisma.shiftStaffingRequirement.findFirstOrThrow({ where: { tenantId, id }, include: { attributeDefinition: true } }); }
  private date(value: Date | null) { return value?.toISOString().slice(0, 10) ?? null; }
  private snapshot(row: ShiftStaffingRequirement) { return { code: row.code, name: row.name, attributeDefinitionId: row.attributeDefinitionId, classType: row.classType, dayOfWeek: row.dayOfWeek, startDate: this.date(row.startDate), endDate: this.date(row.endDate), requiredCount: row.requiredCount, constraintLevel: row.constraintLevel, reason: row.reason, displayOrder: row.displayOrder, isActive: row.isActive }; }
  private log(user: AuthenticatedUser, action: string, before: ShiftStaffingRequirement | null, after: ShiftStaffingRequirement) { return this.audit.create(user.tenantId, user.sub, action, 'ShiftStaffingRequirement', after.id, { tenantId: user.tenantId, requirementId: after.id, code: after.code, before: before ? this.snapshot(before) : null, after: this.snapshot(after) }); }
}
