// Runs after Phase3 onboarding in the same explicitly isolated, anonymous DB.
const assert=require('node:assert/strict');
module.exports=async({call,db,tenants,operator,password,origin,operatorLogin,run,uids})=>{
 const {FEATURE_CODES,FEATURE_LABELS}=require('../dist/domain/features/feature-catalog');
 const [a,b]=tenants;const now=Date.now(),start=new Date(now-86400000).toISOString(),end=new Date(now+30*86400000).toISOString();
 const update=(t,data,status=200)=>call(operator,'PATCH',`/platform/tenants/${t.id}/subscription`,data,status);
 const paid=(plan)=>({plan,status:'ACTIVE',currentPeriodStartedAt:start,currentPeriodEndsAt:end,confirmationReference:'ANONYMOUS-SIMULATED-CONTRACT',cancelAtPeriodEnd:false,reason:'匿名の契約運用検証'});
 const original=await db.tenantSubscription.findUnique({where:{tenantId:a.id}});
 assert.equal(original.plan,'TRIAL');assert.equal(original.trialEndsAt-original.trialStartedAt,30*86400000);
 await db.tenantFeature.deleteMany({where:{tenantId:{in:tenants.map(t=>t.id)}}});
 let checks=0;
 async function matrix(t,plan,state,writable,unverified=false){
  const access=await call(t.token,'GET','/subscription/access');assert.equal(access.state,state);assert.equal(access.readOnly,!writable);
  const features=await call(t.token,'GET','/features',undefined,unverified?403:200);
  const sub=await call(t.token,'GET','/subscription',undefined,unverified?403:200);
  if(!unverified){const expected=writable?FEATURE_CODES.filter(c=>c==='BASIC_SHIFT_GENERATION'||(plan==='PROFESSIONAL'&&c!=='TENANT_CUSTOM_RULES')):[];assert.deepEqual(features.enabledFeatures,expected);assert.deepEqual(sub.features,expected.map(c=>FEATURE_LABELS[c]));}
  // Genuine guarded write endpoints: valid payload succeeds only with entitlement.
  if(!writable)await call(t.token,'GET','/staff',undefined,403);
  const advanced=writable&&plan==='PROFESSIONAL';
  const rule=await call(t.token,'POST',`/staff/${t.staff[0].id}/work-rules`,{ruleType:'MAX_WORK_DAYS_PER_MONTH',numericValue:20,priority:5,isHardConstraint:true,isActive:true},advanced?201:403);
  if(advanced)await call(t.token,'DELETE',`/staff/${t.staff[0].id}/work-rules/${rule.id}`);
  const pattern=await call(t.token,'POST','/work-patterns',{code:'CONTRACT_PROBE',name:'匿名検証勤務',shortName:'検',displayOrder:99,startTime:'09:00',endTime:'17:00',breakMinutes:60,isWorking:true,isDefault:false,isActive:true},advanced?201:403);
  if(advanced)await call(t.token,'DELETE',`/work-patterns/${pattern.id}`);
  const attribute=await call(t.token,'POST','/staff-attributes',{code:'CONTRACT_ATTR_'+checks,name:'匿名資格',category:'QUALIFICATION',displayOrder:0,isActive:true},advanced?201:403);
  const requirement=await call(t.token,'POST','/staffing-requirements',{code:'CONTRACT_REQ_'+checks,name:'匿名必要人数',attributeDefinitionId:advanced?attribute.id:'00000000-0000-4000-8000-000000000001',requiredCount:1,constraintLevel:'HARD',displayOrder:0,isActive:true},advanced?201:403);
  if(advanced){await call(t.token,'DELETE',`/staffing-requirements/${requirement.id}`);await call(t.token,'DELETE',`/staff-attributes/${attribute.id}`);}
  await call(t.token,'PATCH','/settings/shifts',{weekdayEarlyRequired:0},writable?200:403);
  await call(t.token,'POST',`/shifts/${t.shift.id}/precheck`,undefined,writable?201:403);
  checks++;
 }
 await matrix(a,'TRIAL','TRIAL',true);
 await update(a,{staffLimit:a.staff.length,staffLimitSource:'MANUAL',reason:'匿名上限確認'});
 await call(a.token,'POST','/staff',{employeeNumber:'LIMIT',displayName:'匿名上限職員',employmentType:'FULL_TIME',assignedClass:'FREE',canWorkEarly:true,canWorkRegular:true,canWorkLate:true,earlyShiftOnly:false,lateShiftOnly:false,canWorkSaturdays:false},409);
 assert.equal(await db.staff.count({where:{tenantId:a.id}}),a.staff.length);
 await update(a,{staffLimit:20,staffLimitSource:'MANUAL',reason:'匿名上限復元'});
 await update(a,{plan:'UNKNOWN'},400);await update(a,{status:'UNKNOWN'},400);
 await update(a,{...paid('STANDARD'),currentPeriodEndsAt:'invalid'},400);
 await update(a,{...paid('STANDARD'),confirmationReference:''},400);
 await update(a,{...paid('STANDARD'),currentPeriodEndsAt:start},400);
 await update(a,{...paid('STANDARD'),staffLimit:-1},400);
 await call(a.token,'PATCH',`/platform/tenants/${a.id}/subscription`,paid('PROFESSIONAL'),403);
 await call(a.token,'PATCH',`/platform/tenants/${b.id}/subscription`,paid('PROFESSIONAL'),403);
 await update(a,paid('STANDARD'));await matrix(a,'STANDARD','ACTIVE',true);
 await update(a,paid('PROFESSIONAL'));await matrix(a,'PROFESSIONAL','ACTIVE',true);
 await update(a,paid('STANDARD'));await matrix(a,'STANDARD','ACTIVE',true);
 // Trial -> Professional; downgrade retains configuration and blocks unsafe omission.
 await update(b,paid('PROFESSIONAL'));
 const before=JSON.stringify(await db.workPattern.findMany({where:{tenantId:b.id},orderBy:{id:'asc'}}));
 await update(b,paid('STANDARD'));
 assert.equal(JSON.stringify(await db.workPattern.findMany({where:{tenantId:b.id},orderBy:{id:'asc'}})),before);
 assert.equal((await call(b.token,'GET','/setup/readiness')).ready,false);
 const conflict=await call(b.token,'POST',`/shifts/${b.shift.id}/generate`,undefined,403);assert.equal(conflict.code,'CONTRACT_CONFIGURATION_CONFLICT');
 await call(b.token,'POST',`/shifts/${b.shift.id}/confirm`,undefined,403);
 await update(b,paid('PROFESSIONAL'));
 await call(b.token,'POST',`/shifts/${b.shift.id}/precheck`,undefined,201);
 await call(a.token,'POST','/subscription/cancel-request',{reason:'匿名解約検証',tenantId:b.id},201);
 assert.equal((await db.tenantSubscription.findUnique({where:{tenantId:b.id}})).cancelledAt,null);
 await matrix(a,'STANDARD','CANCELLATION_SCHEDULED',true);
 const retained=await db.staff.count({where:{tenantId:a.id}});
 await db.tenantSubscription.update({where:{tenantId:a.id},data:{currentPeriodStartedAt:new Date(now-10*86400000),currentPeriodEndsAt:new Date(now-1000),cancelledAt:new Date(now-1000)}});
 await matrix(a,'STANDARD','CANCELLED',false);
 await call(null,'POST','/auth/login',{loginId:a.loginId,password});
 assert.equal(await db.staff.count({where:{tenantId:a.id}}),retained);
 await update(a,paid('STANDARD'));await matrix(a,'STANDARD','ACTIVE',true);
 await update(a,{status:'SUSPENDED',reason:'匿名一時停止'});await matrix(a,'STANDARD','SUSPENDED',false);
 await call(a.token,'GET','/staff',undefined,403);
 await call(a.token,'PATCH',`/platform/tenants/${a.id}/subscription`,paid('STANDARD'),403);
 await update(a,paid('STANDARD'));
 await update(a,{status:'PAST_DUE'});await matrix(a,'STANDARD','PAST_DUE',false);
 await update(a,paid('STANDARD'));
 const valid=await db.tenantSubscription.findUnique({where:{tenantId:a.id}});
 for(const change of [{currentPeriodStartedAt:null},{currentPeriodEndsAt:null},{currentPeriodStartedAt:new Date(now+86400000)},{staffLimit:0}]){
  await db.tenantSubscription.update({where:{tenantId:a.id},data:change});await matrix(a,'STANDARD','UNVERIFIED',false,true);
  await db.tenantSubscription.update({where:{tenantId:a.id},data:{currentPeriodStartedAt:valid.currentPeriodStartedAt,currentPeriodEndsAt:valid.currentPeriodEndsAt,staffLimit:valid.staffLimit}});
 }
 await db.tenantSubscription.delete({where:{tenantId:a.id}});await matrix(a,'STANDARD','UNVERIFIED',false,true);await db.tenantSubscription.create({data:valid});
 await db.tenantSubscription.update({where:{tenantId:a.id},data:{currentPeriodStartedAt:new Date(now-10*86400000),currentPeriodEndsAt:new Date(now-1000)}});await matrix(a,'STANDARD','EXPIRED',false);
 // An expired trial remains trial: no implicit upgrade, even when explicit override exists.
 await db.tenantSubscription.update({where:{tenantId:a.id},data:{plan:'TRIAL',status:'TRIAL',trialStartedAt:new Date(now-31*86400000),trialEndsAt:new Date(now-1000)}});
 await call(operator,'PUT',`/platform/tenants/${a.id}/features`,{featureCode:'ADVANCED_WORK_PATTERNS',enabled:true,source:'MANUAL'});
 await matrix(a,'TRIAL','EXPIRED',false);
 assert.equal((await db.tenantSubscription.findUnique({where:{tenantId:a.id}})).plan,'TRIAL');
 await call(operator,'DELETE',`/platform/tenants/${a.id}/features/ADVANCED_WORK_PATTERNS`);
 await update(a,{extendTrialDays:30,reason:'匿名試用再開'});await matrix(a,'TRIAL','TRIAL',true);
 // General staff cannot cancel/change contract; a suspended member cannot read business data.
 const member=await db.membership.findFirst({where:{tenantId:a.id,role:'ADMIN'}});
 await db.membership.update({where:{tenantId_userId:{tenantId:a.id,userId:member.userId}},data:{role:'STAFF'}});
 const staff=(await call(null,'POST','/auth/login',{loginId:a.loginId,password})).accessToken;
 await call(staff,'POST','/subscription/cancel-request',{reason:'denied'},403);
 await update(a,{status:'SUSPENDED',reason:'匿名停止'});
 await call(staff,'GET','/notifications',undefined,403);assert.equal((await call(staff,'GET','/subscription/access')).state,'SUSPENDED');
 await db.membership.update({where:{tenantId_userId:{tenantId:a.id,userId:member.userId}},data:{role:'ADMIN'}});await update(a,{extendTrialDays:30,reason:'匿名再開'});
 const logs=await db.auditLog.findMany({where:{tenantId:a.id,targetType:'TenantSubscription'}});assert(logs.length>=10);assert(logs.some(l=>l.detail.confirmationReference==='ANONYMOUS-SIMULATED-CONTRACT'));
 const listing=await call(operator,'GET','/platform/tenants');const listed=listing.find(t=>t.id===a.id);assert.equal(listed.effectiveState,'TRIAL');assert.equal(listed.staff,undefined);assert.equal(listed.contactEmail,undefined);
 if(process.env.PHASE5_BROWSER==='true')await require('./product-phase5-browser.cjs')({origin,operatorLogin,password,tenants,update,paid,db,call});
 await update(a,paid('STANDARD'));await update(b,paid('PROFESSIONAL'));
 if(process.env.PRODUCT_PHASE4!=='true')await require('./product-phase4-monthly.cjs')({call,db,tenants,operator,password,run,uids});
 console.log('Phase5 paid-plan monthly regression PASS: STANDARD A / PROFESSIONAL B');
 console.log(`Phase5 contract E2E PASS: ${checks} state/plan matrices; transitions, cancellation, suspension, expiry, anomalies, data preservation, API guards, operator/tenant boundaries.`);
};
