import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FeaturesService } from '../features/features.service';
import type { WorkPatternInputDto } from './work-pattern.dto';

export const SYSTEM_WORK_PATTERNS = [
  { code: 'EARLY', name: '早出', shortName: '早', displayOrder: 10, startTime: '07:00', endTime: '16:00', breakMinutes: 60, color: '#f59e0b', isWorking: true, isDefault: false },
  { code: 'NORMAL', name: '通常', shortName: '通', displayOrder: 20, startTime: '08:30', endTime: '17:00', breakMinutes: 60, color: '#10b981', isWorking: true, isDefault: true },
  { code: 'LATE', name: '遅出', shortName: '遅', displayOrder: 30, startTime: '11:00', endTime: '19:30', breakMinutes: 60, color: '#6366f1', isWorking: true, isDefault: false },
  { code: 'OFF', name: '休み', shortName: '休', displayOrder: 40, startTime: null, endTime: null, breakMinutes: 0, color: '#94a3b8', isWorking: false, isDefault: false },
] as const;
const SYSTEM_CODES = new Set<string>(SYSTEM_WORK_PATTERNS.map((row) => row.code));

@Injectable()
export class WorkPatternsService {
  constructor(private readonly prisma: PrismaService, private readonly features: FeaturesService, private readonly audit: AuditService) {}

  async list(user: AuthenticatedUser) {
    await this.ensureSystemPatterns(user.tenantId);
    const advanced = (await this.features.resolve(user.tenantId, 'ADVANCED_WORK_PATTERNS')).enabled;
    return this.prisma.workPattern.findMany({ where: { tenantId: user.tenantId, ...(advanced ? {} : { code: { in: [...SYSTEM_CODES] } }) }, orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }] });
  }

  async create(user: AuthenticatedUser, input: WorkPatternInputDto) {
    await this.requireAdvanced(user.tenantId);
    this.validate(input);
    if (SYSTEM_CODES.has(input.code)) throw new ConflictException('予約済みの勤務パターンコードです。');
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (input.isDefault) await tx.workPattern.updateMany({ where: { tenantId: user.tenantId, isDefault: true }, data: { isDefault: false } });
        return tx.workPattern.create({ data: { tenantId: user.tenantId, ...this.clean(input), isSystem: false } });
      });
      await this.audit.create(user.tenantId, user.sub, 'WORK_PATTERN_CREATED', 'WorkPattern', row.id, { code: row.code });
      return row;
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('同じコードの勤務パターンがあります。'); throw error; }
  }

  async update(user: AuthenticatedUser, id: string, input: WorkPatternInputDto) {
    const current = await this.get(user.tenantId, id);
    if (!current.isSystem) await this.requireAdvanced(user.tenantId);
    this.validate(input);
    if (current.isSystem && input.code !== current.code) throw new BadRequestException('標準勤務パターンのコードは変更できません。');
    if (!current.isSystem && SYSTEM_CODES.has(input.code)) throw new ConflictException('予約済みの勤務パターンコードです。');
    this.validateSystemInvariants(current.code, current.isSystem, input);
    let row;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        if (!input.isDefault && current.isDefault) {
          const replacement = await tx.workPattern.count({ where: { tenantId: user.tenantId, id: { not: id }, isDefault: true, isWorking: true, isActive: true } });
          if (!replacement) throw new BadRequestException('既定勤務を解除する前に、別の有効な勤務パターンを既定にしてください。');
        }
        if (input.isDefault) await tx.workPattern.updateMany({ where: { tenantId: user.tenantId, id: { not: id }, isDefault: true }, data: { isDefault: false } });
        return tx.workPattern.update({ where: { id }, data: this.clean(input) });
      });
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('既定勤務パターンの同時更新を完了できませんでした。再度お試しください。'); throw error; }
    await this.audit.create(user.tenantId, user.sub, 'WORK_PATTERN_UPDATED', 'WorkPattern', id, { code: row.code });
    return row;
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.requireAdvanced(user.tenantId);
    const current = await this.get(user.tenantId, id);
    if (current.isSystem) throw new BadRequestException('標準勤務パターンは削除できません。');
    if (current.isDefault) throw new BadRequestException('既定勤務パターンは無効化できません。先に別の勤務パターンを既定にしてください。');
    const row = await this.prisma.workPattern.update({ where: { id }, data: { isActive: false, isDefault: false } });
    await this.audit.create(user.tenantId, user.sub, 'WORK_PATTERN_DEACTIVATED', 'WorkPattern', id, { code: row.code });
    return row;
  }

  async ensureSystemPatterns(tenantId: string) {
    await this.prisma.$transaction(async (tx) => {
      const [setting, existing] = await Promise.all([tx.tenantShiftSetting.findUnique({ where: { tenantId } }), tx.workPattern.findMany({ where: { tenantId, code: { in: [...SYSTEM_CODES] } }, select: { code: true, isDefault: true, isWorking: true, isActive: true } })]);
      const existingCodes = new Set(existing.map((row) => row.code));
      const hasDefault = existing.some((row) => row.isDefault && row.isWorking && row.isActive);
      const missing = SYSTEM_WORK_PATTERNS.filter((pattern) => !existingCodes.has(pattern.code)).map((pattern) => pattern.code === 'EARLY' ? { ...pattern, startTime: setting?.defaultStartEarly ?? pattern.startTime, endTime: setting?.defaultEndEarly ?? pattern.endTime, breakMinutes: setting?.defaultBreakMinutes ?? pattern.breakMinutes }
        : pattern.code === 'NORMAL' ? { ...pattern, startTime: setting?.defaultStartNormal ?? pattern.startTime, endTime: setting?.defaultEndNormal ?? pattern.endTime, breakMinutes: setting?.defaultBreakMinutes ?? pattern.breakMinutes, isDefault: !hasDefault }
          : pattern.code === 'LATE' ? { ...pattern, startTime: setting?.defaultStartLate ?? pattern.startTime, endTime: setting?.defaultEndLate ?? pattern.endTime, breakMinutes: setting?.defaultBreakMinutes ?? pattern.breakMinutes } : pattern);
      if (missing.length) await tx.workPattern.createMany({ data: missing.map((pattern) => ({ tenantId, ...pattern, isSystem: true, isActive: true })), skipDuplicates: true });
    });
  }

  private validate(input: WorkPatternInputDto) {
    const hasStart = !!input.startTime; const hasEnd = !!input.endTime;
    if (hasStart !== hasEnd) throw new BadRequestException('開始時刻と終了時刻は両方設定してください。');
    if (input.isWorking && (!hasStart || !hasEnd)) throw new BadRequestException('勤務パターンには開始・終了時刻が必要です。');
    if (!input.isWorking && (hasStart || hasEnd)) throw new BadRequestException('非勤務パターンには勤務時刻を設定できません。');
    if (input.isDefault && (!input.isWorking || !input.isActive)) throw new BadRequestException('既定勤務には有効な勤務パターンを指定してください。');
    if (input.startTime && input.endTime && input.endTime <= input.startTime) throw new BadRequestException('終了時刻は開始時刻より後にしてください。');
    if (!input.name.trim() || !input.shortName.trim()) throw new BadRequestException('名称を入力してください。');
  }
  private validateSystemInvariants(code: string, isSystem: boolean, input: WorkPatternInputDto) {
    if (!isSystem) return;
    if (!input.isActive) throw new BadRequestException('標準勤務パターンは無効化できません。');
    if (code === 'OFF') {
      if (input.isWorking || input.startTime || input.endTime || input.breakMinutes !== 0 || input.isDefault) throw new BadRequestException('OFFは勤務なし・時刻なし・休憩0分の標準パターンです。');
    } else if (!input.isWorking) throw new BadRequestException('EARLY・NORMAL・LATEは勤務パターンとして維持してください。');
  }
  private clean(input: WorkPatternInputDto) { return { ...input, code: input.code.trim().toUpperCase(), name: input.name.trim(), shortName: input.shortName.trim(), startTime: input.startTime || null, endTime: input.endTime || null, color: input.color || null }; }
  private async get(tenantId: string, id: string) { const row = await this.prisma.workPattern.findFirst({ where: { id, tenantId } }); if (!row) throw new NotFoundException('勤務パターンが見つかりません。'); return row; }
  private async requireAdvanced(tenantId: string) { if (!(await this.features.resolve(tenantId, 'ADVANCED_WORK_PATTERNS')).enabled) throw new ForbiddenException({ code: 'FEATURE_NOT_ENTITLED', message: '複数勤務パターンはProfessionalまたは個別契約で利用できます。' }); }
}
