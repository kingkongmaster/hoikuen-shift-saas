import { ShiftRequestStatus, ShiftRequestType, StaffWorkRuleType } from '@prisma/client';
import type { MonthlyGenerationContext } from '../shifts/monthly-generation-context-builder';
import { validateItem, type ReviewItem, type MonthlyEffect } from './resolution';
const iso=(date:Date)=>date.toISOString().slice(0,10);
/** Overlay date-scoped manager decisions; never mutate permanent DB rules. */
export function applyMonthlyAnswers(input: MonthlyGenerationContext, items: ReviewItem[]): MonthlyGenerationContext {
  const context={...input,requests:[...input.requests],approvedRequests:[...input.approvedRequests],workRules:[...input.workRules],events:input.events.map(e=>({...e})),ruleExceptions:input.ruleExceptions.filter(e=>!e.exceptionType.startsWith('MANAGER_REVIEW:'))};
  for(const item of items.filter(i=>i.status==='RESOLVED')) {
    validateItem(item);
    if(item.tenantId!==context.tenantId||item.month!==iso(context.range.start).slice(0,7)||!item.answer||!item.answeredBy||!item.answeredAt)throw Error('INVALID_CONFIRMED_REVIEW');
    const effects=item.optionEffects?.[item.answer.option];
    if(!effects?.length)throw Error('ANSWER_EFFECT_UNDEFINED');
    for(const staffId of item.staffIds) {
      const staff=context.staff.find(s=>s.id===staffId);if(!staff)throw Error('REVIEW_STAFF_OUTSIDE_TENANT');
      for(const date of item.dates) for(const original of effects) {
        const effect:MonthlyEffect={...original};const day=new Date(date+'T00:00:00Z');
        if(effect.type==='REMOVE_EVENT_TARGET') {
          const index=context.events.findIndex(e=>e.id===effect.eventId&&iso(e.eventDate)===date);if(index<0)throw Error('REVIEW_EVENT_OUTSIDE_SCOPE');
          const event=context.events[index];
          if(!Array.isArray(event.targetStaffCodes)||!event.targetStaffCodes.includes(staff.employeeNumber)||Array.isArray(event.targetClasses)&&event.targetClasses.length)throw Error('EVENT_SCOPE_REQUIRES_EXPLICIT_REVIEW');
          const codes=event.targetStaffCodes.filter(c=>c!==staff.employeeNumber);
          context.events[index]={...event,targetStaffCodes:codes,affectsGeneration:codes.length>0};continue;
        }
        if(effect.type==='REQUEST'||effect.type==='NO_WORK') {
          const requestType=effect.type==='NO_WORK'?ShiftRequestType.DAY_OFF:effect.requestType;
          if(!Object.values(ShiftRequestType).includes(requestType))throw Error('INVALID_REQUEST_EFFECT');
          const existing=context.approvedRequests.filter(r=>r.staffId===staffId&&iso(r.requestDate)===date);
          if(existing.some(r=>r.requestType!==requestType))throw Error('MONTHLY_REQUEST_CONFLICT');
          if(!existing.length) {const row={id:`review:${item.id}:${date}`,tenantId:item.tenantId,staffId,requestDate:day,requestType,status:ShiftRequestStatus.APPROVED,reason:'管理者確認済み月次条件',adminComment:JSON.stringify({sourceType:'MANAGER_CONFIRMED',reviewId:item.id,sourceReferences:item.sourceReferences}),createdAt:new Date(item.answeredAt),updatedAt:new Date(item.answeredAt)};context.requests.push(row);context.approvedRequests.push(row);}continue;
        }
        if(effect.type!=='PATTERN'&&effect.type!=='TIME')throw Error('INVALID_MONTHLY_EFFECT');
        if(!context.features.STAFF_WORK_RULES.enabled||context.fixedStaffIds.has(staffId))throw Error('MONTHLY_PATTERN_APPLICATION_UNSUPPORTED');
        const code=effect.type==='PATTERN'?effect.code:effect.basePatternCode;
        const base=context.workPatterns.find(p=>p.code===code&&p.isActive&&p.isWorking);if(!base)throw Error('INVALID_REVIEW_PATTERN');
        const pattern={...base};
        if(effect.type==='TIME') {pattern.startTime=item.answer.startTime??effect.startTime;pattern.endTime=item.answer.time??item.answer.endTime??effect.endTime;}
        else {pattern.startTime=effect.startTime??base.startTime;pattern.endTime=effect.endTime??base.endTime;}
        if(!pattern.startTime||!pattern.endTime||!/^([01]\d|2[0-3]):[0-5]\d$/.test(pattern.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(pattern.endTime)||pattern.startTime>=pattern.endTime)throw Error('INVALID_REVIEW_HOURS');
        const dated=context.workRules.filter(r=>r.staffId===staffId&&r.ruleType==='FIXED_WORK_PATTERN'&&(!r.startDate||r.startDate<=day)&&(!r.endDate||r.endDate>=day)&&(r.dayOfWeek==null||r.dayOfWeek===day.getUTCDay()));
        if(dated.some(r=>r.workPattern?.id!==base.id))throw Error('MONTHLY_FIXED_CONFLICT');
        context.workRules.unshift({id:`review:${item.id}:${date}`,sourceType:'MANAGER_CONFIRMED',sourceReference:item.sourceReferences.join('|'),staffId,ruleType:StaffWorkRuleType.FIXED_WORK_PATTERN,dayOfWeek:null,startDate:day,endDate:day,startTime:pattern.startTime,endTime:pattern.endTime,numericValue:null,priority:-1,isHardConstraint:true,workPattern:pattern});
      }
    }
  }
  return context;
}
/** Final validation binds resolved answers to actual persisted assignments, not only JSON status. */
export function validateAnswerAssignments(context:MonthlyGenerationContext,items:ReviewItem[]) {
 const problems:string[]=[];
 for(const item of items){if(item.status!=='RESOLVED'||!item.answer){problems.push('MANAGER_REVIEW_OPEN');continue;}
 const effects=item.optionEffects?.[item.answer.option];if(!effects?.length){problems.push('ANSWER_EFFECT_UNDEFINED');continue;}
 for(const staffId of item.staffIds)for(const date of item.dates){const assignment=context.assignments.find(a=>a.staffId===staffId&&iso(a.workDate)===date);if(!assignment){problems.push('ANSWER_ASSIGNMENT_MISSING');continue;}
 for(const effect of effects){
 if(effect.type==='PATTERN'||effect.type==='TIME'){
 const code=effect.type==='PATTERN'?effect.code:effect.basePatternCode;const pattern=context.workPatterns.find(p=>p.code===code);
 const start=effect.type==='TIME'?(item.answer.startTime??effect.startTime):(effect.startTime??pattern?.startTime);
 const end=effect.type==='TIME'?(item.answer.time??item.answer.endTime??effect.endTime):(effect.endTime??pattern?.endTime);
 if(assignment.workPatternId!==pattern?.id||assignment.startTime!==start||assignment.endTime!==end)problems.push('ANSWER_ASSIGNMENT_MISMATCH');
 }else if(effect.type==='NO_WORK'){if(assignment.shiftType!=='OFF')problems.push('ANSWER_ASSIGNMENT_MISMATCH');}
 else if(effect.type==='REQUEST'){
 const expected:Record<string,string>={DAY_OFF:'OFF',PAID_LEAVE:'PAID_LEAVE',SUMMER_LEAVE:'SUMMER_LEAVE',BEREAVEMENT:'OFF'};
 if(effect.requestType==='HALF_DAY_AM'||effect.requestType==='HALF_DAY_PM'){if(assignment.attendanceModifier?.modifierType!==(effect.requestType==='HALF_DAY_AM'?'AM_PAID_LEAVE':'PM_PAID_LEAVE'))problems.push('ANSWER_HALF_DAY_MISSING');}
 else if(assignment.shiftType!==expected[effect.requestType])problems.push('ANSWER_ASSIGNMENT_MISMATCH');
 }
 }
 }}return [...new Set(problems)];
}
