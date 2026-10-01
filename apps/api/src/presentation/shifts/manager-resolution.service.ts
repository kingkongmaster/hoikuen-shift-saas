import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MonthlyGenerationContextBuilder } from '../../application/shifts/monthly-generation-context-builder';
import { validateGenerationContext } from '../../application/shifts/generation-preflight-validator';
import { applyMonthlyAnswers } from '../../application/manager-resolution/monthly-effects';
import { submitAnswer, validateItem, draftScope, type ReviewItem, type Answer } from '../../application/manager-resolution/resolution';
const prefix='MANAGER_REVIEW:';
export function reviewDigest(items:ReviewItem[]) { return createHash('sha256').update(JSON.stringify([...items].sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex'); }
export function readReviewRows(rows:Array<{id:string;tenantId:string;version:number;configuration:unknown}>) {
 return rows.map(row=>{const item=row.configuration as ReviewItem;validateItem(item);if(item.id!==row.id||item.tenantId!==row.tenantId||item.revision!==row.version)throw new ConflictException('確認事項の保存状態が一致しません。');return item;});
}
@Injectable()
export class ManagerResolutionService {
 constructor(private readonly prisma:PrismaService,private readonly contexts:MonthlyGenerationContextBuilder){}
 async rows(tenantId:string,month:string,db:Prisma.TransactionClient=this.prisma) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new BadRequestException('対象月が不正です。');
  const start=new Date(month+'-01T00:00:00Z'),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1));
  const items=readReviewRows(await db.tenantRuleException.findMany({where:{tenantId,isActive:true,exceptionType:{startsWith:prefix},exceptionDate:{gte:start,lt:end}},orderBy:{id:'asc'}}));
  draftScope(items,tenantId,month);return items;
 }
 private admin(user:AuthenticatedUser){if(user.role!=='ADMIN')throw new ForbiddenException();}
 async list(user:AuthenticatedUser,month:string){this.admin(user);const items=await this.rows(user.tenantId,month);const staff=await this.prisma.staff.findMany({where:{tenantId:user.tenantId,id:{in:[...new Set(items.flatMap(i=>i.staffIds))]}},select:{id:true,displayName:true}});return items.map(i=>({id:i.id,groupId:i.groupId,revision:i.revision,dates:i.dates,kind:i.kind,status:i.status,reason:i.reason,knownConditions:i.knownConditions,impact:i.impact,targetLabel:i.staffIds.map(id=>staff.find(s=>s.id===id)?.displayName??'対象確認待ち').join('、'),options:i.options.map(value=>({value,label:i.optionLabels?.[value]??value})),answer:i.answer??null}));}
 async detail(user:AuthenticatedUser,month:string,id:string){const item=(await this.list(user,month)).find(i=>i.id===id);if(!item)throw new NotFoundException();return item;}
 async answer(user:AuthenticatedUser,month:string,id:string,revision:number,answer:Answer){this.admin(user);return this.prisma.$transaction(async db=>{
  await this.lock(db,user.tenantId,month);const items=await this.rows(user.tenantId,month,db);const item=items.find(i=>i.id===id);if(!item)throw new NotFoundException();
  let next:ReviewItem;try{next=submitAnswer(item,{tenantId:user.tenantId,userId:user.sub,role:user.role},revision,answer,new Date().toISOString());}catch{throw new ConflictException('回答または確認事項の状態が一致しません。再読込してください。');}
  await this.write(db,item,next,user,'MONTHLY_MANAGER_ANSWERED');return {status:next.status,revision:next.revision};
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
 async reevaluate(user:AuthenticatedUser,month:string,id:string,revision:number){this.admin(user);
  const items=await this.rows(user.tenantId,month);const item=items.find(i=>i.id===id);if(!item)throw new NotFoundException();if(item.status!=='ANSWERED_PENDING_REEVALUATION'||item.revision!==revision)throw new ConflictException('再評価対象の状態が変わりました。');
  const context=await this.contexts.build(user.tenantId,new Date(month+'-01T00:00:00Z'));
  const candidate={...item,status:'RESOLVED' as const,resolvedAt:new Date().toISOString(),revision:item.revision+1};
  let diagnostics;try{const applied=applyMonthlyAnswers(context,items.map(i=>i.id===id?candidate:i));diagnostics=validateGenerationContext(applied,'GENERATE').filter(d=>d.severity==='ERROR'&&(d.category==='SYSTEM_SAFETY_BLOCK'||d.staffId&&item.staffIds.includes(d.staffId)&&item.dates.includes(d.date)));}catch{throw new ConflictException('回答を月次条件へ安全に適用できません。出典・勤務帯・競合を確認してください。');}
  if(diagnostics.length)throw new ConflictException({message:'回答に未解決の必須条件があります。',diagnostics});
  return this.prisma.$transaction(async db=>{await this.lock(db,user.tenantId,month);const current=await this.rows(user.tenantId,month,db);if(reviewDigest(current)!==reviewDigest(items))throw new ConflictException('確認事項が更新されています。');await this.write(db,item,candidate,user,'MONTHLY_MANAGER_REEVALUATED');return {status:candidate.status,requiresDraftRegeneration:true};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 private async lock(db:Prisma.TransactionClient,tenantId:string,month:string){await db.$queryRaw`SELECT id FROM "MonthlyShift" WHERE "tenantId"=${tenantId}::uuid AND "targetMonth"=${new Date(month+'-01T00:00:00Z')} FOR UPDATE`;const schedule=await db.monthlyShift.findUnique({where:{tenantId_targetMonth:{tenantId,targetMonth:new Date(month+'-01T00:00:00Z')}}});if(schedule?.status==='CONFIRMED')throw new ConflictException('確定済みの月には回答できません。');}
 private async write(db:Prisma.TransactionClient,old:ReviewItem,next:ReviewItem,user:AuthenticatedUser,action:string){const result=await db.tenantRuleException.updateMany({where:{id:old.id,tenantId:user.tenantId,version:old.revision,isActive:true},data:{configuration:next as unknown as Prisma.InputJsonValue,version:next.revision}});if(result.count!==1)throw new ConflictException('確認事項が更新されています。');await db.auditLog.create({data:{tenantId:user.tenantId,memberId:user.sub,action,targetType:'MonthlyManagerReview',targetId:old.id,detail:{month:old.month,dates:old.dates,kind:old.kind,answer:next.answer as unknown as Prisma.InputJsonValue,answeredAt:next.answeredAt,sourceReferences:old.sourceReferences,revision:next.revision,sourceType:'MANAGER_CONFIRMED'}}});}
}
