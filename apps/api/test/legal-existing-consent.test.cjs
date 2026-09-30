const assert=require('node:assert/strict');
const {legalConsentState}=require('../dist/presentation/setup/legal-consent-state');
const {LEGAL_RELEASE,TERMS_VERSION,PRIVACY_VERSION}=require('../dist/presentation/setup/setup.constants');
const tenantId='anonymous-tenant',userId='anonymous-admin',at=new Date();
const tenant={termsAcceptedAt:at,privacyAcceptedAt:at,termsVersion:TERMS_VERSION,privacyVersion:PRIVACY_VERSION};
const rows=['terms','privacy'].map(k=>({tenantId,memberId:userId,targetType:'Tenant',targetId:tenantId,action:k==='terms'?'TERMS_ACCEPTED':'PRIVACY_ACCEPTED',createdAt:at,detail:{version:k==='terms'?TERMS_VERSION:PRIVACY_VERSION,termsVersion:TERMS_VERSION,privacyVersion:PRIVACY_VERSION,termsHash:LEGAL_RELEASE.termsHash,privacyHash:LEGAL_RELEASE.privacyHash,effectiveDate:LEGAL_RELEASE.effectiveDate,agreedAt:at.toISOString()}}));
async function state(t=tenant,rs=rows,u=userId){return legalConsentState({auditLog:{findMany:async({where})=>{assert.equal(where.tenantId,tenantId);assert.equal(where.memberId,u);return rs.filter(r=>['tenantId','memberId','targetType','targetId'].every(k=>r[k]===where[k]));}}},tenantId,u,t);}
(async()=>{
 assert.equal((await state()).legalConsentVerified,true);
 assert.equal((await state({...tenant,termsAcceptedAt:null,privacyAcceptedAt:null})).legalConsentStatus,'NOT_ACCEPTED');
 assert.equal((await state({...tenant,termsVersion:'old'})).legalConsentStatus,'OUTDATED');
 for(const mutate of [r=>r.detail.termsHash='0'.repeat(64),r=>r.detail.version='old',r=>r.memberId='other-admin',r=>r.tenantId='other-tenant',r=>r.targetId='other-tenant',r=>r.detail.agreedAt=new Date(0).toISOString(),r=>r.detail.effectiveDate='2099-01-01']){
  const copy=rows.map(r=>({...r,detail:{...r.detail}}));mutate(copy[0]);assert.equal((await state(tenant,copy)).legalConsentStatus,'EVIDENCE_MISMATCH');
 }
 assert.equal((await state(tenant,rows,'different-user')).legalConsentVerified,false);
 assert.equal((await state(tenant,rows,'')).legalConsentVerified,false);
 assert.equal((await state(tenant,rows.slice(0,1))).legalConsentVerified,false);
 console.log('LEGAL_EXISTING_EVIDENCE_PASS same user/tenant/version/hash/date; absent/outdated/tampered/missing fail closed; read only');
})().catch(()=>{console.error('LEGAL_EXISTING_EVIDENCE_HOLD');process.exitCode=1;});
