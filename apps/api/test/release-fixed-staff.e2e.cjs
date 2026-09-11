const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const {JwtService}=require('@nestjs/jwt');
const {resolveIsolatedDatabaseUrl,resolveLocalApiBaseUrl}=require('./helpers/isolated-database.cjs');
process.env.DATABASE_URL=resolveIsolatedDatabaseUrl();
const prisma=new PrismaClient();const base=resolveLocalApiBaseUrl();
let tenantId,userId;
async function main(){
 const tenant=await prisma.tenant.create({data:{name:'Anonymous fixed-worker gate'}});tenantId=tenant.id;
 await prisma.tenantSubscription.create({data:{tenantId,plan:'PROFESSIONAL',status:'ACTIVE'}});
 const user=await prisma.user.create({data:{displayName:'Anonymous audit',passwordHash:'login-disabled-test'}});userId=user.id;
 await prisma.membership.create({data:{tenantId,userId,role:'ADMIN'}});
 const token=await new JwtService({secret:process.env.JWT_SECRET}).signAsync({sub:userId,tenantId,role:'ADMIN',tokenVersion:0,membershipTokenVersion:0});
 const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
 await prisma.tenantFeature.create({data:{tenantId,featureCode:'TENANT_CUSTOM_RULES',enabled:true,source:'MANUAL',configuration:{meetingDayRules:[{dayOfWeek:5,occurrence:3,minimumEndTime:'18:30'}]}}});
 const defs=await Promise.all(['FIXED_ASSIGNMENT','GENERATOR_EXCLUDED'].map(code=>prisma.staffAttributeDefinition.create({data:{tenantId,code,name:code,category:'ROLE'}})));
 const ids=[];
 for(let i=1;i<=3;i++){
  const staff=await prisma.staff.create({data:{tenantId,employeeNumber:`F00${i}`,displayName:`Anonymous fixed ${i}`,regularWorkStartTime:'08:30',regularWorkEndTime:'17:00'}});ids.push(staff.id);
  await prisma.staffWorkContract.create({data:{tenantId,staffId:staff.id,effectiveFrom:new Date('2035-01-01'),annualizedTargetMinutes:115200,prescribedDailyMinutes:480}});
  for(const d of defs) await prisma.staffAttributeAssignment.create({data:{tenantId,staffId:staff.id,attributeDefinitionId:d.id}});
 }
 await prisma.staff.create({data:{tenantId,employeeNumber:'R001',displayName:'Anonymous rotation',assignedClass:'AGE_0'}});
 const made=await fetch(base+'/shifts',{method:'POST',headers,body:'{"month":"2035-01"}'});assert.equal(made.status,201);const schedule=await made.json();
 const generated=await fetch(base+`/shifts/${schedule.id}/generate`,{method:'POST',headers});assert.equal(generated.status,201);
 const response=await fetch(base+'/shifts?month=2035-01',{headers});assert.equal(response.status,200);const view=await response.json();
 const fixed=view.assignments.filter(x=>ids.includes(x.staffId));assert.equal(fixed.length,93);
 for(const row of fixed.filter(x=>x.workDate.startsWith('2035-01-19'))) {assert.equal(row.startTime,'08:30');assert.equal(row.endTime,'17:00');assert.equal(row.assignedClass,null);}
 assert.ok(view.assignments.filter(x=>x.assignedClass).every(x=>!ids.includes(x.staffId)));
 console.log('anonymous fixed staff API PASS: three visible, fixed times, meeting excluded, no childcare rotation');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{if(tenantId)await prisma.tenant.delete({where:{id:tenantId}});if(userId)await prisma.user.delete({where:{id:userId}});await prisma.$disconnect();});
