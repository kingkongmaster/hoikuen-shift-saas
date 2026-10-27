// No malicious compressed frames: valid payloads test rejection before decompression.
const assert=require('node:assert/strict'),fs=require('node:fs'),{gzipSync,deflateSync,brotliCompressSync}=require('node:zlib');
const {randomUUID,scryptSync}=require('node:crypto');
const {resolveIsolatedDatabaseUrl,resolveLocalApiBaseUrl}=require('./helpers/isolated-database.cjs');resolveIsolatedDatabaseUrl();
const base=resolveLocalApiBaseUrl(),{PrismaClient}=require('@prisma/client'),db=new PrismaClient(),checks=[];
async function call(route,body,headers={}){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body});const text=await r.text();assert.ok(!text.includes('passwordHash')&&!text.includes('stack'));return {status:r.status,text};}
(async()=>{
 for(const [route,body,headers,status] of [
  ['/auth/login','{',{},400],
  ['/auth/login',JSON.stringify({email:'nobody@example.invalid',password:'invalid-password'}),{},401],
  ['/auth/login','email=nobody&password=x',{'Content-Type':'application/x-www-form-urlencoded'},400],
  ['/auth/login',JSON.stringify({x:'a'.repeat(10*1024*1024)}),{},413],
  ...[['gzip',gzipSync],['deflate',deflateSync],['br',brotliCompressSync]].map(([encoding,fn])=>['/auth/login',fn(Buffer.from('{"test":"anonymous"}')),{'Content-Encoding':encoding},415]),
  ['/closed-dates',undefined,{},401],['/health',undefined,{},200],['/ready',undefined,{},200],
 ]){const r=await call(route,body,headers);assert.equal(r.status,status,route+' '+r.text);checks.push({route,status});}
 const tenant=await db.tenant.create({data:{name:'匿名Security検証園',setupStatus:'COMPLETED'}}),salt=randomUUID(),password='Anonymous-security-only!';
 const user=await db.user.create({data:{email:randomUUID()+'@example.invalid',displayName:'匿名管理者',passwordHash:salt+':'+scryptSync(password,salt,64).toString('hex')}});
 await db.membership.create({data:{tenantId:tenant.id,userId:user.id,role:'ADMIN'}});
 const login=await call('/auth/login',JSON.stringify({email:user.email,password}));assert.equal(login.status,200);const token=JSON.parse(login.text).accessToken;
 const r=await call('/closed-dates?month=2026-11',undefined,{Authorization:'Bearer '+token});assert.equal(r.status,200);checks.push({normalJSONLogin:'PASS',authenticatedRead:'PASS'});
 const other=await db.tenant.create({data:{name:'匿名別園',setupStatus:'COMPLETED'}});
 const row=await db.tenantClosedDate.create({data:{tenantId:other.id,closedDate:new Date('2026-11-03'),name:'別園限定'}});
 assert.ok(!r.text.includes('別園限定'));
 const cross=await fetch(base+'/closed-dates/'+row.id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});assert.equal(cross.status,404);
 const staffUser=await db.user.create({data:{email:randomUUID()+'@example.invalid',displayName:'匿名職員',passwordHash:user.passwordHash}});
 await db.membership.create({data:{tenantId:tenant.id,userId:staffUser.id,role:'STAFF'}});
 const staffLogin=await call('/auth/login',JSON.stringify({email:staffUser.email,password}));assert.equal(staffLogin.status,200);
 const staffToken=JSON.parse(staffLogin.text).accessToken;
 assert.equal((await call('/closed-dates',JSON.stringify({closedDate:'2026-11-03',name:'拒否対象'}),{Authorization:'Bearer '+staffToken})).status,403);
 assert.ok(await db.tenantClosedDate.findUnique({where:{id:row.id}}));
 checks.push({tenantBoundary:'PASS',staffWriteDenied:'PASS'});
 console.log(JSON.stringify({status:'PASS',checks}));if(process.env.SECURITY_RESULT)fs.writeFileSync(process.env.SECURITY_RESULT,JSON.stringify({status:'PASS',checks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
