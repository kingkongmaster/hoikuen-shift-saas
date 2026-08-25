const assert=require('node:assert/strict');
const{randomUUID}=require('node:crypto');
const{Client}=require('pg');
const{PrismaClient}=require('@prisma/client');
const{resolveIsolatedDatabaseUrl,resolveLocalApiBaseUrl}=require('./helpers/isolated-database.cjs');
const databaseUrl=resolveIsolatedDatabaseUrl();process.env.DATABASE_URL=databaseUrl;
const prisma=new PrismaClient(),base=resolveLocalApiBaseUrl(),run=randomUUID().slice(0,8);let ids=[];
async function q(path,init={},token){const r=await fetch(base+path,{...init,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})}});return{status:r.status,body:await r.json().catch(()=>null)}}
const input=n=>({employeeNumber:`LIMIT-${run}-${n}`,displayName:`Synthetic Limit ${n}`,employmentType:'FULL_TIME',assignedClass:'FREE',canWorkEarly:true,canWorkRegular:true,canWorkLate:true,earlyShiftOnly:false,lateShiftOnly:false,canWorkSaturdays:true});
async function main(){
  const owner=await prisma.user.findUniqueOrThrow({where:{email:process.env.SEED_OWNER_EMAIL||'owner@demo.enshift.local'}}),wasPlatform=owner.isPlatformAdmin;
  await prisma.user.update({where:{id:owner.id},data:{isPlatformAdmin:true}});
  const login=await q('/auth/login',{method:'POST',body:JSON.stringify({loginId:owner.loginId,password:process.env.SEED_OWNER_PASSWORD||'ChangeMe123!'})});assert.equal(login.status,200);
  const token=login.body.accessToken,tenantId=login.body.tenant.id,sub=await prisma.tenantSubscription.findUniqueOrThrow({where:{tenantId}}),count=await prisma.staff.count({where:{tenantId,isActive:true}});
  try{
    assert.equal((await q(`/platform/tenants/${tenantId}/subscription`,{method:'PATCH',body:JSON.stringify({staffLimit:count+1,reason:'   ',staffLimitSource:'PILOT'})},token)).status,400);
    const changed=await q(`/platform/tenants/${tenantId}/subscription`,{method:'PATCH',body:JSON.stringify({staffLimit:count+1,reason:'Release 1 pilot capacity test',staffLimitSource:'PILOT'})},token);assert.equal(changed.status,200);assert.equal(changed.body.staffLimit,count+1);
    const results=await Promise.all([1,2].map(n=>q('/staff',{method:'POST',body:JSON.stringify(input(n))},token)));assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);ids=results.filter(x=>x.status===201).map(x=>x.body.id);assert.equal(await prisma.staff.count({where:{tenantId,isActive:true}}),count+1);
    const audit=await prisma.auditLog.findFirst({where:{tenantId,action:'STAFF_LIMIT_OVERRIDE_UPDATED'},orderBy:{createdAt:'desc'}});assert.equal(audit.detail.source,'PILOT');assert.equal(audit.detail.reason,'Release 1 pilot capacity test');
    await prisma.staff.deleteMany({where:{id:{in:ids}}});ids=[];await prisma.tenantSubscription.update({where:{tenantId},data:{staffLimit:sub.staffLimit,status:'ACTIVE'}});
    const lock=new Client({connectionString:databaseUrl});await lock.connect();await lock.query('BEGIN');await lock.query('SELECT id FROM "TenantSubscription" WHERE "tenantId"=$1 FOR UPDATE',[tenantId]);
    const pending=q('/staff',{method:'POST',body:JSON.stringify(input('SUSPENDED'))},token);await new Promise(resolve=>setTimeout(resolve,150));await lock.query('UPDATE "TenantSubscription" SET status=$1 WHERE "tenantId"=$2',['SUSPENDED',tenantId]);await lock.query('COMMIT');await lock.end();
    const blocked=await pending;assert.equal(blocked.status,403);assert.equal(blocked.body.code,'SUBSCRIPTION_SUSPENDED');assert.equal(await prisma.staff.count({where:{tenantId,employeeNumber:`LIMIT-${run}-SUSPENDED`}}),0);
    console.log('Release 1 staffLimit concurrency E2E: PASS (capacity lock and locked subscription status recheck)');
  }finally{if(ids.length)await prisma.staff.deleteMany({where:{id:{in:ids}}});await prisma.tenantSubscription.update({where:{tenantId},data:{staffLimit:sub.staffLimit,status:sub.status}});await prisma.user.update({where:{id:owner.id},data:{isPlatformAdmin:wasPlatform}})}
}
main().finally(()=>prisma.$disconnect()).catch(e=>{console.error(e);process.exitCode=1});
