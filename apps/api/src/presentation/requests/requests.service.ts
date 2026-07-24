import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, ShiftRequestStatus } from '@prisma/client';
import { requestReviewerRoles } from '../../domain/requests/shift-request';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateRequestDto } from './create-request.dto';
import { UpdateRequestDto } from './update-request.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

const requestInclude = { staff: { select: { id: true, userId: true, employeeNumber: true, displayName: true } } } as const;

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService, private readonly audit: AuditService) {}

  staffOptions(user: AuthenticatedUser) {
    if (!this.isReviewer(user)) throw new ForbiddenException('職員一覧を参照する権限がありません。');
    return this.prisma.staff.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      select: { id: true, employeeNumber: true, displayName: true },
      orderBy: { employeeNumber: 'asc' },
    });
  }

  async list(user: AuthenticatedUser, month: string, requestedStaffId?: string) {
    const { start, end } = this.monthRange(month);
    const reviewer = this.isReviewer(user);
    let staffId = requestedStaffId;
    if (reviewer && staffId) await this.requireStaff(user.tenantId, staffId);
    if (!reviewer) {
      const own = await this.requireOwnStaff(user);
      if (staffId && staffId !== own.id) throw new ForbiddenException('他の職員の希望休は参照できません。');
      staffId = own.id;
    }
    return this.prisma.shiftRequest.findMany({
      where: { tenantId: user.tenantId, requestDate: { gte: start, lt: end }, ...(staffId ? { staffId } : {}) },
      include: requestInclude,
      orderBy: [{ requestDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async get(user: AuthenticatedUser, id: string) {
    const request = await this.prisma.shiftRequest.findFirst({ where: { id, tenantId: user.tenantId }, include: requestInclude });
    if (!request) throw new NotFoundException('希望休申請が見つかりません。');
    if (!this.isReviewer(user)) {
      const own = await this.requireOwnStaff(user);
      if (request.staffId !== own.id) throw new NotFoundException('希望休申請が見つかりません。');
    }
    return request;
  }

  async create(user: AuthenticatedUser, input: CreateRequestDto) {
    const reviewer = this.isReviewer(user);
    const own = await this.findOwnStaff(user);
    let staffId = input.staffId ?? own?.id;
    if (!staffId) throw new BadRequestException('対象職員を指定してください。');
    if (!reviewer && staffId !== own?.id) throw new ForbiddenException('他の職員の希望休は登録できません。');
    await this.requireStaff(user.tenantId, staffId);
    const requestDate = this.futureDate(input.requestDate);
    try {
      const created = await this.prisma.shiftRequest.create({
        data: { tenantId: user.tenantId, staffId, requestDate, requestType: input.requestType, reason: input.reason?.trim() || null },
        include: requestInclude,
      }); await this.audit.create(user.tenantId,user.sub,'REQUEST_CREATED','ShiftRequest',created.id,{staffId,requestDate:input.requestDate}); return created;
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async update(user: AuthenticatedUser, id: string, input: UpdateRequestDto) {
    const current = await this.get(user, id);
    const reviewer = this.isReviewer(user);
    if (!reviewer) {
      if (input.status !== undefined || input.adminComment !== undefined) throw new ForbiddenException('承認状態と管理者コメントは変更できません。');
      if (current.status !== ShiftRequestStatus.PENDING) throw new ForbiddenException('処理済みの希望休は編集できません。');
    }
    const data = {
      ...input,
      ...(input.requestDate !== undefined ? { requestDate: this.futureDate(input.requestDate) } : {}),
      ...(input.reason !== undefined ? { reason: input.reason?.trim() || null } : {}),
      ...(input.adminComment !== undefined ? { adminComment: input.adminComment?.trim() || null } : {}),
    };
    try {
      const updated = await this.prisma.shiftRequest.update({ where: { id: current.id }, data, include: requestInclude });
      if (reviewer && input.status && input.status !== current.status) { const type=input.status===ShiftRequestStatus.APPROVED?NotificationType.REQUEST_APPROVED:input.status===ShiftRequestStatus.REJECTED?NotificationType.REQUEST_REJECTED:null; if(type && updated.staff.userId) await this.notifications.create(user.tenantId,updated.staff.userId,type,'希望休申請',`${this.iso(updated.requestDate)}の希望休申請が${input.status===ShiftRequestStatus.APPROVED?'承認':'却下'}されました。`); }
      await this.audit.create(user.tenantId,user.sub,'REQUEST_UPDATED','ShiftRequest',updated.id,{status:updated.status}); return updated;
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const current = await this.get(user, id);
    if (current.status === ShiftRequestStatus.CANCELLED) return current;
    const updated=await this.prisma.shiftRequest.update({ where: { id: current.id }, data: { status: ShiftRequestStatus.CANCELLED }, include: requestInclude }); await this.audit.create(user.tenantId,user.sub,'REQUEST_CANCELLED','ShiftRequest',updated.id); return updated;
  }

  private isReviewer(user: AuthenticatedUser): boolean { return requestReviewerRoles.includes(user.role); }

  private findOwnStaff(user: AuthenticatedUser) {
    return this.prisma.staff.findUnique({ where: { tenantId_userId: { tenantId: user.tenantId, userId: user.sub } } });
  }

  private async requireOwnStaff(user: AuthenticatedUser) {
    const staff = await this.findOwnStaff(user);
    if (!staff?.isActive) throw new ForbiddenException('有効な職員情報が紐づいていません。');
    return staff;
  }

  private async requireStaff(tenantId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, tenantId, isActive: true } });
    if (!staff) throw new NotFoundException('職員が見つかりません。');
    return staff;
  }

  private monthRange(month: string) {
    const [year, value] = month.split('-').map(Number);
    return { start: new Date(Date.UTC(year, value - 1, 1)), end: new Date(Date.UTC(year, value, 1)) };
  }

  private futureDate(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('requestDateが正しい日付ではありません。');
    const japanToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (value < japanToday) throw new BadRequestException('過去日は申請できません。');
    return date;
  }

  private handleWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('同じ職員・日付・種類の希望休がすでに登録されています。');
    throw error;
  }
  private iso(value:Date){return value.toISOString().slice(0,10);}
}
