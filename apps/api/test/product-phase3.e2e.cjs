// Anonymous tenants only. Bootstrap the operator in the isolated test DB;
// customer tenants, administrators and setup are created exclusively through HTTP/UI.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
process.env.DATABASE_URL=require('./helpers/isolated-database.cjs').resolveIsolatedDatabaseUrl();
process.env.JWT_SECRET='anonymous-product-phase-three-loopback-only-key';
process.env.NODE_ENV='test';process.env.COMMERCIAL_ONBOARDING_ENABLED='true';
require('reflect-metadata');
const {NestFactory}=require('@nestjs/core'),{ValidationPipe}=require('@nestjs/common');
const {AppModule}=require('../dist/app.module'),{PrismaService}=require('../dist/infrastructure/database/prisma.service'),{PasswordService}=require('../dist/application/auth/password.service');
const tids=[],uids=[],run=randomUUID().slice(0,8),password='Anonymous-Onboarding-Aa1!';let app,db,server,checks=0;
(async()=>{
 app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.listen(0,'127.0.0.1');db=app.get(PrismaService);const origin=await app.getUrl();
 async function call(token,method,path,body,expected=200){const r=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await r.json();assert.equal(r.status,expected,method+' '+path+' expected '+expected+' got '+r.status);checks++;return result;}
 const operatorTenant=await db.tenant.create({data:{name:'Anonymous operator'}});tids.push(operatorTenant.id);
 const operatorUser=await db.user.create({data:{loginId:'operator-'+run,displayName:'匿名運営者',isPlatformAdmin:true,passwordHash:await app.get(PasswordService).hash(password)}});uids.push(operatorUser.id);
 await db.membership.create({data:{tenantId:operatorTenant.id,userId:operatorUser.id,role:'ADMIN'}});
 const operator=(await call(null,'POST','/auth/login',{loginId:operatorUser.loginId,password})).accessToken;
 const legacyToken=require('node:crypto').randomBytes(32).toString('hex');
 const legacy=await db.invitation.create({data:{tenantId:operatorTenant.id,role:'ADMIN',tokenHash:require('node:crypto').createHash('sha256').update(legacyToken).digest('hex'),expiresAt:new Date(Date.now()+3600000),createdByUserId:operatorUser.id}});
 await call(null,'POST','/auth/accept-invitation',{tenantId:operatorTenant.id,invitationId:legacy.id,token:legacyToken,loginId:operatorUser.loginId,password,confirmPassword:password},403);
 const tenants=[];
 for(const label of ['A','B']){
  const loginId='admin-'+label.toLowerCase()+'-'+run;
  const c=await call(operator,'POST','/tenants/provision',{name:'匿名園'+label,code:'phase3-'+label.toLowerCase()+'-'+run,adminLoginId:loginId,adminDisplayName:'匿名管理者'+label},201);
  const id=c.tenant.id;tids.push(id);uids.push(c.administrator.id);
  assert.equal(await db.staff.count({where:{tenantId:id}}),0);assert.equal(await db.department.count({where:{tenantId:id}}),0);assert.equal(await db.workPattern.count({where:{tenantId:id}}),0);checks+=3;
  assert.equal(await db.membership.count({where:{tenantId:id,userId:operatorUser.id}}),0);checks++;
  assert.notEqual((await db.invitation.findUnique({where:{id:c.invitation.id}})).tokenHash,c.invitation.token);assert(!JSON.stringify(await db.auditLog.findMany({where:{tenantId:id}})).includes(c.invitation.token));checks+=2;
  const input={tenantId:id,invitationId:c.invitation.id,token:c.invitation.token,loginId,password,confirmPassword:password};
  await call(null,'POST','/auth/login',{loginId,password},401);
  await call(null,'POST','/auth/accept-invitation',{...input,tenantId:operatorTenant.id},403);
  await call(null,'POST','/auth/accept-invitation',{...input,loginId:'different-'+run},403);
  await call(null,'POST','/auth/accept-invitation',{...input,token:'a'.repeat(64)},403);
  await call(null,'POST','/auth/accept-invitation',{...input,token:'invalid'},400);
  if(label==='B'){
   await db.invitation.update({where:{id:input.invitationId},data:{expiresAt:new Date(0)}});
   await call(null,'POST','/auth/accept-invitation',input,403);
   const reissued=await call(operator,'POST',`/tenants/${id}/invitations/${input.invitationId}/reissue`,undefined,201);
   await call(null,'POST','/auth/accept-invitation',input,403);
   input.invitationId=reissued.id;input.token=reissued.token;
  }
  if(label==='A'){
   const statuses=await Promise.all([1,2].map(()=>fetch(origin+'/api/auth/accept-invitation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(r=>r.status)));
   assert.deepEqual(statuses.sort(),[200,403]);checks++;
  }else await call(null,'POST','/auth/accept-invitation',input);
  await call(null,'POST','/auth/accept-invitation',input,403);
  await call(operator,'POST',`/tenants/${id}/invitations/${input.invitationId}/reissue`,undefined,403);
  const login=await call(null,'POST','/auth/login',{loginId,password});const token=login.accessToken;assert.equal(login.tenant.id,id);checks++;
  await call(token,'POST',`/tenants/${id}/invitations/${input.invitationId}/reissue`,undefined,403);
  await call(token,'GET',`/tenants/${id}/invitations`,undefined,403);
  assert.equal((await call(token,'GET','/setup/readiness')).ready,false);checks++;
  await call(token,'POST','/shifts',{month:'2032-02'},403);
  // Reading defaults is not confirmation of the customer's requirements.
  await call(token,'GET','/settings/shifts');await call(token,'GET','/settings/class-requirements');await call(token,'GET','/work-patterns');
  let ready=await call(token,'GET','/setup/readiness');assert.equal(ready.items.find(i=>i.id==='classes').status,'IN_PROGRESS');checks++;
  await call(token,'PATCH','/setup/tenant',{name:'匿名園'+label,contactEmail:'anonymous-'+label.toLowerCase()+'@example.invalid'});
  const staff=[];
  for(let i=0;i<(label==='A'?2:5);i++)staff.push(await call(token,'POST','/staff',{employeeNumber:'ANON'+i,displayName:'匿名職員'+String.fromCharCode(65+i),employmentType:'FULL_TIME',assignedClass:'FREE',canWorkEarly:true,canWorkRegular:true,canWorkLate:true,earlyShiftOnly:false,lateShiftOnly:false,canWorkSaturdays:false},201));
  await call(token,'PATCH','/settings/shifts',{weekdayEarlyRequired:0,weekdayLateRequired:0,saturdayMinimumStaff:0,saturdayEarlyRequired:0,saturdayLateRequired:0,saturdayOperationEnabled:false,sundayOperationEnabled:false,maxConsecutiveWorkDays:5,defaultStartNormal:'09:00',defaultEndNormal:'18:00',defaultBreakMinutes:60});
  await call(token,'PATCH','/settings/class-requirements',{requirements:Array.from({length:6},(_,i)=>({classType:'AGE_'+i,weekdayRequired:i===0?1:0,saturdayRequired:0,isActive:i===0}))});
  if(label==='B'){
   for(let i=0;i<2;i++){const d=await call(token,'POST','/departments',{code:'GROUP_'+i,name:'匿名部署'+i,displayOrder:i,isActive:true},201);await call(token,'POST',`/staff/${staff[i].id}/departments`,{departmentId:d.id,isPrimary:true},201);}
   await call(token,'POST','/work-patterns',{code:'CUSTOM_DAY',name:'匿名日勤',shortName:'日',displayOrder:10,startTime:'09:00',endTime:'17:00',breakMinutes:60,isWorking:true,isDefault:false,isActive:true},403);
   await call(operator,'PUT',`/platform/tenants/${id}/features`,{featureCode:'ADVANCED_WORK_PATTERNS',enabled:true,source:'MANUAL'});
   await call(token,'POST','/work-patterns',{code:'CUSTOM_DAY',name:'匿名日勤',shortName:'日',displayOrder:10,startTime:'09:00',endTime:'17:00',breakMinutes:60,isWorking:true,isDefault:false,isActive:true},201);
  }
  ready=await call(token,'GET','/setup/readiness');assert.equal(ready.ready,true);assert(ready.items.filter(i=>i.level==='HARD').every(i=>i.status==='COMPLETE'));checks+=2;
  const legal=await db.tenant.findUnique({where:{id}});assert.equal(legal.termsAcceptedAt,null);assert.equal(legal.setupCompletedAt,null);checks+=2;
  const shift=await call(token,'POST','/shifts',{month:'2032-02'},201);
  tenants.push({id,token,loginId,staff,shift,invitationId:input.invitationId});
 }
 if(process.env.PRODUCT_PHASE4==='true') await require('./product-phase4-monthly.cjs')({call,db,tenants,operator,password,run,uids});
 const [a,b]=tenants;
 const snapshot=async()=>JSON.stringify(await db.tenant.findUnique({where:{id:b.id},include:{staff:true,departments:true,subscription:true,workPatterns:true}}));const before=await snapshot();
 const foreign=await call(a.token,'GET','/setup/readiness?tenantId='+b.id);assert(!JSON.stringify(foreign).includes(b.id));checks++;
 await call(a.token,'PATCH','/setup/tenant',{tenantId:b.id,name:'匿名園A更新',contactEmail:'anonymous-a@example.invalid'});
 await call(a.token,'GET',`/staff/${b.staff[0].id}`,undefined,404);
 await call(a.token,'POST',`/staff/${b.staff[0].id}/departments`,{departmentId:(await db.department.findFirst({where:{tenantId:b.id}})).id,isPrimary:true},404);
 await call(a.token,'GET',`/tenants/${b.id}/invitations`,undefined,403);
 await call(a.token,'POST',`/tenants/${b.id}/invitations/${b.invitationId}/reissue`,undefined,403);
 assert.equal(await snapshot(),before);checks++;
 const savedMembership=await db.membership.findUnique({where:{tenantId_userId:{tenantId:a.id,userId:uids[1]}}});
 await db.membership.update({where:{tenantId_userId:{tenantId:savedMembership.tenantId,userId:savedMembership.userId}},data:{role:'STAFF'}});
 await call(a.token,'GET','/setup/readiness',undefined,403);
 const staffToken=(await call(null,'POST','/auth/login',{loginId:a.loginId,password})).accessToken;
 await call(staffToken,'GET','/setup/readiness',undefined,403);
 await call(staffToken,'PATCH','/setup/tenant',{name:'denied',contactEmail:'anon@example.invalid'},403);
 await db.membership.update({where:{tenantId_userId:{tenantId:savedMembership.tenantId,userId:savedMembership.userId}},data:{role:'ADMIN'}});
 const sub=await db.tenantSubscription.findUnique({where:{tenantId:a.id}});
 for(const update of [{trialEndsAt:null},{trialEndsAt:new Date(0)},{trialStartedAt:new Date(Date.now()+86400000)},{status:'SUSPENDED'}]){
  await db.tenantSubscription.update({where:{tenantId:a.id},data:update});await call(a.token,'GET','/setup/readiness',undefined,403);
  await call(a.token,'POST','/shifts',{month:'2032-03'},403);
  if(process.env.PRODUCT_PHASE4==='true')await call(a.token,'POST',`/shifts/${a.shift.id}/generate`,undefined,403);
  await db.tenantSubscription.update({where:{tenantId:a.id},data:{trialStartedAt:sub.trialStartedAt,trialEndsAt:sub.trialEndsAt,status:sub.status}});
 }
 process.env.RATE_LIMIT_ENABLED='true';
 for(let i=0;i<11;i++)await call(null,'POST','/auth/accept-invitation',{loginId:'rate-probe-'+run},i<10?400:429);
 process.env.RATE_LIMIT_ENABLED='false';
 if(process.env.PHASE3_BROWSER==='true'||process.env.PHASE4_BROWSER==='true'){
  // Serve the built Web app with a loopback-only API proxy. No external services.
  const express=require('express'),path=require('node:path');const web=express();
  web.use('/api',express.raw({type:()=>true}),async(req,res)=>{const r=await fetch(origin+'/api'+req.url,{method:req.method,headers:{'content-type':req.headers['content-type']||'application/json',...(req.headers.authorization?{authorization:req.headers.authorization}:{})},...(!['GET','HEAD'].includes(req.method)?{body:req.body}:{})});res.status(r.status).type(r.headers.get('content-type')||'application/json').send(Buffer.from(await r.arrayBuffer()));});
  web.use(express.static(path.resolve(__dirname,'../../web/dist')));server=web.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  if(process.env.PHASE4_BROWSER==='true')await require('./product-phase4-browser.cjs')({base:'http://127.0.0.1:'+server.address().port,password,tenants});
  if(process.env.PHASE3_BROWSER==='true')await require('./product-phase3-browser.cjs')({base:'http://127.0.0.1:'+server.address().port,operatorLogin:operatorUser.loginId,password,tenants,run,track:async()=>{const rows=await db.tenant.findMany({where:{code:{startsWith:'ui-'+run}}});for(const row of rows){if(!tids.includes(row.id))tids.push(row.id);for(const m of await db.membership.findMany({where:{tenantId:row.id}}))if(!uids.includes(m.userId))uids.push(m.userId);}}});
 }
 if(process.env.PRODUCT_PHASE5==='true')await require('./product-phase5-contracts.cjs')({call,db,tenants,operator,password,origin,operatorLogin:operatorUser.loginId,run,uids});
 console.log(`PRODUCT Phase3 PASS: ${checks} HTTP/data assertions; two anonymous tenants, invitations, setup, Fail Closed, isolation.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(db){for(const id of tids.reverse())await db.tenant.delete({where:{id}});for(const id of uids)await db.user.delete({where:{id}});}if(app)await app.close();});
