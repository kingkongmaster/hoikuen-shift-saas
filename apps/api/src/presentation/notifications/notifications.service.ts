import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}
  list(user: AuthenticatedUser) { return this.prisma.notification.findMany({ where: { tenantId: user.tenantId, memberId: user.sub }, orderBy: { createdAt: 'desc' } }); }
  async read(user: AuthenticatedUser, id: string) { const notification = await this.prisma.notification.findFirst({ where: { id, tenantId: user.tenantId, memberId: user.sub } }); if (!notification) throw new NotFoundException('通知が見つかりません。'); return this.prisma.notification.update({ where: { id }, data: { isRead: true } }); }
  async readAll(user: AuthenticatedUser) { const result = await this.prisma.notification.updateMany({ where: { tenantId: user.tenantId, memberId: user.sub, isRead: false }, data: { isRead: true } }); return { updatedCount: result.count }; }
  create(tenantId: string, memberId: string, type: NotificationType, title: string, message: string) { return this.prisma.notification.create({ data: { tenantId, memberId, type, title, message } }); }
  async notifyRoles(tenantId: string, roles: Array<'ADMIN' | 'DIRECTOR'>, type: NotificationType, title: string, message: string) { const memberships = await this.prisma.membership.findMany({ where: { tenantId, isActive: true, role: { in: roles } }, select: { userId: true } }); return this.prisma.notification.createMany({ data: memberships.map((member) => ({ tenantId, memberId: member.userId, type, title, message })), skipDuplicates: true }); }
  async notifyTenant(tenantId: string, type: NotificationType, title: string, message: string) { const memberships = await this.prisma.membership.findMany({ where: { tenantId, isActive: true }, select: { userId: true } }); return this.prisma.notification.createMany({ data: memberships.map((member) => ({ tenantId, memberId: member.userId, type, title, message })), skipDuplicates: true }); }
}
