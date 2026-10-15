// Extends the real Phase 3 HTTP onboarding; no customer data is seeded directly.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
module.exports=async({call,db,tenants,operator,password,run,uids})=>{
 const results=[];
 const month='2032-02',working=new Set(['EARLY','NORMAL','LATE','OTHER']);
 async function submit(t){for(const i of (await call(t.token,'GET',`/manager-reviews/${month}/submission`)).items)await call(t.token,'POST',`/manager-reviews/${month}/submission/${i.category}`,{revision:i.revision,inputDigest:i.inputDigest,state:i.count?'SUBMITTED_WITH_DATA':'SUBMITTED_EMPTY'},201);}
 for(const [index,t] of tenants.entries()){
  const token=t.token,id=t.shift.id,s=t.staff[0], loginId='monthly-'+index+'-'+run;
  await call(token,'POST',`/staff/${s.id}/login-account`,{loginId,role:'STAFF',temporaryPassword:password,confirmPassword:password},201);
  uids.push((await db.staff.findUnique({where:{id:s.id}})).userId);
  let login=await call(null,'POST','/auth/login',{loginId,password});
  const nextPassword='Monthly-Anonymous-Aa2!';
  await call(login.accessToken,'POST','/auth/change-initial-password',{currentPassword:password,newPassword:nextPassword,confirmPassword:nextPassword});
  login=await call(null,'POST','/auth/login',{loginId,password:nextPassword});t.staffToken=login.accessToken;t.staffLogin=loginId;t.staffPassword=nextPassword;
  const req=await call(t.staffToken,'POST','/requests',{requestDate:month+'-03',requestType:'DAY_OFF',reason:'匿名希望休'},201);t.request=req;
  await call(token,'PATCH','/requests/'+req.id,{status:'APPROVED'});
  await call(token,'POST','/closed-dates',{closedDate:month+'-11',name:'匿名休園日'},201);
  const pendingLeave=[];
  if(index===1){
   await call(operator,'PUT',`/platform/tenants/${t.id}/features`,{featureCode:'STAFF_WORK_RULES',enabled:true,source:'MANUAL'});
   const patterns=await call(token,'GET','/work-patterns');const normal=patterns.find(p=>p.code==='NORMAL');
   const rule=(extra)=>({priority:10,isHardConstraint:true,isActive:true,...extra});
   await call(token,'POST',`/staff/${s.id}/work-rules`,rule({ruleType:'FIXED_WORK_PATTERN',workPatternId:normal.id,startDate:month+'-04',endDate:month+'-04'}),201);
   await call(token,'POST',`/staff/${t.staff[2].id}/work-rules`,rule({ruleType:'REQUIRED_DAY_OFF',dayOfWeek:4,startDate:month+'-05',endDate:month+'-05'}),201);
   const custom=patterns.find(p=>p.code==='CUSTOM_DAY');
   await call(token,'POST',`/staff/${t.staff[3].id}/work-rules`,rule({ruleType:'FIXED_WORK_PATTERN',workPatternId:custom.id,startDate:month+'-10',endDate:month+'-10'}),201);
   const grants=new Map();
   for(const [date,type,staff] of [[month+'-06','PAID_LEAVE',s],[month+'-04','HALF_DAY_PM',s]]){
    const r=await call(token,'POST','/requests',{staffId:staff.id,requestDate:date,requestType:type},201);await call(token,'PATCH','/requests/'+r.id,{status:'APPROVED'});
    const grant=grants.get(staff.id)||await call(token,'POST',`/staff/${staff.id}/paid-leave/grants`,{grantDate:'2032-01-01',validFrom:'2032-01-01',expiresAt:'2033-12-31',grantedHalfDays:20,source:'NORMAL_GRANT'},201);
    grants.set(staff.id,grant);
    pendingLeave.push({staff,date,type,grant,request:r});
   }
  }
  const gen=await call(token,'POST',`/shifts/${id}/generate`,undefined,201);
  assert.equal(gen.generatedCount,t.staff.length*29);
  let view=await call(token,'GET','/shifts/'+id);
  assert(view.assignments.filter(a=>a.workDate.startsWith(month+'-11')).every(a=>!working.has(a.shiftType)));
  assert(!working.has(view.assignments.find(a=>a.staffId===s.id&&a.workDate.startsWith(month+'-03')).shiftType));
  if(index===1){
   assert.equal(view.assignments.find(a=>a.staffId===s.id&&a.workDate.startsWith(month+'-06')).shiftType,'PAID_LEAVE');
   assert(view.assignments.find(a=>a.staffId===s.id&&a.workDate.startsWith(month+'-04')).attendanceModifier,'half-day modifier retained');
   assert(!working.has(view.assignments.find(a=>a.staffId===t.staff[2].id&&a.workDate.startsWith(month+'-05')).shiftType));
   assert.equal(view.assignments.find(a=>a.staffId===t.staff[3].id&&a.workDate.startsWith(month+'-10')).workPattern.code,'CUSTOM_DAY');
  }
  await call(token,'POST',`/shifts/${id}/confirm`,undefined,409); // zero rows != submission
  await submit(t);
  // An impossible requirement is visible; it must never silently add staff.
  await call(token,'PATCH','/settings/shifts',{saturdayOperationEnabled:true,saturdayMinimumStaff:t.staff.length+1});
  await call(token,'PATCH','/settings/class-requirements',{requirements:[{classType:'AGE_0',weekdayRequired:t.staff.length+1,saturdayRequired:0,isActive:true}]});
  const shortage=await call(token,'POST',`/shifts/${id}/generate`,undefined,201);
  assert(shortage.warnings.some(w=>w.code==='SATURDAY_MINIMUM_SHORTAGE'&&w.level==='ERROR'&&w.message&&w.impact.includes('FINAL')));
  assert(shortage.warnings.some(w=>w.code==='CLASS_SHORTAGE'&&w.level==='WARNING'&&w.required>w.assigned));
  assert(shortage.warnings.some(w=>w.level==='INFO'));
  await call(token,'POST',`/shifts/${id}/confirm`,undefined,409);
  // Administrator corrects the test condition, then explicitly regenerates/rechecks.
  await call(token,'PATCH','/settings/shifts',{saturdayOperationEnabled:false,saturdayMinimumStaff:0});
  await call(token,'PATCH','/settings/class-requirements',{requirements:[{classType:'AGE_0',weekdayRequired:1,saturdayRequired:0,isActive:true}]});
  await call(token,'POST',`/shifts/${id}/generate`,undefined,201);
  const edit={staffId:s.id,workDate:month+'-09',shiftType:'NORMAL',assignedClass:'AGE_0',startTime:'09:00',endTime:'18:00',breakMinutes:60};
  await call(token,'PUT',`/shifts/${id}/assignments`,{assignments:[edit]});
  await call(token,'PUT',`/shifts/${id}/assignments`,{assignments:[{...edit,shiftType:'OFF',startTime:null,endTime:null,breakMinutes:0}]});
  // Keep the OFF edit to verify stale generated workPattern relations are removed.
  const offView=await call(token,'GET','/shifts/'+id);
  const off=offView.assignments.find(a=>a.staffId===s.id&&a.workDate.startsWith(edit.workDate));assert.equal(off.shiftType,'OFF');assert.equal(off.workPattern,null);
  await call(token,'PUT',`/shifts/${id}/assignments`,{assignments:[{...edit,workDate:month+'-03'}]},409);
  const beforeRejected=JSON.stringify(await db.shiftAssignment.findMany({where:{monthlyShiftId:id},orderBy:{id:'asc'}}));
  await call(token,'PUT',`/shifts/${id}/assignments`,{assignments:[{...edit,workDate:month+'-10'},{...edit,workDate:month+'-11'}]},409);
  assert.equal(JSON.stringify(await db.shiftAssignment.findMany({where:{monthlyShiftId:id},orderBy:{id:'asc'}})),beforeRejected,'rejected batch writes nothing');
  await call(token,'PUT',`/shifts/${id}/assignments`,{assignments:[{...edit,staffId:tenants[1-index].staff[0].id}]},404);
  await call(token,'PUT',`/shifts/${id}/assignments`,{assignments:[{...edit,workDate:month+'-11'}]},409);
  if(index===1)await call(token,'PUT',`/shifts/${id}/assignments`,{assignments:[{...edit,staffId:t.staff[2].id,workDate:month+'-05'}]},409);
  await call(t.staffToken,'PUT',`/shifts/${id}/assignments`,{assignments:[edit]},403);
  assert.equal((await call(t.staffToken,'GET','/shifts?month='+month)).schedule,null);
  await call(token,'POST',`/shifts/${id}/precheck`,undefined,201);
  const final=await call(token,'POST',`/shifts/${id}/confirm`);
  for(const {staff,date,type,grant,request} of pendingLeave){
   const finalView=await call(token,'GET','/shifts/'+id);const assignment=finalView.assignments.find(a=>a.staffId===staff.id&&a.workDate.startsWith(date));
   await call(token,'POST',`/staff/${staff.id}/paid-leave/usages/confirm`,{usageDate:date,unit:type==='PAID_LEAVE'?'DAY':'HALF_DAY',allocations:[{grantId:grant.id,allocatedHalfDays:type==='PAID_LEAVE'?2:1}],shiftRequestId:request.id,shiftAssignmentId:assignment.id,decisionNote:'匿名月次検証'},201);
  }
  assert.equal(final.status,'CONFIRMED');assert(final.confirmedAt&&final.confirmedByUserId);
  await call(token,'PUT',`/shifts/${id}/assignments`,{assignments:[edit]},409);
  const own=await call(t.staffToken,'GET','/shifts?month='+month);assert(own.assignments.length);assert(own.assignments.every(a=>a.staffId===s.id));
  await call(t.staffToken,'GET','/shifts?month='+month+'&staffId='+t.staff[1].id,undefined,403);
  await call(t.staffToken,'GET','/staff',undefined,403);
  const notifications=await call(t.staffToken,'GET','/notifications');assert(JSON.stringify(notifications).includes('SHIFT_CONFIRMED'));
  const calendar=await call(t.staffToken,'GET','/me/calendar?month='+month);
  if(index===1)assert.equal(calendar.assignments.find(a=>a.workDate.startsWith(month+'-04')).attendanceModifier.modifierType,'PM_PAID_LEAVE');
  const print=await call(token,'GET','/exports/print/shifts?month='+month);assert.equal(print.status,'CONFIRMED');assert.equal(print.assignments.length,t.staff.length*29);
  if(index===1)assert.equal(print.assignments.find(a=>a.employeeNumber===s.employeeNumber&&a.date===month+'-04').shiftType,'午後半休');
  const personalPrint=await call(t.staffToken,'GET','/exports/print/my-shift?month='+month);assert(personalPrint.assignments.every(a=>a.employeeNumber===s.employeeNumber));
  await call(t.staffToken,'GET','/exports/print/shifts?month='+month,undefined,403);
  results.push({tenant:index?'B':'A',staffCount:t.staff.length,generatedCount:gen.generatedCount,initialWarningCodes:[...new Set(gen.warnings.map(w=>w.level+':'+w.code))],shortageCodes:[...new Set(shortage.warnings.map(w=>w.level+':'+w.code))],finalStatus:final.status});
  console.log('Phase4 monthly tenant '+(index?'B':'A')+' PASS: onboarding → requests → generation → shortage → condition adjustment → reevaluation → manual edit → FINAL → own staff view');
 }
 const [a,b]=tenants;
 const before=JSON.stringify(await db.monthlyShift.findUnique({where:{id:b.shift.id},include:{assignments:{orderBy:{id:'asc'}}}}));
 await call(a.token,'GET','/shifts/'+b.shift.id,undefined,404);
 await call(a.token,'POST',`/shifts/${b.shift.id}/confirm`,undefined,404);
 await call(a.token,'GET','/requests/'+b.request.id,undefined,404);
 await call(a.token,'PATCH','/requests/'+b.request.id,{status:'REJECTED'},404);
 await call(a.token,'PATCH','/staff/'+b.staff[0].id,{displayName:'denied'},404);
 assert.equal(JSON.stringify(await db.monthlyShift.findUnique({where:{id:b.shift.id},include:{assignments:{orderBy:{id:'asc'}}}})),before);
 const out=path.resolve('output/product-phase4');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'api-results.json'),JSON.stringify(results,null,2));
 console.log('Phase4 monthly tenant boundary PASS');
};
