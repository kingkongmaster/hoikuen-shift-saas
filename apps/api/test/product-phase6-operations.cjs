const assert=require('node:assert/strict');
module.exports=async({call,db,tenants,operator,password,origin,operatorLogin,run,uids,tids,app})=>{
 const [a,b]=tenants, {ProductLegal}=require('../dist/presentation/product-operations/product-legal');
 const original=ProductLegal.prototype.current;
 const legal=await call(null,'GET','/product-sales/terms');assert.equal(legal.approved,false);
 const input={organization:'匿名申込園',contactName:'匿名申込管理者',contactEmail:'application-'+run+'@example.invalid',requestedPlan:'PROFESSIONAL',version:legal.version,hash:legal.hash,agreed:true};
 const count=await db.productApplication.count();
 await call(null,'POST','/product-sales/applications',input,503);assert.equal(await db.productApplication.count(),count);
 const ticket=await call(a.token,'POST','/support/tickets',{subject:'匿名の操作相談',category:'操作方法',body:'PRIVATE_BODY_ONLY_IN_SUPPORT <script>anonymous</script>'},201);
 await call(null,'GET','/support/tickets',undefined,401);
 for(const token of [a.token,b.token]){await call(token,'GET','/platform/support',undefined,403);await call(token,'GET','/platform/support/applications',undefined,403);await call(token,'POST',`/platform/support/${ticket.id}/messages`,{body:'forbidden',status:'RESOLVED'},403);}
 await call(b.token,'GET',`/support/tickets/${ticket.id}`,undefined,404);
 await call(b.token,'POST',`/support/tickets/${ticket.id}/messages`,{body:'forbidden',status:'OPEN'},404);
 assert.equal((await call(b.token,'GET','/support/tickets?tenantId='+a.id)).length,0);
 const queue=await call(operator,'GET','/platform/support');assert(!JSON.stringify(queue).includes('PRIVATE_BODY'));assert(!JSON.stringify(queue).includes('requesterId'));
 await call(operator,'GET',`/platform/support/${ticket.id}`);
 await call(operator,'POST',`/platform/support/${ticket.id}/messages`,{body:'匿名の回答',status:'RESOLVED'},201);
 let detail=await call(a.token,'GET',`/support/tickets/${ticket.id}`);assert.equal(detail.status,'RESOLVED');assert.equal(detail.messages[1].fromOperator,true);
 await call(a.token,'POST',`/support/tickets/${ticket.id}/messages`,{body:'追加質問',status:'RESOLVED'},201);
 detail=await call(a.token,'GET',`/support/tickets/${ticket.id}`);assert.equal(detail.status,'OPEN');assert.equal(detail.messages[2].fromOperator,false);
 assert(!JSON.stringify(await db.auditLog.findMany({where:{tenantId:a.id,targetType:'SupportTicket'}})).includes('PRIVATE_BODY'));
 await call(a.token,'POST','/support/tickets',{subject:'x',category:'操作方法',body:'x'.repeat(4001)},400);
 await call(a.token,'POST','/support/tickets',{subject:' ',category:'操作方法',body:' '},400);
 await call(a.token,'POST',`/support/tickets/${ticket.id}/messages`,{body:'x',status:'BAD'},400);
 // Same-tenant different owner cannot see tickets, even as an administrator.
 const {PasswordService}=require('../dist/application/auth/password.service');
 const other=await db.user.create({data:{loginId:'support-staff-'+run,displayName:'匿名問い合わせ職員',passwordHash:await app.get(PasswordService).hash(password)}});uids.push(other.id);
 await db.membership.create({data:{tenantId:a.id,userId:other.id,role:'STAFF'}});
 const staff=(await call(null,'POST','/auth/login',{loginId:other.loginId,password})).accessToken;
 await call(staff,'GET',`/support/tickets/${ticket.id}`,undefined,404);
 const own=await call(staff,'POST','/support/tickets',{subject:'職員の相談',category:'その他',body:'匿名'},201);
 await call(a.token,'GET',`/support/tickets/${own.id}`,undefined,404);
 const sub=await db.tenantSubscription.findUnique({where:{tenantId:a.id}});
 for(const status of ['EXPIRED','SUSPENDED','CANCELLED']){
  await db.tenantSubscription.update({where:{tenantId:a.id},data:{status}});
  await call(a.token,'GET','/staff',undefined,403);
  await call(a.token,'GET','/support/tickets');await call(staff,'GET','/support/tickets');
  await call(a.token,'POST',`/support/tickets/${ticket.id}/messages`,{body:'契約確認 '+status,status:'OPEN'},201);
 }
 await db.tenantSubscription.update({where:{tenantId:a.id},data:{status:sub.status}});
 await db.membership.update({where:{tenantId_userId:{tenantId:a.id,userId:other.id}},data:{isActive:false}});
 await call(staff,'GET','/support/tickets',undefined,403);
 // Only this loopback test process injects an approved fictional publication.
 // There is deliberately no deployed flag to approve drafts.
 ProductLegal.prototype.current=function(){return {...original.call(this),approved:true};};
 let receipt;
 try{
  await call(null,'POST','/product-sales/applications',{...input,agreed:false},400);
  await call(null,'POST','/product-sales/applications',{...input,hash:'0'.repeat(64)},400);
  await call(null,'POST','/product-sales/applications',{...input,version:'old'},400);
  receipt=await call(null,'POST','/product-sales/applications',input,201);
  assert.deepEqual(Object.keys(receipt).sort(),['id','message','receivedAt']);
  const accepted=await db.productApplication.findUnique({where:{id:receipt.id}});assert.equal(accepted.tenantId,null);assert.equal(accepted.consent.version,legal.version);assert.equal(accepted.consent.identity,'UNVERIFIED_APPLICANT');
  const provision={name:input.organization,code:'app-'+run,adminLoginId:'app-admin-'+run,adminDisplayName:input.contactName,applicationId:receipt.id,applicantVerified:true};
  await call(a.token,'POST','/tenants/provision',provision,403);
  await call(operator,'POST','/tenants/provision',{...provision,applicantVerified:false},400);
  await call(operator,'POST','/tenants/provision',{...provision,name:'別園'},400);
  const c=await call(operator,'POST','/tenants/provision',provision,201);tids.push(c.tenant.id);uids.push(c.administrator.id);
  await call(operator,'POST','/tenants/provision',{...provision,code:'other-'+run,adminLoginId:'other-'+run},409);
  assert.equal(c.subscription.plan,'TRIAL');assert.equal(await db.staff.count({where:{tenantId:c.tenant.id}}),0);
  const linked=await db.productApplication.findUnique({where:{id:receipt.id}});assert.equal(linked.tenantId,c.tenant.id);assert(linked.verifiedBy&&linked.verifiedAt);
  const invite={tenantId:c.tenant.id,invitationId:c.invitation.id,token:c.invitation.token,loginId:provision.adminLoginId,password,confirmPassword:password};
  await call(null,'POST','/auth/accept-invitation',invite);
  await call(null,'POST','/auth/accept-invitation',invite,403);
  const login=await call(null,'POST','/auth/login',{loginId:provision.adminLoginId,password});assert.equal(login.tenant.id,c.tenant.id);
  assert.equal((await call(login.accessToken,'GET','/setup/readiness')).ready,false);
  // Reuse the existing legacy Setup-consent HTTP suite with its required
  // anonymous fixture and this loopback server (never the default API port).
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const fixtureDir=await fs.mkdtemp(path.join(os.tmpdir(),'aen-phase6-consent-'));
  try{
   await db.user.update({where:{id:c.administrator.id},data:{passwordHash:await app.get(PasswordService).hash('Synthetic-Initial-Aa7!')}});
   const fixtureFile=path.join(fixtureDir,'fixture.json');await fs.writeFile(fixtureFile,JSON.stringify({tenantId:c.tenant.id,userId:c.administrator.id,email:input.contactEmail}),{mode:0o600});
   const {stdout}=await require('node:util').promisify(require('node:child_process').execFile)(process.execPath,[path.join(__dirname,'legal-consent.e2e.cjs')],{env:{...process.env,PROFILE_TEST_FIXTURE:fixtureFile,API_BASE_URL:origin+'/api'}});console.log(stdout.trim());
  }finally{await fs.rm(fixtureDir,{recursive:true,force:true});}
  if(process.env.PHASE6_RESTORE==='true')await require('./product-phase6-restore.cjs')({db,tenantIds:[a.id,b.id,c.tenant.id],ticketId:ticket.id,applicationId:receipt.id});
 }finally{ProductLegal.prototype.current=original;if(receipt)await db.productApplication.delete({where:{id:receipt.id}});}
 if(process.env.PHASE6_BROWSER==='true')await require('./product-phase6-browser.cjs')({origin,password,operatorLogin,tenants,db});
 // Enforce the per-owner cap under concurrent submissions, without relying on UI.
 const existing=await db.supportTicket.count({where:{tenantId:b.id,requesterId:uids[2]}});
 for(let i=existing;i<9;i++)await call(b.token,'POST','/support/tickets',{subject:'匿名上限検証',category:'その他',body:'匿名'},201);
 const responses=await Promise.all([1,2].map(()=>fetch(origin+'/api/support/tickets',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+b.token},body:JSON.stringify({subject:'匿名同時送信',category:'その他',body:'匿名'})}).then(r=>r.status)));
 assert.deepEqual(responses.sort(),[201,429]);
 process.env.RATE_LIMIT_ENABLED='true';
 let limited=false;for(let i=0;i<21;i++){const r=await fetch(origin+'/api/product-sales/applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(r.status===429){limited=true;break;}}
 assert(limited);process.env.RATE_LIMIT_ENABLED='false';
 console.log('Phase6 PASS: delivered support, reply/history, owner/tenant/operator isolation, suspended access, caps, draft refusal, consent evidence and applicant-to-invitation conversion.');
};
