const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
module.exports=async({db,tenantIds,ticketId,applicationId})=>{
 const url=new URL(require('./helpers/isolated-database.cjs').resolveIsolatedDatabaseUrl());assert.equal(url.hostname,'127.0.0.1');
 const root=path.resolve(__dirname,'../../..'),out=path.join(root,'output/product-phase6/backup');fs.mkdirSync(out,{recursive:true,mode:0o700});
 const target='aen_phase6_restore_verify_'+randomUUID().slice(0,8),env={...process.env,PGHOST:url.hostname,PGPORT:url.port,PGUSER:url.username,PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:url.pathname.slice(1),BACKUP_DIRECTORY:out,BACKUP_ENVIRONMENT:'phase6_isolated',OFFHOST_COPY_ENABLED:'false',RESTORE_DATABASE:target,VERIFY_MONTH:'2032-02',RESTORE_REPORT_PATH:path.join(out,'restore-report.json'),TEST_DATABASE_ISOLATED:'true'};
 const dump=execFileSync('sh',[path.join(root,'ops/postgres-backup/backup.sh')],{env,encoding:'utf8'}).trim().split('\n').at(-1);env.BACKUP_FILE=dump;
 // Existing restore script refuses overwrite and validates hash/mode before restore.
 execFileSync('sh',[path.join(root,'ops/postgres-backup/restore-verify.sh')],{env,stdio:'pipe'});
 const {PrismaClient}=require('@prisma/client'),restoredUrl=new URL(url);restoredUrl.pathname='/'+target;
 const restored=new PrismaClient({datasources:{db:{url:restoredUrl.toString()}}});
 try{
  for(const [model,args] of [
   ['tenantSubscription',{where:{tenantId:{in:tenantIds}},orderBy:{tenantId:'asc'}}],
   ['supportTicket',{where:{id:ticketId},include:{messages:{orderBy:{id:'asc'}}}}],
   ['productApplication',{where:{id:applicationId}}],
   ['auditLog',{where:{tenantId:{in:tenantIds}},orderBy:{id:'asc'}}],
   ['membership',{where:{tenantId:{in:tenantIds}},orderBy:[{tenantId:'asc'},{userId:'asc'}]}],
   ['monthlyShift',{where:{tenantId:{in:tenantIds}},orderBy:{id:'asc'}}]
  ]) assert.deepEqual(JSON.parse(JSON.stringify(await restored[model].findMany(args))),JSON.parse(JSON.stringify(await db[model].findMany(args))),model+' restored equality');
  const {verifyContract}=require('../dist/domain/subscriptions/contract-policy');for(const s of await restored.tenantSubscription.findMany({where:{tenantId:{in:tenantIds}}}))assert.equal(verifyContract(s,s.tenantId).status,'TRIAL');
  const {NestFactory}=require('@nestjs/core'),{AppModule}=require('../dist/app.module');
  const original=process.env.DATABASE_URL;let app;
  try{process.env.DATABASE_URL=restoredUrl.toString();app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');await app.listen(0,'127.0.0.1');const origin=await app.getUrl();const users=[];
   for(const id of tenantIds.slice(0,2)){const m=await restored.membership.findFirst({where:{tenantId:id,role:'ADMIN'},include:{user:true}});const r=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({loginId:m.user.loginId,password:'Anonymous-Onboarding-Aa1!'})});assert.equal(r.status,200);users.push(await r.json());}
   const r=await fetch(origin+'/api/support/tickets/'+ticketId,{headers:{Authorization:'Bearer '+users[1].accessToken}});assert.equal(r.status,404);
   const own=await fetch(origin+'/api/support/tickets/'+ticketId,{headers:{Authorization:'Bearer '+users[0].accessToken}});assert.equal(own.status,200);
  }finally{process.env.DATABASE_URL=original;if(app)await app.close();}
  // Corruption must stop before any restoration; retain the valid original dump.
  const corrupt=dump+'.corrupt';fs.copyFileSync(dump,corrupt);fs.chmodSync(corrupt,0o600);fs.appendFileSync(corrupt,'corrupt');fs.copyFileSync(dump+'.sha256',corrupt+'.sha256');fs.chmodSync(corrupt+'.sha256',0o600);
  assert.throws(()=>execFileSync('sh',[path.join(root,'ops/postgres-backup/restore-verify.sh')],{env:{...env,BACKUP_FILE:corrupt,RESTORE_DATABASE:target+'_bad'},stdio:'pipe'}));
  assert.throws(()=>execFileSync('sh',[path.join(root,'ops/postgres-backup/restore-verify.sh')],{env,stdio:'pipe'}));
  fs.unlinkSync(corrupt);fs.unlinkSync(corrupt+'.sha256');
  console.log('Phase6 backup/restore PASS: existing scripts, SHA256, new isolated DB, contracts/consent/support/membership/monthly/audit equality, login and tenant boundary; corruption/overwrite refused.');
 }finally{await restored.$disconnect();execFileSync('dropdb',['--maintenance-db','postgres',target],{env,stdio:'pipe'});}
};
