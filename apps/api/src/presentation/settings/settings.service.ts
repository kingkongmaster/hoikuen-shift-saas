import { BadRequestException, Injectable } from '@nestjs/common';
import { AssignedClass } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { UpdateClassRequirementsDto, UpdateShiftSettingDto } from './settings.dto';
import { AuditService } from '../audit/audit.service';
const classes = [AssignedClass.AGE_0, AssignedClass.AGE_1, AssignedClass.AGE_2, AssignedClass.AGE_3, AssignedClass.AGE_4, AssignedClass.AGE_5];
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  setting(user: AuthenticatedUser) { return this.ensureSetting(user.tenantId); }
  async updateSetting(user: AuthenticatedUser, input: UpdateShiftSettingDto) { const merged = { ...(await this.ensureSetting(user.tenantId)), ...input }; for (const [start, end] of [['defaultStartEarly','defaultEndEarly'],['defaultStartNormal','defaultEndNormal'],['defaultStartLate','defaultEndLate']] as const) if (merged[start] >= merged[end]) throw new BadRequestException(`${start}は終了時刻より前に指定してください。`); const updated=await this.prisma.tenantShiftSetting.update({ where: { tenantId: user.tenantId }, data: input }); await this.audit.create(user.tenantId,user.sub,'SHIFT_SETTING_UPDATED','TenantShiftSetting',updated.id); return updated; }
  async requirements(user: AuthenticatedUser) { await this.ensureRequirements(user.tenantId); return this.prisma.classStaffingRequirement.findMany({ where: { tenantId: user.tenantId }, orderBy: { classType: 'asc' } }); }
  async updateRequirements(user: AuthenticatedUser, input: UpdateClassRequirementsDto) { const keys = new Set(input.requirements.map((item) => item.classType)); if (keys.size !== input.requirements.length) throw new BadRequestException('同じクラスを重複して登録できません。'); await this.prisma.$transaction(input.requirements.map((item) => this.prisma.classStaffingRequirement.upsert({ where: { tenantId_classType: { tenantId: user.tenantId, classType: item.classType } }, create: { tenantId: user.tenantId, ...item }, update: item }))); await this.audit.create(user.tenantId,user.sub,'CLASS_REQUIREMENTS_UPDATED','ClassStaffingRequirement',user.tenantId,{count:input.requirements.length}); return this.requirements(user); }
  async ensureSetting(tenantId: string) { return this.prisma.tenantShiftSetting.upsert({ where: { tenantId }, update: {}, create: { tenantId } }); }
  async ensureRequirements(tenantId: string) { await this.prisma.$transaction(classes.map((classType) => this.prisma.classStaffingRequirement.upsert({ where: { tenantId_classType: { tenantId, classType } }, update: {}, create: { tenantId, classType, weekdayRequired: classType === AssignedClass.AGE_0 ? 3 : 2, saturdayRequired: 0 } }))); }
}
