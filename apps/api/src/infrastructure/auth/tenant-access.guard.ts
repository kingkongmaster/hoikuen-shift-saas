import { verifyContract, contractReadOnly } from '../../domain/subscriptions/contract-policy';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from './auth.types';

@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const user = request.user;
    const membership = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: user.tenantId, userId: user.sub } } });
    if (!membership?.isActive || membership.role !== user.role || !Number.isInteger(user.membershipTokenVersion) || membership.tokenVersion !== user.membershipTokenVersion) throw new ForbiddenException('園へのアクセス権限がありません。');
    const path=request.path.replace(/^\/api/, '');
    // Operator routes have their own live platform authorization. Contract metadata
    // remains accessible so suspended customers can understand the restriction.
    const support = (path === '/support/tickets' && ['GET','POST'].includes(request.method)) || (/^\/support\/tickets\/[0-9a-f-]{36}$/i.test(path) && request.method === 'GET') || (/^\/support\/tickets\/[0-9a-f-]{36}\/messages$/i.test(path) && request.method === 'POST');
    if(!support&&!path.startsWith('/platform/')&&!['/tenants/provision','/tenants/operator-context'].includes(path)&&!/^\/tenants\/[^/]+\/invitations/.test(path)){
      const sub=await this.prisma.tenantSubscription.findUnique({where:{tenantId:user.tenantId}});
      const metadata=path==='/me'||path==='/subscription'||path==='/subscription/access'||path==='/features';
      if(sub?.status==='SUSPENDED'&&!metadata)throw new ForbiddenException({code:'SUBSCRIPTION_SUSPENDED',message:'この園の利用は停止されています。運営窓口へお問い合わせください。'});
      if(!metadata||!['GET','HEAD','OPTIONS'].includes(request.method)){
        const verified=verifyContract(sub,user.tenantId);
        if(contractReadOnly(verified))throw new ForbiddenException({code:'SUBSCRIPTION_READ_ONLY',message:'現在の契約では業務機能を利用できません。契約情報をご確認ください。'});
      }
    }
    return true;
  }
}
