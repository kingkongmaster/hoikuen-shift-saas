const assert = require('node:assert/strict');
const { randomBytes, randomUUID, scryptSync } = require('node:crypto');
const { JwtService } = require('@nestjs/jwt');
const { PrismaClient } = require('@prisma/client');
const { resolveIsolatedDatabaseUrl, resolveLocalApiBaseUrl } = require('./helpers/isolated-database.cjs');
process.env.DATABASE_URL = resolveIsolatedDatabaseUrl();
const prisma = new PrismaClient();
const base = resolveLocalApiBaseUrl();
const run = randomUUID().slice(0, 8);
const password = `Safety-${run}Aa!2345`;
const createdUserIds = [], createdStaffIds = [];
let tenantBId;
function hash(value) { const salt=randomBytes(16).toString('hex'); return `${salt}:${scryptSync(value,salt,64).toString('hex')}`; }
async function q(path, init={}, token) { const response=await fetch(base+path,{...init,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})}}); return {status:response.status,body:await response.json().catch(()=>null)}; }
async function login(loginId, value=password) { return q('/auth/login',{method:'POST',body:JSON.stringify({loginId,password:value})}); }
async function makeUser(tenantId, role, label) { const user=await prisma.user.create({data:{loginId:`${label}.${run}`,email:null,displayName:`Synthetic ${label}`,passwordHash:hash(password)}});createdUserIds.push(user.id);await prisma.membership.create({data:{tenantId,userId:user.id,role}});return user; }
const staffInput = (number, name) => ({employeeNumber:number,displayName:name,employmentType:'FULL_TIME',assignedClass:'FREE',canWorkEarly:true,canWorkRegular:true,canWorkLate:true,earlyShiftOnly:false,lateShiftOnly:false,canWorkSaturdays:true});

async function main() {
  const ownerLogin=await q('/auth/login',{method:'POST',body:JSON.stringify({loginId:process.env.SEED_OWNER_EMAIL||'owner@demo.enshift.local',password:process.env.SEED_OWNER_PASSWORD||'ChangeMe123!'})});
  assert.equal(ownerLogin.status,200); const adminToken=ownerLogin.body.accessToken, tenantAId=ownerLogin.body.tenant.id;

  const roleUsers=[];
  for (const role of ['DIRECTOR','CHIEF','STAFF']) roleUsers.push([role,await makeUser(tenantAId,role,role.toLowerCase())]);
  const permissionTarget=await q('/staff',{method:'POST',body:JSON.stringify(staffInput(`PERM-${run}`,'Synthetic Permission Target'))},adminToken);assert.equal(permissionTarget.status,201);createdStaffIds.push(permissionTarget.body.id);
  for (const [role,user] of roleUsers) { const session=await login(user.loginId);assert.equal(session.status,200);assert.equal((await q(`/staff/${permissionTarget.body.id}/login-account`,{},session.body.accessToken)).status,403,`${role} cannot read accounts`);assert.equal((await q(`/staff/${permissionTarget.body.id}/login-account`,{method:'POST',body:'{}'},session.body.accessToken)).status,403,`${role} cannot create accounts`); }

  const accountStaff=await q('/staff',{method:'POST',body:JSON.stringify(staffInput(`ACCOUNT-${run}`,'Synthetic Account Target'))},adminToken);assert.equal(accountStaff.status,201);createdStaffIds.push(accountStaff.body.id);
  const temporary=`Temporary-${run}Bb!234`;const issued=await q(`/staff/${accountStaff.body.id}/login-account`,{method:'POST',body:JSON.stringify({loginId:`noemail.${run}`,role:'STAFF',temporaryPassword:temporary,confirmPassword:temporary})},adminToken);assert.equal(issued.status,201);assert.equal(issued.body.email,null);const accountUser=await prisma.user.findUniqueOrThrow({where:{loginId:`noemail.${run}`}});createdUserIds.push(accountUser.id);
  assert.equal((await q(`/staff/${accountStaff.body.id}/login-account/reset-password`,{method:'POST',body:JSON.stringify({temporaryPassword:`Another-${run}Cc!234`,confirmPassword:`Another-${run}Cc!234`,reason:'   '})},adminToken)).status,400);
  assert.equal((await q(`/staff/${accountStaff.body.id}/login-account/deactivate`,{method:'POST',body:JSON.stringify({reason:'   '})},adminToken)).status,400);
  assert.equal((await q(`/staff/${accountStaff.body.id}/login-account/reactivate`,{method:'POST',body:JSON.stringify({reason:'   '})},adminToken)).status,400);

  const backup=await q('/backups/export',{method:'POST'},adminToken);assert.equal(backup.status,201);assert.equal(backup.body.version,3);const backedMember=backup.body.data.members.find(row=>row.userId===accountUser.id);assert.equal(backedMember.user.loginId,accountUser.loginId);assert.equal(backedMember.user.email,null);assert.equal('passwordHash' in backedMember.user,false);assert.equal((await q('/backups/validate',{method:'POST',body:JSON.stringify({backup:backup.body})},adminToken)).status,201);

  const concurrentStaff=[];for(let i=1;i<=2;i++){const result=await q('/staff',{method:'POST',body:JSON.stringify(staffInput(`CON-${run}-${i}`,`Synthetic Concurrent ${i}`))},adminToken);assert.equal(result.status,201);createdStaffIds.push(result.body.id);concurrentStaff.push(result.body.id)}
  const concurrentPassword=`Concurrent-${run}Dd!23`;const concurrent=await Promise.all(concurrentStaff.map(id=>q(`/staff/${id}/login-account`,{method:'POST',body:JSON.stringify({loginId:`same.${run}`,role:'STAFF',temporaryPassword:concurrentPassword,confirmPassword:concurrentPassword})},adminToken)));assert.deepEqual(concurrent.map(x=>x.status).sort(),[201,409]);const concurrentUser=await prisma.user.findUnique({where:{loginId:`same.${run}`}});assert.ok(concurrentUser);createdUserIds.push(concurrentUser.id);

  tenantBId=(await prisma.tenant.create({data:{name:'Synthetic Tenant B'}})).id;await prisma.tenantSubscription.create({data:{tenantId:tenantBId,status:'ACTIVE'}});
  const shared=await prisma.user.create({data:{loginId:`shared.${run}`,email:null,displayName:'Synthetic Shared User',passwordHash:hash(password)}});createdUserIds.push(shared.id);
  await prisma.membership.create({data:{tenantId:tenantBId,userId:shared.id,role:'STAFF'}});await prisma.membership.create({data:{tenantId:tenantAId,userId:shared.id,role:'STAFF'}});
  const staffB=await prisma.staff.create({data:{tenantId:tenantBId,userId:shared.id,...staffInput(`B-${run}`,'Synthetic B Staff')}});createdStaffIds.push(staffB.id);
  const staffA=await prisma.staff.create({data:{tenantId:tenantAId,userId:shared.id,...staffInput(`A-${run}`,'Synthetic A Staff')}});createdStaffIds.push(staffA.id);
  const bLogin=await login(shared.loginId);assert.equal(bLogin.status,200);assert.equal(bLogin.body.tenant.id,tenantBId);const bToken=bLogin.body.accessToken;assert.equal((await q('/me/calendar?month=2030-01',{},bToken)).status,200);
  const secret=process.env.JWT_SECRET;const jwt=new JwtService({secret});const oldAToken=await jwt.signAsync({sub:shared.id,tenantId:tenantAId,role:'STAFF',loginId:shared.loginId,email:null,tokenVersion:shared.tokenVersion,membershipTokenVersion:0});
  assert.equal((await q(`/staff/${staffA.id}/login-account/deactivate`,{method:'POST',body:JSON.stringify({reason:'Tenant A account stop test'})},adminToken)).status,201);
  assert.equal((await q('/me/calendar?month=2030-01',{},oldAToken)).status,403);assert.equal((await q('/me/calendar?month=2030-01',{},bToken)).status,200);
  assert.equal((await q(`/staff/${staffA.id}/login-account/reactivate`,{method:'POST',body:JSON.stringify({reason:'Tenant A account resume test'})},adminToken)).status,201);
  const resumedAToken=await jwt.signAsync({sub:shared.id,tenantId:tenantAId,role:'STAFF',loginId:shared.loginId,email:null,tokenVersion:0,membershipTokenVersion:2});assert.equal((await q('/me/calendar?month=2030-01',{},resumedAToken)).status,200);
  assert.equal((await q(`/staff/${staffA.id}`,{method:'DELETE'},adminToken)).status,200);assert.equal((await q('/me/calendar?month=2030-01',{},oldAToken)).status,403);assert.equal((await q('/me/calendar?month=2030-01',{},bToken)).status,200);
  const [memberA,memberB,afterStaffB,afterShared]=await Promise.all([prisma.membership.findUniqueOrThrow({where:{tenantId_userId:{tenantId:tenantAId,userId:shared.id}}}),prisma.membership.findUniqueOrThrow({where:{tenantId_userId:{tenantId:tenantBId,userId:shared.id}}}),prisma.staff.findUniqueOrThrow({where:{id:staffB.id}}),prisma.user.findUniqueOrThrow({where:{id:shared.id}})]);assert.equal(memberA.isActive,false);assert.equal(memberA.tokenVersion,3);assert.equal(memberB.isActive,true);assert.equal(memberB.tokenVersion,0);assert.equal(afterStaffB.isActive,true);assert.equal(afterShared.tokenVersion,0);
  await prisma.$transaction([prisma.staff.update({where:{id:staffA.id},data:{isActive:true}}),prisma.membership.update({where:{tenantId_userId:{tenantId:tenantAId,userId:shared.id}},data:{isActive:true}})]);assert.equal((await q('/me/calendar?month=2030-01',{},oldAToken)).status,403,'old tenant A token remains revoked after reactivation');const newAToken=await jwt.signAsync({sub:shared.id,tenantId:tenantAId,role:'STAFF',loginId:shared.loginId,email:null,tokenVersion:0,membershipTokenVersion:3});assert.equal((await q('/me/calendar?month=2030-01',{},newAToken)).status,200);
  console.log('Release 1 staff Safety E2E: PASS (roles/reason/backup/concurrency/multi-tenant session isolation)');
}
main().finally(async()=>{if(createdStaffIds.length)await prisma.staff.deleteMany({where:{id:{in:createdStaffIds}}}).catch(()=>{});if(tenantBId)await prisma.tenant.delete({where:{id:tenantBId}}).catch(()=>{});if(createdUserIds.length)await prisma.user.deleteMany({where:{id:{in:createdUserIds}}}).catch(()=>{});await prisma.$disconnect()}).catch(e=>{console.error(e);process.exitCode=1});
