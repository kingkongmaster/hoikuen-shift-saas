const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PrismaClient}=require('@prisma/client');const safety=require('./helpers/isolated-database.cjs');safety.resolveIsolatedDatabaseUrl();const base=safety.resolveLocalApiBaseUrl();const p=new PrismaClient();
const fixture=JSON.parse(fs.readFileSync(process.env.PROFILE_TEST_FIXTURE,'utf8'));
async function main(){
 await p.user.update({where:{id:fixture.userId},data:{mustChangePassword:false}});
 const res=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:fixture.email,password:'Synthetic-Initial-Aa7!'})});assert.equal(res.status,200);const token=(await res.json()).accessToken;
 async function req(route,body){const r=await fetch(base+route,{method:body?'PATCH':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
 const setup=(await req('/setup')).body;const input={acceptTerms:true,acceptPrivacy:true,termsVersion:setup.currentTermsVersion,privacyVersion:setup.currentPrivacyVersion,termsHash:setup.legalRelease.termsHash,privacyHash:setup.legalRelease.privacyHash};
 const tables=['staff','department','staffDepartmentAssignment','staffWorkRule','workPattern','tenantShiftSetting','classStaffingRequirement','shiftStaffingRequirement','tenantFeature','membership','user'];
 async function snapshot(){const a={};for(const t of tables)a[t]=(await p[t].findMany()).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return JSON.stringify(a);}
 const before=await snapshot();const tenantBefore=await p.tenant.findUnique({where:{id:fixture.tenantId}});const count=()=>p.auditLog.count({where:{tenantId:fixture.tenantId,action:{in:['TERMS_ACCEPTED','PRIVACY_ACCEPTED']}}});const n=await count();
 if(!setup.legalRelease.approved){assert.equal((await req('/setup/consents',input)).status,409);assert.equal(await count(),n);assert.deepEqual(await p.tenant.findUnique({where:{id:fixture.tenantId}}),tenantBefore);}
 else {
  assert.equal((await req('/setup/consents',{...input,termsVersion:'stale'})).status,409);
  assert.equal((await req('/setup/consents',{...input,termsHash:'0'.repeat(64)})).status,409);
  assert.equal((await req('/setup/consents',{...input,acceptPrivacy:false})).status,400);assert.equal(await count(),n);
  const responses=await Promise.all([req('/setup/consents',input),req('/setup/consents',input)]);assert.ok(responses.every(x=>x.status===200));assert.equal(await count(),n+2);
  const rows=await p.auditLog.findMany({where:{tenantId:fixture.tenantId,action:{in:['TERMS_ACCEPTED','PRIVACY_ACCEPTED']}},orderBy:{createdAt:'desc'},take:2});
  for(const row of rows){assert.equal(row.memberId,fixture.userId);assert.equal(row.targetId,fixture.tenantId);assert.equal(row.detail.termsHash,input.termsHash);assert.equal(row.detail.privacyHash,input.privacyHash);assert.equal(row.detail.agreedAt,row.createdAt.toISOString());assert.deepEqual(Object.keys(row.detail).sort(),['agreedAt','effectiveDate','privacyHash','privacyVersion','termsHash','termsVersion','version'].sort());}
  const after=await p.tenant.findUnique({where:{id:fixture.tenantId}});for(const k of Object.keys(tenantBefore))if(!['termsAcceptedAt','privacyAcceptedAt','termsVersion','privacyVersion','updatedAt','setupStatus'].includes(k))assert.deepEqual(after[k],tenantBefore[k]);
  await req('/setup/consents',input);assert.equal(await count(),n+2);
  await p.tenant.update({where:{id:fixture.tenantId},data:{termsVersion:'older-approved',privacyVersion:'older-approved'}});
  assert.equal((await req('/setup')).body.termsVersionCurrent,false);
  assert.equal((await req('/setup/consents',input)).status,200);assert.equal(await count(),n+4);for(const row of rows)assert.deepEqual(await p.auditLog.findUnique({where:{id:row.id}}),row);
 }
 assert.equal(await snapshot(),before);console.log('LEGAL_API_PASS '+(setup.legalRelease.approved?'approved-fixture: stale/hash mismatch reject, explicit consent, transaction, duplicate/concurrency, history, reconsent, protected data':'unapproved: 409/write0'));
}
main().catch(e=>{console.error('LEGAL_API_HOLD',e.name,e.code,(e.stack||'').split('\n').filter(x=>x.includes('legal-consent.e2e.cjs')).join('\n'));process.exitCode=1}).finally(()=>p.$disconnect());
