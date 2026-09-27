const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
require('./helpers/isolated-database.cjs').resolveIsolatedDatabaseUrl();
const { PrismaClient } = require('@prisma/client');
const { anonymousFormalPackage } = require('./helpers/anonymous-formal-package.cjs');
const { derivePreflight, productionPreflight, hash } = require('../scripts/lib/formal-preflight.cjs');
const prisma = new PrismaClient();
let tenantId, otherId, dir;
const users = [];
function run(script, args, extra = {}, success = true) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, ...extra }, encoding: 'utf8' });
  if (success) assert.equal(r.status, 0, script + ': ' + r.stderr);
  else assert.notEqual(r.status, 0);
  return r;
}
async function snapshot(omitTimestamp = false) {
  const tables = await prisma.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename");
  const out = {};
  for (const { tablename } of tables) out[tablename] = await prisma.$queryRawUnsafe('SELECT row_to_json(t) AS value FROM public."' + tablename.replaceAll('"','""') + '" t ORDER BY row_to_json(t)::text');
  return JSON.stringify(out, (k,v) => omitTimestamp && k === 'updatedAt' ? undefined : v);
}
async function tenantSnapshot(id) {
  const all = JSON.parse(await snapshot());
  return JSON.stringify(Object.fromEntries(Object.entries(all).map(([table, rows]) => [table, rows.filter(row => row.value.tenantId === id || table === 'Tenant' && row.value.id === id)])));
}
async function main() {
  const { deriveExecution, executionPreflight } = require('../scripts/lib/formal-execution.cjs');
  tenantId = (await prisma.tenant.create({data:{name:'Anonymous deferred import',code:'musubi-nursery'}})).id;
  otherId = (await prisma.tenant.create({data:{name:'Anonymous sentinel'}})).id;
  await prisma.tenantSubscription.create({data:{tenantId,plan:'TRIAL',status:'TRIAL',staffLimit:23}});
  const otherBefore = await tenantSnapshot(otherId);
  run('scripts/apply-musubi-tenant-master.cjs',['--tenant-id',tenantId,'--scope','TENANT_ONLY','--apply']);
  const email = 'anonymous-'+randomUUID()+'@example.invalid';
  run('scripts/bootstrap-admin.cjs',['--apply'],{INITIAL_ADMIN_TENANT_ID:tenantId,INITIAL_ADMIN_EMAIL:email,INITIAL_ADMIN_PASSWORD:'Aa1!'+randomBytes(24).toString('hex'),INITIAL_ADMIN_DISPLAY_NAME:'Anonymous administrator',INITIAL_ADMIN_STAFF_MODE:'deferred-link',INITIAL_ADMIN_EMPLOYEE_NUMBER:''});
  const user = await prisma.user.findUnique({where:{email}}); users.push(user.id);
  assert.equal(user.mustChangePassword,true);
  const authBefore = JSON.stringify(user);
  const parent = anonymousFormalPackage(randomUUID());
  for (const row of parent.staff) row.provenance.displayName = {sourceId:'MUSUBI-2026-001',locator:'anonymous fixture',approvalStatus:'APPROVED',approvalAuthority:'APPROVED_ITEM_SCOPE'};
  const bytes = Buffer.from(JSON.stringify(parent));
  const binding = {targetTenantId:tenantId,expectedParentHash:hash(bytes)};
  const input = deriveExecution(bytes,{...binding,approvalReference:'anonymous isolated test',adminLinkMode:'DEFERRED'});
  const before = await snapshot();
  const savedEnv = {...process.env};
  Object.assign(process.env,{DEPLOYMENT_ENV:'production',ALLOW_PRODUCTION_PROVISIONING:'true',DATABASE_TARGET_ID:'anonymous-execution-test',CONFIRM_DATABASE_TARGET_ID:'anonymous-execution-test',DATABASE_TARGET_DATABASE:new URL(process.env.DATABASE_URL).pathname.slice(1),CONFIRM_DEPLOYMENT_ENV:'production',PROVISIONING_REHEARSAL:'true'});
  let preflight;
  try { preflight=await executionPreflight(prisma,input,binding); }
  finally { for(const key of Object.keys(process.env)) if(!(key in savedEnv))delete process.env[key]; Object.assign(process.env,savedEnv); }
  assert.equal(preflight.writes,0); assert.equal(preflight.expectedStaffLinks,0); assert.equal(preflight.activeAdministrators,1);
  assert.equal(await snapshot(),before);
  dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'aen-anonymous-execution-'));fs.chmodSync(dir,0o700);
  const file=path.join(dir,'execution.json');fs.writeFileSync(file,JSON.stringify(input),{mode:0o600});
  const args=[file,'--execution-envelope','--tenant-id',tenantId,'--parent-sha256',binding.expectedParentHash];
  run('scripts/import-musubi-beta.cjs',args);assert.equal(await snapshot(),before);
  run('scripts/import-musubi-beta.cjs',[...args,'--admin-employee-number','S001','--apply'],{},false);assert.equal(await snapshot(),before);
  await prisma.membership.updateMany({where:{tenantId},data:{isActive:false}});
  const noAdmin=await snapshot();run('scripts/import-musubi-beta.cjs',[...args,'--apply'],{},false);assert.equal(await snapshot(),noAdmin);
  await prisma.membership.updateMany({where:{tenantId},data:{isActive:true}});
  const membershipBefore = JSON.stringify(await prisma.membership.findMany({where:{tenantId}}));
  run('scripts/import-musubi-beta.cjs',[...args,'--apply']);
  assert.equal(await prisma.staff.count({where:{tenantId}}),23);
  assert.equal(await prisma.staff.count({where:{tenantId,userId:{not:null}}}),0);
  assert.equal(await prisma.user.count(),1);assert.equal(await prisma.membership.count({where:{tenantId,role:'ADMIN',isActive:true}}),1);
  assert.equal(JSON.stringify(await prisma.user.findUnique({where:{id:user.id}})),authBefore);
  assert.equal(JSON.stringify(await prisma.membership.findMany({where:{tenantId}})),membershipBefore);
  const applied=await snapshot();assert.match(run('scripts/import-musubi-beta.cjs',[...args,'--verify']).stdout,/"update": 0/);assert.equal(await snapshot(),applied);
  const staff=await prisma.staff.findMany({where:{tenantId}});assert.equal(new Set(staff.map(s=>s.employeeNumber)).size,23);
  run('scripts/apply-musubi-tenant-master.cjs',['--tenant-id',tenantId,'--scope','STAFF_DEPENDENT','--apply']);
  run('scripts/apply-musubi-tenant-master.cjs',['--tenant-id',tenantId,'--scope','STAFF_DEPENDENT','--verify']);
  const complete=await snapshot();run('scripts/import-musubi-beta.cjs',[...args,'--verify']);assert.equal(await snapshot(),complete);
  const dept = await prisma.staffDepartmentAssignment.findMany({where:{tenantId,isActive:true},include:{department:true}});
  assert.deepEqual(['CHILDCARE','CHILDCARE_SUPPORT','FOOD_SERVICE'].map(code=>dept.filter(d=>d.department.code===code).length),[18,2,3]);
  const attrs=await prisma.staffAttributeAssignment.findMany({where:{tenantId,isActive:true},include:{attributeDefinition:true,staff:true}});
  assert.equal(attrs.filter(a=>a.attributeDefinition.code==='GENERATOR_EXCLUDED').length,3);
  assert.equal(attrs.filter(a=>a.attributeDefinition.code==='FIXED_ASSIGNMENT').length,3);
  assert.equal(attrs.filter(a=>a.attributeDefinition.code==='MUSUBI_ROTATION').length,20);
  assert.equal(attrs.filter(a=>a.attributeDefinition.code==='MUSUBI_ROTATION' && ['S021','S022','S023'].includes(a.staff.employeeNumber)).length,0);
  const pattern=await prisma.workPattern.findUnique({where:{tenantId_code:{tenantId,code:'P05'}}});assert.equal(pattern.startTime,'10:00');assert.equal(pattern.endTime,'18:30');
  const feature=await prisma.tenantFeature.findUnique({where:{tenantId_featureCode:{tenantId,featureCode:'TENANT_CUSTOM_RULES'}}});
  assert.equal(feature.configuration.release1ProvisionalSoftRules.length,3);
  assert.equal(feature.configuration.weeklyPatternGroupLimit.relaxation.maxPerWeek,2);
  assert.deepEqual(feature.configuration.nextDayBlockedPatternTransitions,[{fromPatternCodes:['P05'],toPatternCodes:['EARLY']}]);
  assert.equal(await prisma.staffWorkContract.count({where:{tenantId}}),0);
  assert.equal(await tenantSnapshot(otherId),otherBefore);
  assert.deepEqual(Buffer.from(input.parentPackageBase64,'base64'),bytes);
  const audit=await prisma.auditLog.findMany({where:{tenantId}});
  const importAudit=audit.find(a=>a.action==='MUSUBI_BETA_STAFF_IMPORTED');
  assert.ok(importAudit,'import audit exists');
  assert.equal(importAudit.detail.administratorLinkedToExistingStaff,false);
  assert.equal(importAudit.detail.adminLinkMode,'DEFERRED');assert.equal(importAudit.detail.adminStaffLinkPending,true);
  console.log('Deferred formal import PASS: dry-run write0, guard, Staff23 links0, auth unchanged, verify write0, staff-dependent, other tenant unchanged, parent unchanged');
}
main().catch(e => { console.error(e.code || 'TEST_FAILED', e.stack?.split('\n').filter(line => line.trim().startsWith('at ')).slice(0,2).join(' ')); process.exitCode=1; }).finally(async () => {
  for (const id of [tenantId,otherId]) if(id) await prisma.tenant.delete({where:{id}});
  for (const id of users) await prisma.user.delete({where:{id}});
  if(dir) fs.rmSync(dir,{recursive:true}); await prisma.$disconnect();
});
