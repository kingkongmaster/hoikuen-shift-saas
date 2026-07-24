import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  create(tenantId: string, memberId: string, action: string, targetType: string, targetId: string, detail?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({ data: { tenantId, memberId, action, targetType, targetId, detail } });
  }
  list(user: AuthenticatedUser, input: { from?: string; to?: string; memberId?: string; action?: string }) {
    const createdAt = { ...(input.from ? { gte: new Date(`${input.from}T00:00:00.000Z`) } : {}), ...(input.to ? { lt: new Date(`${input.to}T00:00:00.000Z`) } : {}) };
    return this.prisma.auditLog.findMany({
      where: { tenantId: user.tenantId, ...(input.memberId ? { memberId: input.memberId } : {}), ...(input.action ? { action: input.action } : {}), ...(Object.keys(createdAt).length ? { createdAt } : {}) },
      include: { member: { select: { id: true, displayName: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 200,
    });
  }
}
