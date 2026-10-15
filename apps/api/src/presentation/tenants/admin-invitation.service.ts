import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PasswordService } from '../../application/auth/password.service';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
export const invitationHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const invitationSecret = () => randomBytes(32).toString('hex');
export class AcceptAdminInvitationDto {
  @IsUUID() tenantId!: string;
  @IsUUID() invitationId!: string;
  @Matches(/^[a-f0-9]{64}$/) token!: string;
  @Matches(/^[a-z0-9][a-z0-9._-]{2,63}$/) loginId!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
  @IsString() @MinLength(12) @MaxLength(128) confirmPassword!: string;
}
@Injectable()
export class AdminInvitationService {
  constructor(private readonly db: PrismaService, private readonly passwords: PasswordService) {}
  async accept(input: AcceptAdminInvitationDto) {
    if (process.env.COMMERCIAL_ONBOARDING_ENABLED !== 'true') throw new ForbiddenException('登録受付は停止中です。');
    if (input.password !== input.confirmPassword) throw new BadRequestException('確認用パスワードが一致しません。');
    const policy = this.passwords.validateNewPassword(input.password, {loginId:input.loginId, displayName:''});
    if (policy) throw new BadRequestException(policy);
    const passwordHash = await this.passwords.hash(input.password);
    return this.db.$transaction(async tx => {
      const invitation = await tx.invitation.findFirst({where:{id:input.invitationId,tenantId:input.tenantId,tokenHash:invitationHash(input.token),role:'ADMIN',status:'PENDING',expiresAt:{gt:new Date()}}});
      if (!invitation?.invitedUserId) throw new ForbiddenException('招待情報が無効、使用済み、または期限切れです。');
      const user = await tx.user.findUnique({where:{id:invitation.invitedUserId}});
      const member = await tx.membership.findUnique({where:{tenantId_userId:{tenantId:input.tenantId,userId:invitation.invitedUserId}}});
      if (!user || user.loginId !== input.loginId || user.isActive || user.isPlatformAdmin || !member?.isActive || member.role !== 'ADMIN') throw new ForbiddenException('招待情報を確認できません。');
      const identityPolicy = this.passwords.validateNewPassword(input.password, user);
      if (identityPolicy) throw new BadRequestException(identityPolicy);
      const claimed = await tx.invitation.updateMany({where:{id:invitation.id,status:'PENDING',expiresAt:{gt:new Date()}},data:{status:'ACCEPTED',acceptedAt:new Date()}});
      if (claimed.count !== 1) throw new ForbiddenException('招待情報は既に利用されています。');
      const activated = await tx.user.updateMany({where:{id:user.id,isActive:false,tokenVersion:user.tokenVersion},data:{passwordHash,isActive:true,mustChangePassword:false,tokenVersion:{increment:1}}});
      if(activated.count!==1)throw new ForbiddenException('登録状態が更新されました。');
      await tx.auditLog.create({data:{tenantId:input.tenantId,memberId:user.id,action:'ADMIN_INVITATION_ACCEPTED',targetType:'Invitation',targetId:invitation.id}});
      return {registered:true,requiresLogin:true};
    });
  }
  async list(actor: AuthenticatedUser, tenantId: string) {
    const operator = await this.db.user.findUnique({where:{id:actor.sub}});
    if (!operator?.isActive || !operator.isPlatformAdmin) throw new ForbiddenException();
    return this.db.invitation.findMany({where:{tenantId,role:'ADMIN',invitedUserId:{not:null}},select:{id:true,tenantId:true,status:true,expiresAt:true,acceptedAt:true,createdAt:true},orderBy:{createdAt:'desc'},take:50});
  }
  async reissue(actor: AuthenticatedUser, tenantId: string, id: string) {
    const operator=await this.db.user.findUnique({where:{id:actor.sub}});
    if(process.env.COMMERCIAL_ONBOARDING_ENABLED!=='true'||!operator?.isActive||!operator.isPlatformAdmin)throw new ForbiddenException();
    const token=invitationSecret(),expiresAt=new Date(Date.now()+48*3600000);
    return this.db.$transaction(async tx=>{
      const old=await tx.invitation.findFirst({where:{id,tenantId,role:'ADMIN',status:{in:['PENDING','EXPIRED']}}});
      if(!old?.invitedUserId)throw new ForbiddenException('再発行できない招待です。');
      const user=await tx.user.findUnique({where:{id:old.invitedUserId}});
      if(!user||user.isActive)throw new ForbiddenException('登録済みの管理者です。');
      const revoked=await tx.invitation.updateMany({where:{id,status:{in:['PENDING','EXPIRED']}},data:{status:'REVOKED',revokedAt:new Date()}});
      if(revoked.count!==1)throw new ForbiddenException('招待が更新されました。');
      const next=await tx.invitation.create({data:{tenantId,invitedUserId:user.id,role:'ADMIN',tokenHash:invitationHash(token),expiresAt,createdByUserId:actor.sub}});
      await tx.auditLog.create({data:{tenantId,memberId:actor.sub,action:'ADMIN_INVITATION_REISSUED',targetType:'Invitation',targetId:next.id,detail:{previousInvitationId:id}}});
      return {id:next.id,tenantId,loginId:user.loginId,token,expiresAt};
    });
  }
}
