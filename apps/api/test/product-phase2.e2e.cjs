const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
process.env.DATABASE_URL = require('./helpers/isolated-database.cjs').resolveIsolatedDatabaseUrl();
process.env.JWT_SECRET = 'anonymous-phase-two-isolated-key-123456789';
process.env.NODE_ENV = 'test';
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/infrastructure/database/prisma.service');
const { PasswordService } = require('../dist/application/auth/password.service');
let app, db, checks = 0;
const tids = [], uids = [];
(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1'); db = app.get(PrismaService);
  const base = await app.getUrl(), suffix = randomUUID().slice(0,8);
  async function call(token, method, path, body, expected) {
    const response = await fetch(base+'/api'+path, { method, headers: { 'Content-Type':'application/json', ...(token ? {Authorization:'Bearer '+token} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) });
    const result = await response.json();
    if(expected !== undefined) { assert.equal(response.status, expected, method+' '+path+' '+JSON.stringify(result)); checks++; }
    return result;
  }
  const password='Anonymous-Two-Test-Aa1!', hash=await app.get(PasswordService).hash(password);
  const tenants=[];
  const month='2031-06', date=month+'-02';
  for (const label of ['A','B','Operator']) {
    const tenant = await db.tenant.create({data:{name:'Anonymous '+label,contactEmail:'private-'+label+'@example.invalid'}}); tids.push(tenant.id);
    await db.tenantSubscription.create({data:{tenantId:tenant.id,plan:'PROFESSIONAL',status:'ACTIVE',staffLimit:20}});
    const user=await db.user.create({data:{loginId:label.toLowerCase()+'-'+suffix,displayName:'Anonymous '+label,passwordHash:hash,isPlatformAdmin:label==='Operator'}});uids.push(user.id);
    await db.membership.create({data:{tenantId:tenant.id,userId:user.id,role:'ADMIN'}});
    const token=(await call(null,'POST','/auth/login',{loginId:user.loginId,password},200)).accessToken;
    const staff=await db.staff.create({data:{tenantId:tenant.id,userId:user.id,employeeNumber:'S1',displayName:'Anonymous '+label}});
    const shift=await db.monthlyShift.create({data:{tenantId:tenant.id,targetMonth:new Date(month+'-01'),createdByUserId:user.id}});
    const assignment=await db.shiftAssignment.create({data:{tenantId:tenant.id,monthlyShiftId:shift.id,staffId:staff.id,workDate:new Date(date),shiftType:'NORMAL'}});
    const request=await db.shiftRequest.create({data:{tenantId:tenant.id,staffId:staff.id,requestDate:new Date(date),requestType:'DAY_OFF'}});
    const pattern=await db.workPattern.create({data:{tenantId:tenant.id,code:'LOCAL',name:'Anonymous pattern',shortName:'L',startTime:'08:00',endTime:'17:00'}});
    const rule=await db.staffWorkRule.create({data:{tenantId:tenant.id,staffId:staff.id,ruleType:'FIXED_WORK_PATTERN',workPatternId:pattern.id,dayOfWeek:1}});
    const department=await db.department.create({data:{tenantId:tenant.id,code:'LOCAL',name:'Anonymous department'}});
    const notification=await db.notification.create({data:{tenantId:tenant.id,memberId:user.id,type:'SYSTEM',title:'Anonymous',message:label}});
    const grant=await db.paidLeaveGrant.create({data:{tenantId:tenant.id,staffId:staff.id,grantDate:new Date(date),validFrom:new Date(date),expiresAt:new Date('2032-06-01'),grantedHalfDays:20,source:'NORMAL_GRANT',createdByUserId:user.id}});
    tenants.push({tenant,user,token,staff,shift,assignment,request,pattern,rule,department,notification,grant});
  }
  const [a,b,operator]=tenants;
  const snapshot=async id=>{
    const rows={};for(const model of ['tenant','staff','monthlyShift','shiftAssignment','shiftRequest','workPattern','staffWorkRule','department','staffDepartmentAssignment','paidLeaveGrant','paidLeaveUsage','notification','tenantShiftSetting','tenantSubscription','auditLog'])rows[model]=await db[model].findMany({where:model==='tenant'?{id}:{tenantId:id},orderBy:{id:'asc'}});
    return JSON.stringify(rows);
  };
  const otherNotification=await db.notification.create({data:{tenantId:a.tenant.id,memberId:b.user.id,type:'SYSTEM',title:'Other recipient',message:'Anonymous'}});
  await call(a.token,'PATCH',`/notifications/${otherNotification.id}/read`,undefined,404);
  const before=await snapshot(b.tenant.id);
  const patternBody={code:'LOCAL',name:'Changed',shortName:'L',displayOrder:0,startTime:'08:00',endTime:'17:00',breakMinutes:60,isWorking:true,isDefault:false,isActive:true};
  const ruleBody={ruleType:'FIXED_WORK_PATTERN',workPatternId:b.pattern.id,dayOfWeek:1,priority:1,isHardConstraint:true,isActive:true};
  const departmentBody={code:'LOCAL',name:'Changed',displayOrder:0,isActive:true};
  const grantBody={grantDate:date,validFrom:date,expiresAt:'2032-06-01',grantedHalfDays:20,source:'NORMAL_GRANT'};
  const boundaryCases=[
    ['GET',`/staff/${b.staff.id}`],['PATCH',`/staff/${b.staff.id}`,{displayName:'Forbidden'}],['DELETE',`/staff/${b.staff.id}`],
    ['GET',`/shifts/${b.shift.id}`],['POST',`/shifts/${b.shift.id}/generate`],['POST',`/shifts/${b.shift.id}/confirm`],
    ['PUT',`/shifts/${b.shift.id}/assignments`,{assignments:[{staffId:a.staff.id,workDate:date,shiftType:'NORMAL'}]}],
    ['GET',`/requests/${b.request.id}`],['PATCH',`/requests/${b.request.id}`,{reason:'Forbidden'}],['DELETE',`/requests/${b.request.id}`],
    ['POST','/requests',{staffId:b.staff.id,requestDate:date,requestType:'DAY_OFF'}],
    ['PUT',`/work-patterns/${b.pattern.id}`,patternBody],['DELETE',`/work-patterns/${b.pattern.id}`],
    ['GET',`/staff/${b.staff.id}/work-rules`],['POST',`/staff/${a.staff.id}/work-rules`,ruleBody],
    ['PUT',`/staff/${a.staff.id}/work-rules/${b.rule.id}`,ruleBody],['DELETE',`/staff/${a.staff.id}/work-rules/${b.rule.id}`],
    ['PUT',`/departments/${b.department.id}`,departmentBody],['GET',`/staff/${b.staff.id}/departments`],
    ['POST',`/staff/${a.staff.id}/departments`,{departmentId:b.department.id,isPrimary:true}],
    ['GET',`/staff/${b.staff.id}/paid-leave/grants`],['GET',`/staff/${b.staff.id}/paid-leave/usages`],['GET',`/staff/${b.staff.id}/paid-leave/balance`],
    ['POST',`/staff/${b.staff.id}/paid-leave/grants`,grantBody],['POST',`/staff/${a.staff.id}/paid-leave/grants/${b.grant.id}/void`,{reason:'Forbidden'}],
    ['PATCH',`/notifications/${b.notification.id}/read`],
  ];
  for(const [method,path,body] of boundaryCases)await call(a.token,method,path,body,method==='POST' && path===`/staff/${a.staff.id}/work-rules`?400:404);
  // Query/body tenant hints never select another tenant.
  for(const path of ['/staff','/work-patterns','/departments','/notifications','/settings/shifts','/settings/class-requirements','/subscription','/features','/setup','/audit-logs']) {
    const result=await call(a.token,'GET',path+'?tenantId='+b.tenant.id,undefined,200);
    assert.ok(!JSON.stringify(result).includes(b.tenant.id),path+' leaked foreign tenant');checks++;
  }
  await call(a.token,'PATCH','/settings/shifts',{tenantId:b.tenant.id,weekdayEarlyRequired:4},200);
  const updated=await db.tenantShiftSetting.findUnique({where:{tenantId:a.tenant.id}});assert.equal(updated.weekdayEarlyRequired,4);
  await call(a.token,'PATCH','/setup/tenant',{tenantId:b.tenant.id,name:'Anonymous A edited',contactEmail:'anonymous@example.invalid'},200);
  await call(a.token,'GET',`/requests?month=${month}&staffId=${b.staff.id}`,undefined,404);
  await call(a.token,'PUT',`/shifts/${a.shift.id}/assignments`,{assignments:[{staffId:b.staff.id,workDate:date,shiftType:'NORMAL'}]},404);
  assert.equal(await snapshot(b.tenant.id),before,'foreign tenant changed');checks++;
  // Operator metadata is explicit, no profile/contact or staff rows.
  const listing=await call(operator.token,'GET','/platform/tenants',undefined,200);
  const listed=listing.find(t=>t.id===b.tenant.id);assert.ok(listed);assert.equal(listed.contactEmail,undefined);assert.equal(listed.staff,undefined);checks++;
  await call(operator.token,'GET',`/staff/${b.staff.id}`,undefined,404);
  await call(a.token,'GET','/platform/tenants',undefined,403);
  await call(a.token,'PATCH',`/platform/tenants/${b.tenant.id}/subscription`,{status:'SUSPENDED'},403);
  await call(operator.token,'POST','/tenants',{name:'Anonymous legacy',code:'legacy-'+suffix},403);
  assert.equal(await db.membership.count({where:{tenantId:b.tenant.id,userId:operator.user.id}}),0);
  await call(operator.token,'PATCH',`/platform/tenants/${a.tenant.id}/subscription`,{plan:'TRIAL',status:'ACTIVE'},400);
  await db.user.update({where:{id:operator.user.id},data:{isPlatformAdmin:false}});
  await call(operator.token,'GET','/platform/tenants',undefined,403);
  await db.user.update({where:{id:operator.user.id},data:{isPlatformAdmin:true}});
  await call(a.token,'POST','/staff',{employeeNumber:'S2',displayName:'Anonymous new',employmentType:'FULL_TIME',assignedClass:'FREE',canWorkEarly:true,canWorkRegular:true,canWorkLate:true,earlyShiftOnly:false,lateShiftOnly:false,canWorkSaturdays:true},201);
  // Department configuration reuses existing tables, no schema migration.
  const dept=await call(a.token,'POST','/departments',{code:'NEW',name:'新しい部署',displayOrder:2,isActive:true},201);
  await call(a.token,'POST','/departments',{code:'NEW',name:'重複',displayOrder:2,isActive:true},409);
  await call(a.token,'POST',`/staff/${a.staff.id}/departments`,{departmentId:dept.id,isPrimary:true,startDate:'2031-06-01T12:00:00Z'},400);
  await call(a.token,'POST',`/staff/${a.staff.id}/departments`,{departmentId:dept.id,isPrimary:true,startDate:'2031-07-01',endDate:'2031-06-01'},400);
  const assigned=await call(a.token,'POST',`/staff/${a.staff.id}/departments`,{departmentId:dept.id,isPrimary:true},201);
  await call(a.token,'POST',`/staff/${a.staff.id}/departments`,{departmentId:dept.id,isPrimary:true},409);
  await call(a.token,'DELETE',`/staff/${a.staff.id}/departments/${assigned.id}`,undefined,200);
  await call(a.token,'PUT',`/departments/${dept.id}`,{code:'NEW',name:'新しい部署',displayOrder:2,isActive:false},200);
  await call(a.token,'POST',`/staff/${a.staff.id}/departments`,{departmentId:dept.id,isPrimary:true},404);
  await call(null,'GET','/departments',undefined,401);
  // Current membership checked, including old token after role change/revocation.
  await db.membership.update({where:{tenantId_userId:{tenantId:a.tenant.id,userId:a.user.id}},data:{role:'STAFF'}});
  await call(a.token,'GET','/staff',undefined,403);
  const staffToken=(await call(null,'POST','/auth/login',{loginId:a.user.loginId,password},200)).accessToken;
  for(const path of ['/staff','/departments','/settings/shifts','/subscription','/platform/tenants'])await call(staffToken,'GET',path,undefined,403);
  await call(staffToken,'GET',`/requests/${b.request.id}`,undefined,404);
  await db.membership.update({where:{tenantId_userId:{tenantId:a.tenant.id,userId:a.user.id}},data:{isActive:false}});
  await call(staffToken,'GET','/notifications',undefined,403);
  // Actual API entitlement and displayed feature catalogue agree for all plans.
  for(const [plan,advanced] of [['TRIAL',false],['STANDARD',false],['PROFESSIONAL',true]]) {
    await db.tenantSubscription.update({where:{tenantId:b.tenant.id},data:{plan,status:plan==='TRIAL'?'TRIAL':'ACTIVE',trialEndsAt:plan==='TRIAL'?new Date(Date.now()+86400000):null}});
    const feature=await call(b.token,'GET','/features',undefined,200);
    const subscription=await call(b.token,'GET','/subscription',undefined,200);
    const labels=require('../dist/domain/features/feature-catalog').FEATURE_LABELS;
    assert.deepEqual(subscription.features,feature.enabledFeatures.map(code=>labels[code]));checks++;
    assert.equal(feature.enabledFeatures.includes('STAFF_WORK_RULES'),advanced);checks++;
    await call(b.token,'POST',`/staff/${b.staff.id}/work-rules`,{ruleType:'MAX_WORK_DAYS_PER_MONTH',numericValue:20,priority:5,isHardConstraint:true,isActive:true},advanced?201:403);
  }
  await db.tenantSubscription.update({where:{tenantId:b.tenant.id},data:{status:'ACTIVE',currentPeriodEndsAt:new Date(0)}});
  const expired=await call(b.token,'GET','/features',undefined,200);assert.deepEqual(expired.enabledFeatures,[]);
  await call(b.token,'POST','/departments',{code:'DENIED',name:'No',displayOrder:0,isActive:true},403);
  console.log(`PRODUCT Phase2 HTTP/DB: PASS (${checks} assertions; cross-tenant reads/writes, operator separation, departments, live membership, plans)`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(db){for(const id of tids)await db.tenant.delete({where:{id}});for(const id of uids)await db.user.delete({where:{id}});}if(app)await app.close();
});
