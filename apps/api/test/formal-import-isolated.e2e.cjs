const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { JwtService } = require('@nestjs/jwt');
const { resolveLocalApiBaseUrl } = require('./helpers/isolated-database.cjs');
const { anonymousFormalPackage } = require('./helpers/anonymous-formal-package.cjs');
require('./helpers/isolated-database.cjs').resolveIsolatedDatabaseUrl();
const { MonthlyGenerationContextBuilder } = require('../dist/application/shifts/monthly-generation-context-builder');
const { FeaturesService } = require('../dist/presentation/features/features.service');
const { SubscriptionsService } = require('../dist/presentation/subscriptions/subscriptions.service');
const { AuditService } = require('../dist/presentation/audit/audit.service');
const { validateGenerationContext } = require('../dist/application/shifts/generation-preflight-validator');
const prisma = new PrismaClient();
let tenantId, otherId, userId, directory;
function run(script, args) {
  const result = spawnSync(process.execPath, [script,...args], { cwd:path.resolve(__dirname,'..'), env:process.env, encoding:'utf8' });
  assert.equal(result.status,0, `${script}: ${result.stderr || result.stdout}`);
  return result.stdout;
}
async function snapshot(id) {
  const staff = await prisma.staff.findMany({where:{tenantId:id},orderBy:{employeeNumber:'asc'}});
  const departments = await prisma.staffDepartmentAssignment.findMany({where:{tenantId:id},orderBy:{id:'asc'}});
  const rules = await prisma.staffWorkRule.findMany({where:{tenantId:id},orderBy:{id:'asc'}});
  // updatedAt changes record execution, not the business diff.
  return JSON.stringify({staff,departments,rules},(key,value)=>key==='updatedAt'?undefined:value);
}
async function main() {
  const tenant = await prisma.tenant.create({data:{name:'Anonymous formal import regression'}}); tenantId=tenant.id;
  const other = await prisma.tenant.create({data:{name:'Anonymous isolation sentinel'}});otherId=other.id;
  await prisma.staff.create({data:{tenantId:otherId,employeeNumber:'OTHER',displayName:'Anonymous sentinel'}});
  const beforeOther=await snapshot(otherId);
  await prisma.tenantSubscription.create({data:{tenantId,plan:'PROFESSIONAL',status:'ACTIVE'}});
  const user=await prisma.user.create({data:{displayName:'Anonymous import test actor',passwordHash:'disabled-test-login'}});userId=user.id;
  await prisma.membership.create({data:{tenantId,userId,role:'ADMIN'}});
  directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'aen-formal-anonymous-'));fs.chmodSync(directory,0o700);
  const file=path.join(directory,'anonymous-formal-package.json');fs.writeFileSync(file,JSON.stringify(anonymousFormalPackage(tenantId)),{mode:0o600});
  const args=[file,'--formal-package','--admin-employee-number','S001'];
  assert.match(run('scripts/validate-musubi-formal-package.cjs',[file,'S001']),/"pass":true/);
  run('scripts/import-musubi-beta.cjs',args);
  assert.equal(await prisma.staff.count({where:{tenantId}}),0,'dry-run must not create staff');
  run('scripts/import-musubi-beta.cjs',[...args,'--apply']);
  run('scripts/apply-musubi-tenant-master.cjs',['--tenant-id',tenantId,'--apply']);
  const staff=await prisma.staff.findMany({where:{tenantId},orderBy:{employeeNumber:'asc'}});
  assert.equal(staff.length,23);
  assert.equal(await prisma.staffWorkContract.count({where:{tenantId}}),0,'no inferred annual contract');
  assert.equal(staff[15].canWorkSaturdays,false);
  assert.equal(staff[15].regularWorkEndTime,'16:40');
  assert.equal((await prisma.workPattern.findUnique({where:{tenantId_code:{tenantId,code:'P05'}}})).startTime,'10:00');
  const feature=await prisma.tenantFeature.findUnique({where:{tenantId_featureCode:{tenantId,featureCode:'TENANT_CUSTOM_RULES'}}});
  assert.equal(feature.configuration.release1SourceProvenance.fieldSources.S001.canWorkSaturdays.approvalStatus,'RELEASE1_OPERATIONAL_DEFAULT');
  assert.equal(feature.configuration.release1ProvisionalSoftRules.length,3);
  const context=await new MonthlyGenerationContextBuilder(prisma, new FeaturesService(prisma, new SubscriptionsService(prisma, new AuditService(prisma)), new AuditService(prisma))).build(tenantId,new Date('2026-10-01'));
  assert.equal(context.fixedStaffIds.size,3);
  assert.equal(validateGenerationContext(context,'PRECHECK').some(row=>row.code==='FIXED_CONTRACT_UNRESOLVED'),false,'approved fixed time ranges permit no annual contracts');
  const before=await snapshot(tenantId);
  assert.match(run('scripts/import-musubi-beta.cjs',args),/"update": 0/);
  run('scripts/import-musubi-beta.cjs',[...args,'--apply']);
  run('scripts/apply-musubi-tenant-master.cjs',['--tenant-id',tenantId,'--apply']);
  assert.equal(await snapshot(tenantId),before,'second application has zero business diff');
  assert.equal(await snapshot(otherId),beforeOther,'other tenant unchanged');
  const base=resolveLocalApiBaseUrl();
  const token=await new JwtService({secret:process.env.JWT_SECRET}).signAsync({sub:userId,tenantId,role:'ADMIN',tokenVersion:0,membershipTokenVersion:0});
  const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
  const made=await fetch(base+'/shifts',{method:'POST',headers,body:JSON.stringify({month:'2026-10'})});
  assert.equal(made.status,201); const schedule=await made.json();
  const generated=await fetch(base+`/shifts/${schedule.id}/generate`,{method:'POST',headers});
  assert.equal(generated.status,201,JSON.stringify(await generated.json()));
  const fixedIds=staff.filter(row=>['S021','S022','S023'].includes(row.employeeNumber)).map(row=>row.id);
  const assignments=await prisma.shiftAssignment.findMany({where:{tenantId,staffId:{in:fixedIds}}});
  assert.equal(assignments.length,93,'API materializes all three fixed workers without annual contracts');
  assert.ok(assignments.every(row=>row.assignedClass==null));
  const s016=await prisma.shiftAssignment.findFirst({where:{tenantId,staffId:staff[15].id,workDate:new Date('2026-10-01')}});
  assert.equal(s016.endTime,'16:40');
  await prisma.workPattern.update({where:{tenantId_code:{tenantId,code:'P09'}},data:{startTime:'10:00'}});
  const blocked=spawnSync(process.execPath,['scripts/apply-musubi-tenant-master.cjs','--tenant-id',tenantId,'--apply'],{cwd:path.resolve(__dirname,'..'),env:process.env,encoding:'utf8'});
  assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/NEWER_TENANT_P09/);
  assert.equal((await prisma.workPattern.findUnique({where:{tenantId_code:{tenantId,code:'P09'}}})).startTime,'10:00');
  console.log('Formal isolated import PASS: adapter -> importer -> master -> DB, 23 anonymous staff, no annual contracts, fixed preflight, second business diff 0, other tenant diff 0, later P09 protected');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  for(const id of [tenantId,otherId]) if(id)await prisma.tenant.delete({where:{id}});
  if(userId)await prisma.user.delete({where:{id:userId}});
  if(directory)fs.rmSync(directory,{recursive:true});
  await prisma.$disconnect();
});
