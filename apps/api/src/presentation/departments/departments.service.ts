import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import type { DepartmentInput, DepartmentAssignmentInput } from './departments.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly db: PrismaService) {}
  list(user: AuthenticatedUser) {
    return this.db.department.findMany({ where: { tenantId: user.tenantId }, orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }] });
  }
  async save(user: AuthenticatedUser, input: DepartmentInput, id?: string) {
    if (!input.name.trim() || /[\u0000-\u001f\u007f]/.test(input.name)) throw new BadRequestException('部署名を入力してください。');
    try {
      return await this.db.$transaction(async tx => {
        const before = id ? await tx.department.findFirst({ where: { id, tenantId: user.tenantId } }) : null;
        if (id && !before) throw new NotFoundException('部署が見つかりません。');
        if (before && before.code !== input.code) throw new BadRequestException('部署コードは変更できません。');
        const data = { code: input.code, name: input.name.trim(), displayOrder: input.displayOrder, isActive: input.isActive };
        const row = id ? await tx.department.update({ where: { id, tenantId: user.tenantId }, data }) : await tx.department.create({ data: { tenantId: user.tenantId, ...data } });
        await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: id ? 'DEPARTMENT_UPDATED' : 'DEPARTMENT_CREATED', targetType: 'Department', targetId: row.id, detail: { before, after: row } as unknown as Prisma.InputJsonValue } });
        return row;
      });
    } catch (error: any) {
      if (error.code === 'P2002') throw new ConflictException('同じ部署コードが登録されています。');
      throw error;
    }
  }
  private async staff(user: AuthenticatedUser, staffId: string) {
    const row = await this.db.staff.findFirst({ where: { id: staffId, tenantId: user.tenantId } });
    if (!row) throw new NotFoundException('職員が見つかりません。');
    return row;
  }
  async assignments(user: AuthenticatedUser, staffId: string) {
    await this.staff(user, staffId);
    return this.db.staffDepartmentAssignment.findMany({ where: { tenantId: user.tenantId, staffId }, include: { department: true } });
  }
  async assign(user: AuthenticatedUser, staffId: string, input: DepartmentAssignmentInput) {
    if (!(await this.staff(user, staffId)).isActive) throw new BadRequestException('無効な職員には割り当てできません。');
    const startDate = input.startDate ? new Date(input.startDate) : null;
    const endDate = input.endDate ? new Date(input.endDate) : null;
    if (startDate && endDate && startDate > endDate) throw new BadRequestException('適用期間が不正です。');
    try {
      return await this.db.$transaction(async tx => {
        const department = await tx.department.findFirst({ where: { id: input.departmentId, tenantId: user.tenantId, isActive: true } });
        if (!department) throw new NotFoundException('有効な部署が見つかりません。');
        const previous = await tx.staffDepartmentAssignment.findMany({ where: { tenantId: user.tenantId, staffId, isActive: true } });
        const overlaps = previous.some(row => (!row.endDate || !startDate || row.endDate >= startDate) && (!endDate || !row.startDate || endDate >= row.startDate) && (row.departmentId === department.id || (row.isPrimary && input.isPrimary)));
        if (overlaps) throw new ConflictException('同じ部署または主部署の適用期間が重複しています。');
        const row = await tx.staffDepartmentAssignment.create({ data: { tenantId: user.tenantId, staffId, departmentId: department.id, startDate, endDate, isPrimary: input.isPrimary } });
        await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'STAFF_DEPARTMENT_ASSIGNED', targetType: 'StaffDepartmentAssignment', targetId: row.id, detail: { staffId, departmentId: department.id } } });
        return row;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      if (error.code === 'P2034') throw new ConflictException('部署割当が更新されました。再読込してください。');
      throw error;
    }
  }
  async deactivate(user: AuthenticatedUser, staffId: string, id: string) {
    await this.staff(user, staffId);
    return this.db.$transaction(async tx => {
      const row = await tx.staffDepartmentAssignment.findFirst({ where: { id, tenantId: user.tenantId, staffId } });
      if (!row) throw new NotFoundException('部署割当が見つかりません。');
      const updated = await tx.staffDepartmentAssignment.update({ where: { id, tenantId: user.tenantId }, data: { isActive: false } });
      await tx.auditLog.create({ data: { tenantId: user.tenantId, memberId: user.sub, action: 'STAFF_DEPARTMENT_DEACTIVATED', targetType: 'StaffDepartmentAssignment', targetId: id } });
      return updated;
    });
  }
}
