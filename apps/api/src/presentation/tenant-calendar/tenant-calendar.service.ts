import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { RuleExceptionInputDto, TenantEventInputDto } from './tenant-calendar.dto';

@Injectable()
export class TenantCalendarService {
  constructor(private readonly prisma:PrismaService){}
  private range(month:string){const start=new Date(`${month}-01T00:00:00.000Z`);return{start,end:new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1))}}
  events(user:AuthenticatedUser,month:string){const {start,end}=this.range(month);return this.prisma.tenantEvent.findMany({where:{tenantId:user.tenantId,eventDate:{gte:start,lt:end},isActive:true},orderBy:{eventDate:'asc'}})}
  exceptions(user:AuthenticatedUser,month:string){const {start,end}=this.range(month);return this.prisma.tenantRuleException.findMany({where:{NOT:{exceptionType:{startsWith:'MANAGER_REVIEW:'}},tenantId:user.tenantId,exceptionDate:{gte:start,lt:end},isActive:true},orderBy:{exceptionDate:'asc'}})}
  async createEvent(user:AuthenticatedUser,input:TenantEventInputDto){try{return await this.prisma.tenantEvent.create({data:{tenantId:user.tenantId,eventDate:new Date(`${input.eventDate}T00:00:00.000Z`),name:input.name.trim(),eventType:input.eventType,targetClasses:input.targetClasses??[],targetStaffCodes:input.targetStaffCodes??[],allowedWorkPatternCodes:input.allowedWorkPatternCodes??[],fixedTimeStaffAllowed:input.fixedTimeStaffAllowed??true,note:input.note?.trim()||null,sourceType:input.sourceType,sourceReference:input.sourceReference?.trim()||null,confirmedAt:new Date(),confirmedBy:user.sub}})}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new ConflictException('同じ日・同じ名前の行事が登録済みです。');throw error}}
  async createException(user:AuthenticatedUser,input:RuleExceptionInputDto){
    const configuration=input.configuration;
    if(input.exceptionType==='WEEKLY_ROTATION_LIMIT'&&(typeof configuration.maxWeeklyRotationCount!=='number'||configuration.maxWeeklyRotationCount<3||configuration.maxWeeklyRotationCount>7||typeof configuration.maxAssignments!=='number'||configuration.maxAssignments<1))throw new ConflictException('この日だけ許可する週回数（3〜7回）と対象人数を入力してください。');
    if(input.exceptionType==='STAFF_WORK_PATTERN'&&(typeof configuration.staffCode!=='string'||typeof configuration.workPatternCode!=='string'))throw new ConflictException('職員と基礎勤務を指定してください。');
    if(input.exceptionType==='HARD_RULE_OVERRIDE'&&(typeof configuration.staffCode!=='string'||typeof configuration.workPatternCode!=='string'||typeof configuration.ruleType!=='string'))throw new ConflictException('職員、勤務、例外対象の条件を指定してください。');
    const staffCode=typeof configuration.staffCode==='string'?configuration.staffCode.trim():null;
    if(staffCode&&!await this.prisma.staff.findFirst({where:{tenantId:user.tenantId,employeeNumber:staffCode,isActive:true},select:{id:true}}))throw new ConflictException('指定した職員が見つかりません。');
    const patternCode=typeof configuration.workPatternCode==='string'?configuration.workPatternCode.trim():null;
    if(patternCode&&!await this.prisma.workPattern.findFirst({where:{tenantId:user.tenantId,code:patternCode,isActive:true},select:{id:true}}))throw new ConflictException('指定した勤務パターンが見つかりません。');
    const normalizedConfiguration={...configuration,originalCondition:typeof configuration.originalCondition==='string'&&configuration.originalCondition.trim()?configuration.originalCondition.trim():input.exceptionType==='WEEKLY_ROTATION_LIMIT'?'通常の週ローテーション上限':input.exceptionType==='STAFF_WORK_PATTERN'?'基礎勤務未確定':String(configuration.ruleType||'HARD業務条件'),approvedException:typeof configuration.approvedException==='string'&&configuration.approvedException.trim()?configuration.approvedException.trim():input.exceptionType==='WEEKLY_ROTATION_LIMIT'?`週${String(configuration.maxWeeklyRotationCount)}回まで・${String(configuration.maxAssignments)}名を対象日限定で許可`:input.exceptionType==='STAFF_WORK_PATTERN'?`${patternCode}を対象日の基礎勤務として指定`:`${patternCode}を対象日限定で許可`};
    const storedExceptionType=staffCode&&input.exceptionType!=='WEEKLY_ROTATION_LIMIT'?`${input.exceptionType}:${staffCode}`:input.exceptionType;
    try{return await this.prisma.tenantRuleException.create({data:{tenantId:user.tenantId,exceptionDate:new Date(`${input.exceptionDate}T00:00:00.000Z`),exceptionType:storedExceptionType,configuration:normalizedConfiguration as Prisma.InputJsonValue,reason:input.reason.trim(),sourceType:input.sourceType,sourceReference:input.sourceReference?.trim()||null,confirmedAt:new Date(),confirmedBy:user.sub,effectiveFrom:new Date(`${input.exceptionDate}T00:00:00.000Z`),effectiveTo:new Date(`${input.exceptionDate}T00:00:00.000Z`),version:input.version??1}})}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new ConflictException('この日・この職員・この種類の例外は登録済みです。');throw error}
  }
  async removeEvent(user:AuthenticatedUser,id:string){const row=await this.prisma.tenantEvent.findFirst({where:{id,tenantId:user.tenantId}});if(!row)throw new NotFoundException('行事が見つかりません。');return this.prisma.tenantEvent.update({where:{id},data:{isActive:false}})}
  async removeException(user:AuthenticatedUser,id:string){const row=await this.prisma.tenantRuleException.findFirst({where:{id,tenantId:user.tenantId}});if(!row)throw new NotFoundException('日別特例が見つかりません。');if(row.exceptionType.startsWith('MANAGER_REVIEW:'))throw new ConflictException('管理者確認事項はこの経路で削除できません。');return this.prisma.tenantRuleException.update({where:{id},data:{isActive:false}})}
}
