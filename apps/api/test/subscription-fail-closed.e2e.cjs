const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
process.env.DATABASE_URL=require('./helpers/isolated-database.cjs').resolveIsolatedDatabaseUrl();
process.env.JWT_SECRET='anonymous-local-contract-test-key-123456789';process.env.NODE_ENV='test';
require('reflect-metadata');const {NestFactory}=require('@nestjs/core');const {ValidationPipe}=require('@nestjs/common');const {AppModule}=require('../dist/app.module');const {PrismaService}=require('../dist/infrastructure/database/prisma.service');const {PasswordService}=require('../dist/application/auth/password.service');
let app,db;const tids=[],uids=[];const suffix=randomUUID().slice(0,8);
(async()=>{
 app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.listen(0,'127.0.0.1');db=app.get(PrismaService);const base=await app.getUrl();
 const call=async(path,token,body,method=body?'POST':'GET')=>{const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
 const password='Anonymous-Test-Only-Aa1!';const hash=await app.get(PasswordService).hash(password);const tokens={};
 for(const kind of ['missing','valid','staff']){
  const t=await db.tenant.create({data:{name:'Anonymous '+kind}});tids.push(t.id);
  if(kind!=='missing')await db.tenantSubscription.create({data:{tenantId:t.id,plan:'PROFESSIONAL',status:'ACTIVE',currentPeriodStartedAt:new Date(Date.now()-86400000),currentPeriodEndsAt:new Date(Date.now()+30*86400000),staffLimit:10}});
  const u=await db.user.create({data:{loginId:kind+'-'+suffix,displayName:'Anonymous',passwordHash:hash}});uids.push(u.id);await db.membership.create({data:{tenantId:t.id,userId:u.id,role:kind==='staff'?'STAFF':'ADMIN'}});
  const auth=await call('/auth/login',null,{loginId:u.loginId,password});assert.equal(auth.status,200);tokens[kind]=auth.body.accessToken;
 }
 await db.tenantFeature.create({data:{tenantId:tids[0],featureCode:'ADVANCED_WORK_PATTERNS',enabled:true,source:'MANUAL'}});
 const snapshot=async()=>JSON.stringify(await db.tenant.findUnique({where:{id:tids[1]},include:{subscription:true,staff:true,workPatterns:true}}));const before=await snapshot();
 for(const path of ['/subscription','/features','/work-patterns']){const r=await call(path,tokens.missing);assert.equal(r.status,403,path);assert.equal(r.body.code,'SUBSCRIPTION_UNVERIFIED');}
 const input={employeeNumber:'A01',displayName:'匿名職員A',canWorkEarly:true,canWorkRegular:true,canWorkLate:true,earlyShiftOnly:false,lateShiftOnly:false,canWorkSaturdays:true,employmentType:'FULL_TIME',assignedClass:'FREE'};
 assert.equal((await call('/staff',tokens.missing,input)).status,403);
 assert.equal((await call('/setup/tenant',tokens.missing,{name:'Forbidden',contactEmail:'anonymous@example.invalid'},'PATCH')).status,403);
 assert.equal(await db.staff.count({where:{tenantId:tids[0]}}),0);assert.equal(await db.auditLog.count({where:{tenantId:tids[0]}}),0);
 assert.equal(await snapshot(),before,'other tenant unchanged by rejected requests');
 assert.equal(await db.workPattern.count({where:{tenantId:tids[0]}}),0,'denied feature read must not initialize defaults');
 assert.equal((await call('/subscription',tokens.valid)).status,200);
 assert.ok((await call('/features',tokens.valid)).body.enabledFeatures.includes('ADVANCED_WORK_PATTERNS'));
 assert.equal((await call('/work-patterns',tokens.valid)).status,200);
 assert.equal((await call('/platform/tenants',tokens.valid)).status,403,'tenant ADMIN is not operator');
 assert.equal((await call('/work-patterns',tokens.staff)).status,403);
 assert.equal((await call('/staff',tokens.staff,input)).status,403);
 for(const status of ['SUSPENDED','CANCELLED','EXPIRED']){await db.tenantSubscription.update({where:{tenantId:tids[1]},data:{status}});assert.equal((await call('/features',tokens.valid)).body.enabledFeatures.length,0);assert.equal((await call('/work-patterns',tokens.valid)).status,403);assert.equal((await call('/staff',tokens.valid,input)).status,403);}
 await db.tenantSubscription.update({where:{tenantId:tids[1]},data:{plan:'TRIAL',status:'TRIAL',trialEndsAt:null}});assert.equal((await call('/features',tokens.valid)).status,403);
 await db.tenantSubscription.update({where:{tenantId:tids[1]},data:{trialStartedAt:new Date(Date.now()-86400000),trialEndsAt:new Date(Date.now()+86400000)}});assert.deepEqual((await call('/features',tokens.valid)).body.enabledFeatures,['BASIC_SHIFT_GENERATION']);
 console.log('Subscription fail-closed HTTP/DB PASS: missing contract blocks override/read gated feature/write, valid contract remains available, states and roles enforced, other tenant unchanged.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(db){for(const id of tids)await db.tenant.delete({where:{id}});for(const id of uids)await db.user.delete({where:{id}});}if(app)await app.close();});
