import * as assert from 'node:assert/strict';
import { ShiftRequestStatus, ShiftRequestType } from '@prisma/client';
import { classifyGenerationDiagnostic, validateGenerationContext, validateWeeklyRotationLimits } from '../src/application/shifts/generation-preflight-validator';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const base = () => ({
  tenantId: 'tenant', targetMonth: date('2026-10-01'), range: { start: date('2026-10-01'), end: date('2026-11-01') }, tenant: { id: 'tenant', name: 'test' }, shiftSetting: { sundayOperationEnabled: false },
  staff: [{ id: 'staff', userId: null, employeeNumber: 'S001', displayName: '試験職員S001', assignedClass: 'AGE_0', employmentType: 'FULL_TIME', canWorkEarly: true, canWorkRegular: true, canWorkLate: true, earlyShiftOnly: false, lateShiftOnly: false, canWorkSaturdays: true, monthlyWorkHourLimit: null, monthlyTargetWorkDays: null, monthlyTargetWorkHours: null, weeklyAvailableDays: 5, regularWorkStartTime: null, regularWorkEndTime: null, isActive: true }],
  workPatterns: [], contracts: [], workRules: [], staffingRequirements: [], conditionalStaffingRequirements: [], requests: [], approvedRequests: [], pendingRequests: [], paidLeaveGrants: [], paidLeaveUsages: [], closedDates: [], events: [], ruleExceptions: [], attributes: [], directorMemberships: [], priorAssignments: [], confirmedAssignments: [], assignments: [], weekBoundaryAssignments: [], fixedStaffIds: new Set<string>(), excludedStaffIds: new Set<string>(),
  features: { ADVANCED_STAFFING_REQUIREMENTS: { enabled: false, lookupFailed: false, configuration: {} }, STAFF_WORK_RULES: { enabled: false, lookupFailed: false, configuration: {} }, TENANT_CUSTOM_RULES: { enabled: true, lookupFailed: false, configuration: {} } },
});

{
  const context: any = base(); const pending = { id: 'pending', staffId: 'staff', requestDate: date('2026-10-05'), requestType: ShiftRequestType.DAY_OFF, status: ShiftRequestStatus.PENDING, reason: null }; context.requests = [pending]; context.pendingRequests = [pending];
  const diagnostics = validateGenerationContext(context, 'PRECHECK');
  assert.equal(diagnostics.some((row) => row.code === 'PENDING_REQUEST_REVIEW' && row.severity === 'INFO'), true);
  assert.equal(diagnostics.some((row) => row.severity === 'ERROR'), false);
}

{
  const context: any = base(); const request = { id: 'half', staffId: 'staff', requestDate: date('2026-10-06'), requestType: ShiftRequestType.HALF_DAY_PM, status: ShiftRequestStatus.APPROVED, reason: null }; context.requests = [request]; context.approvedRequests = [request];
  const diagnostics = validateGenerationContext(context, 'GENERATE');
  assert.equal(diagnostics.some((row) => row.code === 'HALF_DAY_BASE_ASSIGNMENT_UNCONFIRMED' && row.severity === 'ERROR' && row.category === 'BUSINESS_DECISION_REQUIRED' && row.overrideAllowed), true);
}

{
  const context: any = base(); context.fixedStaffIds.add('staff');
  const diagnostics = validateGenerationContext(context, 'PRECHECK');
  assert.equal(diagnostics.some((row) => row.code === 'FIXED_GENERATOR_DOUBLE_HANDLING'), true);
  assert.equal(diagnostics.some((row) => row.code === 'FIXED_CONTRACT_UNRESOLVED'), true);
}

{
  const context: any = base(); context.features.TENANT_CUSTOM_RULES.lookupFailed = true;
  const diagnostics = validateGenerationContext(context, 'PRECHECK');
  assert.equal(diagnostics.some((row) => row.code === 'FEATURE_LOOKUP_FAILED' && row.severity === 'ERROR'), true);
  assert.equal(diagnostics.some((row) => row.code === 'FEATURE_LOOKUP_FAILED' && row.category === 'SYSTEM_SAFETY_BLOCK' && !row.overrideAllowed && row.allowedActions.every((action) => !action.includes('承認'))), true);
}

{
  const context:any=base(); context.ruleExceptions=[{id:'broken',exceptionDate:date('2026-10-08'),exceptionType:'HARD_RULE_OVERRIDE:S001',configuration:{staffCode:'S001',workPatternCode:'NORMAL'},reason:'',sourceType:'UNCONFIRMED',confirmedAt:null,confirmedBy:null,effectiveFrom:date('2026-10-08'),effectiveTo:date('2026-10-08')}];
  const diagnostics=validateGenerationContext(context,'CONFIRM');
  assert.equal(diagnostics.some((row)=>row.code==='INVALID_EXCEPTION_PROVENANCE'&&row.category==='SYSTEM_SAFETY_BLOCK'&&!row.overrideAllowed),true);
}

console.log('generation preflight validator tests: PASS');

{
  const context: any = base(); context.fixedStaffIds.add('staff'); context.excludedStaffIds.add('staff');
  context.staff[0].regularWorkStartTime = '08:30'; context.staff[0].regularWorkEndTime = '17:00';
  context.workRules = [{ id: 'approved-time', staffId: 'staff', ruleType: 'AVAILABLE_TIME_RANGE', dayOfWeek: null, startDate: null, endDate: null,
    startTime: '08:30', endTime: '17:00', isHardConstraint: true, sourceType: 'FORMAL_SOURCE_PACKAGE',
    sourceReference: JSON.stringify({sourceId:'MUSUBI-2026-031',locator:'approved fixed time',approvalStatus:'APPROVED',decisionActorType:'RECORDED_ADMIN_ANSWER'}) }];
  const unresolved = () => validateGenerationContext(context,'GENERATE').some(row=>row.code==='FIXED_CONTRACT_UNRESOLVED');
  assert.equal(unresolved(),false,'no annual contract needed with approved times');
  context.contracts = [{staffId:'staff',voidedAt:null},{staffId:'staff',voidedAt:null}];
  assert.equal(unresolved(),true,'source fallback cannot bypass multiple existing contracts');
  context.contracts = [{staffId:'staff',voidedAt:null}]; context.workRules=[];
  assert.equal(unresolved(),false,'existing single-contract path retained');
  context.contracts = []; assert.equal(unresolved(),true,'missing both sources must block');
  context.features.TENANT_CUSTOM_RULES.configuration = {release1ProvisionalSoftRules:[{staffCode:'S999'}]};
  assert.equal(validateGenerationContext(context,'PRECHECK').some(row=>row.code==='INVALID_PROVISIONAL_SOFT_RULE'&&!row.overrideAllowed),true);
}

{
  const diagnostic=classifyGenerationDiagnostic({severity:'ERROR',code:'GENERATION_CONTEXT_UNAVAILABLE',staffId:null,date:'2026-10-01',source:'MonthlyGenerationContext',reason:'取得不能',allowedActions:['DBを確認する']});
  assert.equal(diagnostic.category,'SYSTEM_SAFETY_BLOCK'); assert.equal(diagnostic.overrideAllowed,false); assert.equal(diagnostic.allowedActions.some((action)=>action.includes('承認')),false);
}

const weekly = (dates: string[], { exceptionDate, exceptionMaximum = 3, excluded = false, fixed = false }:{ exceptionDate?:string; exceptionMaximum?:number; excluded?:boolean; fixed?:boolean }={}) => {
  const context:any=base(); const pattern={id:'early',code:'EARLY'};
  context.features.TENANT_CUSTOM_RULES.configuration={weeklyPatternGroupLimit:{patternCodes:['EARLY','P02','P03','P04','P05','LATE'],maxPerWeek:1,exemptAttributeCode:'WEEKLY_PATTERN_GROUP_LIMIT_EXEMPT',relaxation:{enabled:true,maxPerWeek:2,activationMode:'FORMAL'}}};
  context.weekBoundaryAssignments=dates.map((value,index)=>({id:`a${index}`,staffId:'staff',workDate:date(value),shiftType:'EARLY',workPatternId:'early',workPattern:pattern}));
  if(excluded)context.excludedStaffIds.add('staff'); if(fixed)context.fixedStaffIds.add('staff');
  if(exceptionDate)context.ruleExceptions=[{id:'exception',exceptionDate:date(exceptionDate),exceptionType:'WEEKLY_ROTATION_LIMIT',configuration:{maxWeeklyRotationCount:exceptionMaximum,maxAssignments:1},reason:'管理者確認',sourceType:'ADMIN_CONFIRMED',confirmedAt:date(exceptionDate),confirmedBy:'admin',effectiveFrom:null,effectiveTo:null}];
  return validateWeeklyRotationLimits(context);
};

assert.equal(weekly(['2026-10-05','2026-10-11']).length,0,'A/F Monday-Sunday normal maximum');
assert.equal(weekly(['2026-10-05','2026-10-08','2026-10-11']).some(row=>row.code==='WEEKLY_ROTATION_LIMIT_UNAPPROVED'),true,'B manual third blocks');
assert.equal(weekly(['2026-10-05','2026-10-08','2026-10-11'],{exceptionDate:'2026-10-11'}).length,0,'C approved dated third passes');
assert.equal(weekly(['2026-10-05','2026-10-07','2026-10-09','2026-10-11'],{exceptionDate:'2026-10-09'}).some(row=>row.code==='WEEKLY_ROTATION_WEEK4_PLUS'),true,'D week4+ always blocks');
assert.equal(weekly(['2026-10-05','2026-10-07','2026-10-09','2026-10-11'],{exceptionDate:'2026-10-09',exceptionMaximum:4}).length,0,'D2 explicit dated admin decision can approve week4 without changing permanent rule');
assert.equal(weekly(['2026-10-05','2026-10-08','2026-10-11'],{excluded:true}).length,0,'E excluded ignored');
assert.equal(weekly(['2026-10-05','2026-10-08','2026-10-11'],{fixed:true}).length,0,'E fixed ignored');
assert.equal(weekly(['2026-10-04','2026-10-05','2026-10-11']).length,0,'F Sunday and next Monday use different weeks');
assert.equal(weekly(['2026-09-28','2026-09-30','2026-10-02']).some(row=>row.code==='WEEKLY_ROTATION_LIMIT_UNAPPROVED'),true,'G month boundary is one week');
console.log('weekly rotation confirm validator tests: PASS');
