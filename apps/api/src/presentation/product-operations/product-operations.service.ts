import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { ProductLegal } from './product-legal';
import type { ApplicationInput, ReplyInput, TicketInput } from './product-operations.dto';
@Injectable()
export class ProductOperationsService {
  constructor(private db:PrismaService, private legal:ProductLegal) {}
  async operator(actor:AuthenticatedUser) {
    const u=await this.db.user.findUnique({where:{id:actor.sub}});
    if(!u?.isActive||!u.isPlatformAdmin||u.tokenVersion!==actor.tokenVersion) throw new ForbiddenException('運営者専用です。');
  }
  async applications(actor:AuthenticatedUser) { await this.operator(actor); return this.db.productApplication.findMany({take:100,orderBy:{createdAt:'desc'}}); }
  async apply(input:ApplicationInput) {
    const d=this.legal.current();
    if(!d.approved) throw new ServiceUnavailableException('正式な販売規約は確認中です。申込受付はまだ開始していません。');
    if(input.version!==d.version||input.hash!==d.hash||input.agreed!==true) throw new BadRequestException('最新の規約・個人情報方針をご確認ください。');
    if(!input.organization.trim()||!input.contactName.trim()) throw new BadRequestException('必要事項を入力してください。');
    const a=await this.db.productApplication.create({data:{organization:input.organization.trim(),contactName:input.contactName.trim(),contactEmail:input.contactEmail.toLowerCase(),requestedPlan:input.requestedPlan,consent:{version:d.version,hash:d.hash,terms:d.terms,privacy:d.privacy,acceptedAt:new Date().toISOString(),identity:'UNVERIFIED_APPLICANT',agreed:true}}});
    // Receipt reveals no other applicants and is not an authorization credential.
    return {id:a.id,receivedAt:a.createdAt,message:'申込を受け付けました。運営者が申込内容と管理者本人を確認します。自動課金はありません。'};
  }
  list(actor:AuthenticatedUser) { return this.db.supportTicket.findMany({where:{tenantId:actor.tenantId,requesterId:actor.sub},take:100,orderBy:{updatedAt:'desc'},select:{id:true,subject:true,category:true,status:true,createdAt:true,updatedAt:true}}); }
  async queue(actor:AuthenticatedUser) { await this.operator(actor); return this.db.supportTicket.findMany({take:100,orderBy:{updatedAt:'desc'},select:{id:true,tenantId:true,category:true,status:true,createdAt:true,updatedAt:true}}); }
  async detail(actor:AuthenticatedUser,id:string,operator=false) {
    if(operator) await this.operator(actor);
    const row=await this.db.supportTicket.findFirst({where:{id,...(operator?{}:{tenantId:actor.tenantId,requesterId:actor.sub})},include:{messages:{orderBy:{createdAt:'asc'},select:{id:true,body:true,fromOperator:true,status:true,createdAt:true}}}});
    if(!row) throw new NotFoundException('問い合わせが見つかりません。');
    if(operator) await this.db.auditLog.create({data:{tenantId:row.tenantId,memberId:actor.sub,action:'SUPPORT_VIEWED',targetType:'SupportTicket',targetId:id,detail:{}}});
    const {requesterId,...result}=row; return result;
  }
  async create(actor:AuthenticatedUser,input:TicketInput) {
    if(!input.subject.trim()||!input.body.trim()) throw new BadRequestException('件名と内容を入力してください。');
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${actor.tenantId}::uuid FOR UPDATE`;
      const recent=await tx.supportTicket.count({where:{tenantId:actor.tenantId,requesterId:actor.sub,createdAt:{gte:new Date(Date.now()-86400000)}}});
      if(recent>=10) throw new HttpException('1日の送信上限に達しました。',429);
      const row=await tx.supportTicket.create({data:{tenantId:actor.tenantId,requesterId:actor.sub,subject:input.subject.trim(),category:input.category,messages:{create:{authorId:actor.sub,body:input.body.trim(),status:'OPEN'}}}});
      await tx.auditLog.create({data:{tenantId:actor.tenantId,memberId:actor.sub,action:'SUPPORT_CREATED',targetType:'SupportTicket',targetId:row.id,detail:{}}});
      return {id:row.id,status:row.status,createdAt:row.createdAt};
    });
  }
  async reply(actor:AuthenticatedUser,id:string,input:ReplyInput,operator=false) {
    if(operator) await this.operator(actor);
    if(!input.body.trim()) throw new BadRequestException('対応内容を入力してください。');
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "SupportTicket" WHERE id=${id}::uuid FOR UPDATE`;
      const row=await tx.supportTicket.findFirst({where:{id,...(operator?{}:{tenantId:actor.tenantId,requesterId:actor.sub})}});
      if(!row) throw new NotFoundException('問い合わせが見つかりません。');
      if(await tx.supportMessage.count({where:{ticketId:id}})>=100) throw new HttpException('この問い合わせの追記上限です。新しい問い合わせを作成してください。',429);
      const status=operator?input.status:'OPEN';
      await tx.supportMessage.create({data:{ticketId:id,authorId:actor.sub,fromOperator:operator,body:input.body.trim(),status}});
      await tx.supportTicket.update({where:{id},data:{status}});
      await tx.auditLog.create({data:{tenantId:row.tenantId,memberId:actor.sub,action:'SUPPORT_REPLIED',targetType:'SupportTicket',targetId:id,detail:{status,fromOperator:operator}}});
      return {id,status};
    });
  }
}
