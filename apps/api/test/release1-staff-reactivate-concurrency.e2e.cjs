const assert = require('node:assert/strict');
const { randomBytes, randomUUID, scryptSync } = require('node:crypto');
const { JwtService } = require('@nestjs/jwt');
const { PrismaClient } = require('@prisma/client');
const { resolveIsolatedDatabaseUrl, resolveLocalApiBaseUrl } = require('./helpers/isolated-database.cjs');

process.env.DATABASE_URL = resolveIsolatedDatabaseUrl();
const prisma = new PrismaClient();
const base = resolveLocalApiBaseUrl();
const run = randomUUID().slice(0, 8);
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const createdUsers = [];
const createdStaff = [];

function hash(value) { const salt=randomBytes(16).toString('hex'); return `${salt}:${scryptSync(value,salt,64).toString('hex')}`; }
function staffData(index) { return { employeeNumber:`LOCK-${run}-${index}`,displayName:`Synthetic Lock ${index}`,employmentType:'FULL_TIME',assignedClass:'FREE',canWorkEarly:true,canWorkRegular:true,canWorkLate:true,earlyShiftOnly:false,lateShiftOnly:false,canWorkSaturdays:true }; }
async function q(path,init={},token){const response=await fetch(base+path,{...init,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})}});return{status:response.status,body:await response.json().catch(()=>null)}}
async function fixture(tenantId,index,staffActive,membershipActive){
  const user=await prisma.user.create({data:{loginId:`lock.${run}.${index}`,email:null,displayName:`Synthetic Lock User ${index}`,passwordHash:hash(`Synthetic-${run}-Aa!2345`)}});createdUsers.push(user.id);
  await prisma.membership.create({data:{tenantId,userId:user.id,role:'STAFF',isActive:membershipActive}});
  const staff=await prisma.staff.create({data:{tenantId,userId:user.id,isActive:staffActive,...staffData(index)}});createdStaff.push(staff.id);
  return {user,staff};
}
async function token(user,tenantId,membershipTokenVersion){return jwt.signAsync({sub:user.id,tenantId,role:'STAFF',loginId:user.loginId,email:null,tokenVersion:user.tokenVersion,membershipTokenVersion})}

async function main(){
  const owner=await q('/auth/login',{method:'POST',body:JSON.stringify({loginId:process.env.SEED_OWNER_EMAIL||'owner@demo.enshift.local',password:process.env.SEED_OWNER_PASSWORD||'ChangeMe123!'})});assert.equal(owner.status,200);const adminToken=owner.body.accessToken,tenantId=owner.body.tenant.id;

  for(let iteration=1;iteration<=5;iteration++){
    const {user,staff}=await fixture(tenantId,`race-${iteration}`,true,false);
    const [deactivated,reactivated]=await Promise.all([
      q(`/staff/${staff.id}`,{method:'DELETE'},adminToken),
      q(`/staff/${staff.id}/login-account/reactivate`,{method:'POST',body:JSON.stringify({reason:`Concurrent safety ${iteration}`})},adminToken),
    ]);
    assert.equal(deactivated.status,200);
    assert.ok([201,409].includes(reactivated.status),`unexpected reactivate status ${reactivated.status}`);
    const [afterStaff,member]=await Promise.all([prisma.staff.findUniqueOrThrow({where:{id:staff.id}}),prisma.membership.findUniqueOrThrow({where:{tenantId_userId:{tenantId,userId:user.id}}})]);
    assert.equal(afterStaff.isActive,false);assert.equal(member.isActive,false,'disabled Staff must never retain an active Membership');assert.ok(member.tokenVersion>=1);
    assert.equal((await q('/me/calendar?month=2030-01',{},await token(user,tenantId,member.tokenVersion))).status,403);
  }

  const inconsistent=await fixture(tenantId,'repair',false,true);const repairToken=await token(inconsistent.user,tenantId,0);
  assert.equal((await q(`/staff/${inconsistent.staff.id}`,{method:'DELETE'},adminToken)).status,200);
  const repaired=await prisma.membership.findUniqueOrThrow({where:{tenantId_userId:{tenantId,userId:inconsistent.user.id}}});assert.equal(repaired.isActive,false);assert.equal(repaired.tokenVersion,1);assert.equal((await q('/me/calendar?month=2030-01',{},repairToken)).status,403);

  const normal=await fixture(tenantId,'normal',true,false);
  assert.equal((await q(`/staff/${normal.staff.id}/login-account/reactivate`,{method:'POST',body:JSON.stringify({reason:'Normal reactivate'})},adminToken)).status,201);
  const normalMember=await prisma.membership.findUniqueOrThrow({where:{tenantId_userId:{tenantId,userId:normal.user.id}}});assert.equal(normalMember.isActive,true);assert.equal(normalMember.tokenVersion,1);assert.equal((await prisma.staff.findUniqueOrThrow({where:{id:normal.staff.id}})).isActive,true);

  const disabled=await fixture(tenantId,'disabled',false,false);
  assert.equal((await q(`/staff/${disabled.staff.id}/login-account/reactivate`,{method:'POST',body:JSON.stringify({reason:'Must remain disabled'})},adminToken)).status,409);
  const disabledMember=await prisma.membership.findUniqueOrThrow({where:{tenantId_userId:{tenantId,userId:disabled.user.id}}});assert.equal(disabledMember.isActive,false);assert.equal(disabledMember.tokenVersion,0);

  console.log('Release 1 Staff/reactivate locking E2E: PASS (5 races, mismatch repair, normal and disabled reactivate)');
}
main().finally(async()=>{if(createdStaff.length)await prisma.staff.deleteMany({where:{id:{in:createdStaff}}}).catch(()=>{});if(createdUsers.length)await prisma.user.deleteMany({where:{id:{in:createdUsers}}}).catch(()=>{});await prisma.$disconnect()}).catch(error=>{console.error(error);process.exitCode=1});
