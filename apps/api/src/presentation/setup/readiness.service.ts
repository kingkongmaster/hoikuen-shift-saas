import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { FeaturesService } from '../features/features.service';
@Injectable()
export class ReadinessService {
  constructor(private readonly db:PrismaService, private readonly features:FeaturesService, private readonly subscriptions:SubscriptionsService){}
  async get(tenantId:string) {
    const managed=!!await this.db.auditLog.findFirst({where:{tenantId,action:'TENANT_PROVISIONED'},select:{id:true}});
    if(!managed)return {managed:false,ready:false,items:[]};
    const [tenant,staff,setting,classes,departments,patterns,rules,closed,requests,paid,settingSaved,classesSaved]=await Promise.all([
      this.db.tenant.findUniqueOrThrow({where:{id:tenantId}}),this.db.staff.count({where:{tenantId,isActive:true}}),
      this.db.tenantShiftSetting.findUnique({where:{tenantId}}),this.db.classStaffingRequirement.count({where:{tenantId,isActive:true}}),
      this.db.department.count({where:{tenantId,isActive:true}}),this.db.workPattern.count({where:{tenantId,isActive:true,isWorking:true}}),
      this.db.staffWorkRule.count({where:{tenantId,isActive:true}}),this.db.tenantClosedDate.count({where:{tenantId}}),
      this.db.shiftRequest.count({where:{tenantId}}),this.db.paidLeaveGrant.count({where:{tenantId}}),
      this.db.auditLog.count({where:{tenantId,action:'SHIFT_SETTING_UPDATED'}}),this.db.auditLog.count({where:{tenantId,action:'CLASS_REQUIREMENTS_UPDATED'}}),
    ]);
    let contract: {plan:string;status:string;trialStartedAt:Date|null;trialEndsAt:Date|null}|null=null;
    let entitled=false;try{const sub=await this.subscriptions.find(tenantId);contract={plan:sub.plan,status:sub.status,trialStartedAt:sub.trialStartedAt,trialEndsAt:sub.trialEndsAt};entitled=(await this.features.resolve(tenantId,'BASIC_SHIFT_GENERATION')).enabled;}catch{ /* unverified contract stays closed */ }
    const item=(id:string,label:string,level:string,complete:boolean,started=false)=>({id,label,level,status:complete?'COMPLETE':started?'IN_PROGRESS':'NOT_STARTED'});
    const items=[
      item('contract','契約・試用期間','HARD',entitled),item('profile','園基本情報','HARD',!!tenant.name.trim()&&!!tenant.contactEmail,!!tenant.contactEmail),
      item('classes','クラスと必要人数の確認','HARD',classes>0&&classesSaved>0,classes>0),item('staff','職員登録','HARD',staff>0),
      item('conditions','雇用・勤務条件、生成条件の確認','HARD',!!setting&&settingSaved>0,!!setting),
      item('patterns','勤務パターン','HARD',patterns>0),item('departments','部署・所属','WARNING',departments>0),
      item('fixed','固定勤務','OPTIONAL',rules>0),item('closed','休園日','WARNING',closed>0),
      item('requests','希望休の入力','OPTIONAL',requests>0),item('paid','有給の付与・初期残高','OPTIONAL',paid>0),
    ];
    return {managed,ready:items.every(i=>i.level!=='HARD'||i.status==='COMPLETE'),items,contract,legalCompletionSeparate:true};
  }
  async assertReady(tenantId:string){const state=await this.get(tenantId);if(state.managed&&!state.ready)throw new ForbiddenException({code:'ONBOARDING_REQUIRED',message:'シフト作成に必要な設定を完了してください。',items:state.items.filter(i=>i.level==='HARD'&&i.status!=='COMPLETE')});}
}
