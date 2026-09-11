const assert = require('node:assert/strict');
const {resolveLocalApiBaseUrl,resolveIsolatedDatabaseUrl}=require('./helpers/isolated-database.cjs');
process.env.DATABASE_URL=resolveIsolatedDatabaseUrl();
const {PrismaClient}=require('@prisma/client');const prisma=new PrismaClient();let scheduleId;
async function main(){
 const base=resolveLocalApiBaseUrl();
 const response=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.SEED_OWNER_EMAIL||'owner@demo.enshift.local',password:process.env.SEED_OWNER_PASSWORD||'ChangeMe123!'})});
 assert.equal(response.status,200);const {accessToken}=await response.json();
 const headers={authorization:`Bearer ${accessToken}`,'content-type':'application/json'};
 for(const route of ['export','validate','preview-restore']){
  const result=await fetch(base+'/backups/'+route,{method:'POST',headers,body:'{"backup":{}}'});
  assert.equal(result.status,403,route);
 }
 assert.equal((await fetch(base+'/backups/export',{method:'POST'})).status,401);
 const created=await fetch(base+'/shifts',{method:'POST',headers,body:'{"month":"2035-02"}'});
 assert.equal(created.status,201,'use an unused isolated month');scheduleId=(await created.json()).id;
 for(const path of ['/exports/staff.csv','/exports/audit.csv','/exports/shift-requests.csv?month=2035-02','/exports/shifts.csv?month=2035-02','/exports/print/shifts?month=2035-02']){
  const result=await fetch(base+path,{headers});
  assert.equal(result.status,200,path+' must remain usable');
 }
 console.log('Beta technical JSON API PASS: administrator denied, unauthenticated denied, CSV/print route preserved');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{if(scheduleId){await prisma.auditLog.deleteMany({where:{targetId:scheduleId}});await prisma.monthlyShift.delete({where:{id:scheduleId}});}await prisma.$disconnect();});
