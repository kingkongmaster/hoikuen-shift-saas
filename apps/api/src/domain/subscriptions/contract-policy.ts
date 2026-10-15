import { ForbiddenException } from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus, type TenantSubscription } from '@prisma/client';

export const plans: Record<SubscriptionPlan, {staffLimit:number}> = {TRIAL:{staffLimit:20},STANDARD:{staffLimit:50},PROFESSIONAL:{staffLimit:200}};
export function verifyContract(sub: TenantSubscription | null, tenantId?: string, now = new Date()): TenantSubscription {
 const reject = (): never => { throw new ForbiddenException({code:'SUBSCRIPTION_UNVERIFIED',message:'契約情報を確認できません。運営窓口へお問い合わせください。'}); };
 if(!sub || (tenantId && sub.tenantId!==tenantId) || !Object.prototype.hasOwnProperty.call(plans,sub.plan) || !Object.values(SubscriptionStatus).includes(sub.status))return reject();
 if(!Number.isInteger(sub.staffLimit)||sub.staffLimit<1||sub.staffLimit>1000)return reject();
 if((sub.plan==='TRIAL'&&['ACTIVE','PAST_DUE'].includes(sub.status))||(sub.plan!=='TRIAL'&&sub.status==='TRIAL'))return reject();
 const valid=(d:Date|null)=>d instanceof Date&&Number.isFinite(d.getTime());
 for(const [start,end] of [[sub.trialStartedAt,sub.trialEndsAt],[sub.currentPeriodStartedAt,sub.currentPeriodEndsAt]]){
  if((start!=null&&!valid(start))||(end!=null&&!valid(end))||(start&&end&&start>=end))return reject();
 }
 if(sub.cancelledAt!=null&&!valid(sub.cancelledAt))return reject();
 const start=sub.plan==='TRIAL'?sub.trialStartedAt:sub.currentPeriodStartedAt;
 const end=sub.plan==='TRIAL'?sub.trialEndsAt:sub.currentPeriodEndsAt;
 if(!valid(start)||!valid(end)||start!>=end!||start!>now)return reject();
 if(sub.cancelledAt&&sub.cancelledAt>end!)return reject();
 // An operational suspension never disappears merely because a period elapses.
 if(sub.status==='SUSPENDED'||sub.status==='CANCELLED')return sub;
 if(sub.cancelledAt&&sub.cancelledAt<=now)return {...sub,status:SubscriptionStatus.CANCELLED};
 if(end!<=now)return {...sub,status:SubscriptionStatus.EXPIRED};
 return sub;
}
export function contractReadOnly(sub:{status?:unknown}|null|undefined){return !sub||!['TRIAL','ACTIVE'].includes(String(sub.status));}
export function contractState(sub:TenantSubscription){return !contractReadOnly(sub)&&sub.cancelledAt?'CANCELLATION_SCHEDULED':sub.status;}
