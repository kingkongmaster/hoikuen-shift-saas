import { verifyContract, contractReadOnly, contractState, plans } from '../../domain/subscriptions/contract-policy';
export { plans } from '../../domain/subscriptions/contract-policy';
import { FEATURE_CODES, FEATURE_LABELS, resolveVerifiedFeature } from '../../domain/features/feature-catalog';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, SubscriptionPlan, SubscriptionStatus, type TenantSubscription } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types'; import { PrismaService } from '../../infrastructure/database/prisma.service'; import { AuditService } from '../audit/audit.service'; import { NotificationsService } from '../notifications/notifications.service';
@Injectable() export class SubscriptionsService { constructor(private prisma:PrismaService,private audit:AuditService,private notifications:NotificationsService){}
 async get(user:AuthenticatedUser){const subscription=await this.find(user.tenantId);const activeStaffCount=await this.prisma.staff.count({where:{tenantId:user.tenantId,isActive:true}}); await this.trialNotifications(user,subscription); return {...subscription,effectiveState:contractState(subscription),activeStaffCount,remainingStaffSlots:Math.max(0,subscription.staffLimit-activeStaffCount),features:await this.featureLabels(user.tenantId,subscription),readOnly:this.readOnly(subscription)};}
 private async featureLabels(tenantId: string, subscription: TenantSubscription) {
   if (this.readOnly(subscription)) return [];
   const overrides = await this.prisma.tenantFeature.findMany({ where: { tenantId } });
   return FEATURE_CODES.filter(code => resolveVerifiedFeature(subscription.plan, false, code, overrides.find(row => row.featureCode === code) ?? null).enabled).map(code => FEATURE_LABELS[code]);
 }
 async find(tenantId: string) {
   const sub = await this.prisma.tenantSubscription.findUnique({ where: { tenantId } });
   return this.verifySubscription(sub, tenantId);
 }
 verifySubscription(sub:TenantSubscription|null,tenantId?:string){return verifyContract(sub,tenantId);}
 readOnly(sub:{status?:unknown}|null|undefined){return contractReadOnly(sub);}
 async access(tenantId:string){
  try {const sub=await this.find(tenantId);return {plan:sub.plan,state:contractState(sub),readOnly:this.readOnly(sub),trialEndsAt:sub.trialEndsAt,currentPeriodStartedAt:sub.currentPeriodStartedAt,currentPeriodEndsAt:sub.currentPeriodEndsAt,cancelledAt:sub.cancelledAt,updatedAt:sub.updatedAt};}
  catch(error){if(error instanceof ForbiddenException)return {plan:null,state:'UNVERIFIED',readOnly:true};throw error;}
 }
 async assertWritable(tenantId:string){const sub=await this.find(tenantId);if(sub.status===SubscriptionStatus.SUSPENDED)throw new ForbiddenException({code:'SUBSCRIPTION_SUSPENDED',message:'この園の利用は停止されています。'});if(this.readOnly(sub))throw new ForbiddenException({code:'SUBSCRIPTION_EXPIRED',message:'この園の契約は利用期限を過ぎています。'});}
 async assertStaffCapacity(tenantId:string){await this.assertWritable(tenantId);const sub=await this.find(tenantId);const count=await this.prisma.staff.count({where:{tenantId,isActive:true}});if(count>=sub.staffLimit)throw new ConflictException({code:'STAFF_LIMIT_REACHED',message:'職員登録上限に達しています。'});}
 async platformList(user:AuthenticatedUser,query:any){await this.platform(user);const rows=await this.prisma.tenant.findMany({where:{...(query.q?{name:{contains:query.q,mode:'insensitive'}}:{}),...(query.plan||query.status?{subscription:{is:{...(query.plan?{plan:query.plan}:{}),...(query.status?{status:query.status}:{})}}}:{})},select:{id:true,code:true,name:true,setupStatus:true,createdAt:true,updatedAt:true,subscription:true,_count:{select:{staff:{where:{isActive:true}}}}},orderBy:{updatedAt:'desc'}});return rows.map(row=>{let effectiveState='UNVERIFIED';try{effectiveState=contractState(this.verifySubscription(row.subscription,row.id));}catch{}return {...row,effectiveState};});}
 async platformUpdate(user:AuthenticatedUser,tenantId:string,input:any){
  await this.platform(user);
  return this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${tenantId}::uuid FOR UPDATE`;
   const before=await tx.tenantSubscription.findUnique({where:{tenantId}});if(!before)throw new NotFoundException('契約情報が見つかりません。');
   const data:any={};
   if(input.plan){data.plan=input.plan;data.staffLimit=input.staffLimit??plans[input.plan as SubscriptionPlan].staffLimit;}
   if(input.status){data.status=input.status;data.suspendedAt=input.status==='SUSPENDED'?new Date():null;data.suspensionReason=input.status==='SUSPENDED'?(input.reason?.trim()||input.suspensionReason):null;}
   if(input.staffLimit!==undefined){if(!input.reason?.trim()||!input.staffLimitSource)throw new BadRequestException('職員上限の変更には理由と設定元が必要です。');data.staffLimit=input.staffLimit;}
   for(const field of ['currentPeriodStartedAt','currentPeriodEndsAt'])if(input[field]!==undefined)data[field]=new Date(input[field]);
   if(input.extendTrialDays){if(before.plan!=='TRIAL')throw new BadRequestException('試用契約のみ延長できます。');data.status='TRIAL';data.trialStartedAt=before.trialStartedAt??new Date();data.trialEndsAt=new Date(Math.max(Date.now(),before.trialEndsAt?.getTime()??0)+input.extendTrialDays*86400000);}
   const nextPlan=data.plan??before.plan;
   if(input.plan&&input.plan!==before.plan&&input.plan==='TRIAL')throw new BadRequestException('有料契約から試用へは変更できません。');
   const activating=nextPlan!=='TRIAL'&&(input.plan&&input.plan!==before.plan||input.status==='ACTIVE'||input.currentPeriodEndsAt!==undefined||input.currentPeriodStartedAt!==undefined);
   if(activating&&!input.confirmationReference?.trim())throw new BadRequestException('契約確認の参照情報が必要です。決済や契約の確認なしに有効化できません。');
   if(input.status==='SUSPENDED'&&!data.suspensionReason?.trim())throw new BadRequestException('利用停止の理由が必要です。');
   if(input.cancelAtPeriodEnd!==undefined){data.cancelledAt=input.cancelAtPeriodEnd?(nextPlan==='TRIAL'?(data.trialEndsAt??before.trialEndsAt):(data.currentPeriodEndsAt??before.currentPeriodEndsAt)):null;data.cancellationReason=input.cancelAtPeriodEnd?input.reason?.trim():null;if(input.cancelAtPeriodEnd&&!data.cancellationReason)throw new BadRequestException('解約理由が必要です。');}
   if(input.status==='CANCELLED'){if(!input.reason?.trim())throw new BadRequestException('解約理由が必要です。');data.cancelledAt=new Date();data.cancellationReason=input.reason.trim();}
   let verified:TenantSubscription;try{verified=this.verifySubscription({...before,...data},tenantId);}catch{throw new BadRequestException('契約状態・上限・有効期間の組合せが不正です。');}
   if(input.status==='ACTIVE'&&verified.status!=='ACTIVE')throw new BadRequestException('有効な契約期間と解約予定の解除を確認してください。');
   const updated=await tx.tenantSubscription.update({where:{tenantId},data});
   const action=input.staffLimit!==undefined&&input.staffLimit!==before.staffLimit?'STAFF_LIMIT_OVERRIDE_UPDATED':input.extendTrialDays?'TRIAL_EXTENDED':input.status==='SUSPENDED'?'TENANT_SUSPENDED':input.status==='ACTIVE'&&before.status==='SUSPENDED'?'TENANT_REACTIVATED':input.plan?'PLAN_CHANGED':'SUBSCRIPTION_UPDATED';
   await tx.auditLog.create({data:{tenantId,memberId:user.sub,action,targetType:'TenantSubscription',targetId:updated.id,detail:{before:{plan:before.plan,status:before.status,staffLimit:before.staffLimit,currentPeriodEndsAt:before.currentPeriodEndsAt?.toISOString()},after:{plan:updated.plan,status:updated.status,staffLimit:updated.staffLimit,currentPeriodEndsAt:updated.currentPeriodEndsAt?.toISOString(),cancelledAt:updated.cancelledAt?.toISOString()},reason:input.reason??null,source:input.staffLimitSource??null,confirmationReference:input.confirmationReference??null}}});
   return updated;
  });
 }
 async requestCancellation(user:AuthenticatedUser,reason:string){
  if(user.role!=='ADMIN')throw new ForbiddenException();
  if(!reason?.trim())throw new BadRequestException('解約理由を入力してください。');
  return this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${user.tenantId}::uuid FOR UPDATE`;
   const before=this.verifySubscription(await tx.tenantSubscription.findUnique({where:{tenantId:user.tenantId}}),user.tenantId);
   if(this.readOnly(before))throw new ConflictException('現在の契約は解約予約を受け付けられません。');
   const end=before.plan==='TRIAL'?before.trialEndsAt:before.currentPeriodEndsAt;
   const updated=await tx.tenantSubscription.update({where:{tenantId:user.tenantId},data:{cancelledAt:end,cancellationReason:reason.trim()}});
   await tx.auditLog.create({data:{tenantId:user.tenantId,memberId:user.sub,action:'CANCELLATION_REQUESTED',targetType:'TenantSubscription',targetId:updated.id,detail:{endsAt:end!.toISOString(),reason:reason.trim()}}});return updated;
  });
 }
 private async platform(user:AuthenticatedUser){const u=await this.prisma.user.findUnique({where:{id:user.sub},select:{isPlatformAdmin:true}});if(!u?.isPlatformAdmin)throw new ForbiddenException('プラットフォーム管理者専用です。');}
 private async trialNotifications(user:AuthenticatedUser,sub:any){if(sub.status!==SubscriptionStatus.TRIAL||!sub.trialEndsAt)return;const days=Math.ceil((sub.trialEndsAt.getTime()-Date.now())/86400000);if(![0,3,7].includes(days))return;const existing=await this.prisma.notification.findFirst({where:{tenantId:user.tenantId,type:NotificationType.SYSTEM,title:`試用終了${days}日前`}});if(!existing)await this.notifications.notifyRoles(user.tenantId,['ADMIN','DIRECTOR'],NotificationType.SYSTEM,`試用終了${days}日前`,'契約状況をご確認ください。');}
}
