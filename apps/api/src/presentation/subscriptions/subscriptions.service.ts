import { FEATURE_CODES, FEATURE_LABELS, resolveVerifiedFeature } from '../../domain/features/feature-catalog';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, SubscriptionPlan, SubscriptionStatus, type TenantSubscription } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types'; import { PrismaService } from '../../infrastructure/database/prisma.service'; import { AuditService } from '../audit/audit.service'; import { NotificationsService } from '../notifications/notifications.service';
export const plans: Record<SubscriptionPlan,{staffLimit:number}>={TRIAL:{staffLimit:20},STANDARD:{staffLimit:50},PROFESSIONAL:{staffLimit:200}};
@Injectable() export class SubscriptionsService { constructor(private prisma:PrismaService,private audit:AuditService,private notifications:NotificationsService){}
 async get(user:AuthenticatedUser){const subscription=await this.find(user.tenantId);const activeStaffCount=await this.prisma.staff.count({where:{tenantId:user.tenantId,isActive:true}}); await this.trialNotifications(user,subscription); return {...subscription,activeStaffCount,remainingStaffSlots:Math.max(0,subscription.staffLimit-activeStaffCount),features:await this.featureLabels(user.tenantId,subscription),readOnly:this.readOnly(subscription)};}
 private async featureLabels(tenantId: string, subscription: TenantSubscription) {
   if (this.readOnly(subscription)) return [];
   const overrides = await this.prisma.tenantFeature.findMany({ where: { tenantId } });
   return FEATURE_CODES.filter(code => resolveVerifiedFeature(subscription.plan, false, code, overrides.find(row => row.featureCode === code) ?? null).enabled).map(code => FEATURE_LABELS[code]);
 }
 async find(tenantId: string) {
   const sub = await this.prisma.tenantSubscription.findUnique({ where: { tenantId } });
   return this.verifySubscription(sub);
 }
 verifySubscription(sub: TenantSubscription | null) {
   // A missing contract must never become an implicit paid entitlement.
   if (!sub || !Object.prototype.hasOwnProperty.call(plans, sub.plan) || !Object.values(SubscriptionStatus).includes(sub.status)) {
     throw new ForbiddenException({ code: 'SUBSCRIPTION_UNVERIFIED', message: '契約情報を確認できません。運営窓口へお問い合わせください。' });
   }
   if (!Number.isInteger(sub.staffLimit) || sub.staffLimit < 1 || sub.staffLimit > 1000
       || (sub.plan === SubscriptionPlan.TRIAL && ![SubscriptionStatus.TRIAL, SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELLED, SubscriptionStatus.SUSPENDED].some(status => status === sub.status))) {
     throw new ForbiddenException({ code: 'SUBSCRIPTION_UNVERIFIED', message: '契約情報を確認できません。運営窓口へお問い合わせください。' });
   }
   const now = new Date();
   for (const [start, end] of [[sub.trialStartedAt, sub.trialEndsAt], [sub.currentPeriodStartedAt, sub.currentPeriodEndsAt]]) {
     if ((start && !Number.isFinite(start.getTime())) || (end && !Number.isFinite(end.getTime())) || (start && end && start >= end)) {
       throw new ForbiddenException({ code: 'SUBSCRIPTION_UNVERIFIED', message: '契約期間を確認できません。' });
     }
   }
   if (sub.currentPeriodStartedAt && sub.currentPeriodStartedAt > now && sub.status !== SubscriptionStatus.TRIAL) {
     throw new ForbiddenException({ code: 'SUBSCRIPTION_UNVERIFIED', message: '契約期間が開始していません。' });
   }
   if (sub.status === SubscriptionStatus.TRIAL) {
     if (!sub.trialEndsAt || !Number.isFinite(sub.trialEndsAt.getTime()) || (sub.trialStartedAt && sub.trialStartedAt > now)) {
       throw new ForbiddenException({ code: 'SUBSCRIPTION_UNVERIFIED', message: '試用期限を確認できません。運営窓口へお問い合わせください。' });
     }
     if (sub.trialEndsAt <= new Date()) return { ...sub, status: SubscriptionStatus.EXPIRED };
   }
   if (sub.status !== SubscriptionStatus.TRIAL && sub.currentPeriodEndsAt && sub.currentPeriodEndsAt <= now) return { ...sub, status: SubscriptionStatus.EXPIRED };
   return sub;
 }
 readOnly(sub: { status?: unknown } | null | undefined) {
   // PAST_DUE is an explicit known state; its existing grace policy is unchanged.
   return !sub || ![SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE].some(status => status === sub.status);
 }
 async assertWritable(tenantId:string){const sub=await this.find(tenantId);if(sub.status===SubscriptionStatus.SUSPENDED)throw new ForbiddenException({code:'SUBSCRIPTION_SUSPENDED',message:'この園の利用は停止されています。'});if(this.readOnly(sub))throw new ForbiddenException({code:'SUBSCRIPTION_EXPIRED',message:'この園の契約は利用期限を過ぎています。'});}
 async assertStaffCapacity(tenantId:string){const sub=await this.find(tenantId);const count=await this.prisma.staff.count({where:{tenantId,isActive:true}});if(count>=sub.staffLimit)throw new ConflictException({code:'STAFF_LIMIT_REACHED',message:'職員登録上限に達しています。'});}
 async platformList(user:AuthenticatedUser,query:any){await this.platform(user);return this.prisma.tenant.findMany({where:{...(query.q?{name:{contains:query.q,mode:'insensitive'}}:{}),...(query.plan||query.status?{subscription:{is:{...(query.plan?{plan:query.plan}:{}),...(query.status?{status:query.status}:{})}}}:{})},select:{id:true,code:true,name:true,setupStatus:true,createdAt:true,updatedAt:true,subscription:true,_count:{select:{staff:{where:{isActive:true}}}}},orderBy:{updatedAt:'desc'}});}
 async platformUpdate(user:AuthenticatedUser,tenantId:string,input:any){await this.platform(user);const before=await this.prisma.tenantSubscription.findUnique({where:{tenantId}});if(!before)throw new NotFoundException('SUBSCRIPTION_NOT_FOUND');const staffLimitChanged=input.staffLimit!==undefined&&input.staffLimit!==before.staffLimit;if(staffLimitChanged&&(!input.reason?.trim()||!input.staffLimitSource))throw new BadRequestException('職員上限の個別変更には理由と設定元が必要です。');const data:any={};if(input.plan){const plan=input.plan as SubscriptionPlan;data.plan=plan;data.staffLimit=input.staffLimit??plans[plan].staffLimit;}if(input.status){data.status=input.status;data.suspensionReason=input.suspensionReason??null;data.suspendedAt=input.status===SubscriptionStatus.SUSPENDED?new Date():null;}if(input.staffLimit!==undefined)data.staffLimit=input.staffLimit;if(input.extendTrialDays){data.status=SubscriptionStatus.TRIAL;data.trialEndsAt=new Date(Date.now()+input.extendTrialDays*86400000);}try { this.verifySubscription({...before,...data}); } catch { throw new BadRequestException('契約状態・上限・有効期間の組合せが不正です。'); }const updated=await this.prisma.tenantSubscription.update({where:{tenantId},data});const action=staffLimitChanged?'STAFF_LIMIT_OVERRIDE_UPDATED':input.extendTrialDays?'TRIAL_EXTENDED':input.status===SubscriptionStatus.SUSPENDED?'TENANT_SUSPENDED':input.status===SubscriptionStatus.ACTIVE&&before.status===SubscriptionStatus.SUSPENDED?'TENANT_REACTIVATED':input.plan?'PLAN_CHANGED':'SUBSCRIPTION_UPDATED';await this.audit.create(tenantId,user.sub,action,'TenantSubscription',updated.id,{before:{plan:before.plan,status:before.status,staffLimit:before.staffLimit},after:{plan:updated.plan,status:updated.status,staffLimit:updated.staffLimit},...(staffLimitChanged?{reason:input.reason.trim(),source:input.staffLimitSource}:{})});return updated;}
 private async platform(user:AuthenticatedUser){const u=await this.prisma.user.findUnique({where:{id:user.sub},select:{isPlatformAdmin:true}});if(!u?.isPlatformAdmin)throw new ForbiddenException('プラットフォーム管理者専用です。');}
 private async trialNotifications(user:AuthenticatedUser,sub:any){if(sub.status!==SubscriptionStatus.TRIAL||!sub.trialEndsAt)return;const days=Math.ceil((sub.trialEndsAt.getTime()-Date.now())/86400000);if(![0,3,7].includes(days))return;const existing=await this.prisma.notification.findFirst({where:{tenantId:user.tenantId,type:NotificationType.SYSTEM,title:`試用終了${days}日前`}});if(!existing)await this.notifications.notifyRoles(user.tenantId,['ADMIN','DIRECTOR'],NotificationType.SYSTEM,`試用終了${days}日前`,'契約状況をご確認ください。');}
}
