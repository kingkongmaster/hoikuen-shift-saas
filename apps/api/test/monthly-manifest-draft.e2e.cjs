'use strict';
// Local-only audit harness. Private monthly manifests stay outside Git; every displayed name is synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
require('./helpers/isolated-database.cjs').resolveIsolatedDatabaseUrl();
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const get=n=>require('../dist/'+n);
const {ManagerResolutionService}=get('presentation/shifts/manager-resolution.service');
const {MonthlyGenerationContextBuilder}=get('application/shifts/monthly-generation-context-builder');
const {ShiftsService}=get('presentation/shifts/shifts.service');
const {SettingsService}=get('presentation/settings/settings.service');
const {WorkPatternsService}=get('presentation/work-patterns/work-patterns.service');
const {FeaturesService}=get('presentation/features/features.service');
const {SubscriptionsService}=get('presentation/subscriptions/subscriptions.service');
const {AuditService}=get('presentation/audit/audit.service');
const {validateGenerationContext}=get('application/shifts/generation-preflight-validator');
const {draftScope,submitAnswer}=get('application/manager-resolution/resolution');
const {applyMonthlyAnswers}=get('application/manager-resolution/monthly-effects');
const {expectedStaff}=require('../scripts/lib/formal-package-adapter.cjs');
const manifestPath=process.argv[2],reportPath=process.argv[3];let phase='input';
function cli(script,args){const r=spawnSync(process.execPath,[path.join(__dirname,'../scripts',script),...args],{env:process.env,encoding:'utf8'});if(r.status!==0){console.error(r.stderr.match(/MONTHLY_APPROVED_IMPORT_HOLD [A-Z_]+/)?.[0]??'CLI_FAILED');throw Error('CLI_FAILED');}}
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function baseline(id){const out={};for(const table of ['staff','department','staffAttributeAssignment','staffDepartmentAssignment','workPattern','shiftStaffingRequirement','conditionalShiftStaffingRequirement','classStaffingRequirement','tenantFeature'])out[table]=await p[table].findMany({where:{tenantId:id},orderBy:{id:'asc'}});out.rules=await p.staffWorkRule.findMany({where:{tenantId:id,startDate:null},orderBy:{id:'asc'}});return hash(out);}
async function monthly(id){const out={};for(const table of ['tenantEvent','shiftRequest','tenantRuleException','tenantClosedDate'])out[table]=await p[table].findMany({where:{tenantId:id},orderBy:{id:'asc'}});out.rules=await p.staffWorkRule.findMany({where:{tenantId:id,startDate:{not:null}},orderBy:{id:'asc'}});return hash(out);}
async function main(){
 assert(manifestPath&&reportPath);const manifest=JSON.parse(fs.readFileSync(manifestPath));assert.equal(manifest.month,'2026-09');
 phase='fixture';const t=await p.tenant.create({data:{name:'Anonymous manifest '+randomUUID()}});const u=await p.user.create({data:{displayName:'Anonymous administrator',passwordHash:'DISABLED_TEST_ACCOUNT'}});await p.membership.create({data:{tenantId:t.id,userId:u.id,role:'ADMIN'}});
 for(let i=1;i<=23;i++){const code='S'+String(i).padStart(3,'0');const source=expectedStaff(code);const {departmentCode,provenance,generatorEligible,isFoodService,...data}=source;await p.staff.create({data:{...data,tenantId:t.id,employeeNumber:code,displayName:'Anonymous '+i}});}
 cli('apply-musubi-tenant-master.cjs',['--tenant-id',t.id,'--apply']);
 const audit=new AuditService(p),notify={notifyRoles:async()=>{},notifyTenant:async()=>{}},features=new FeaturesService(p,new SubscriptionsService(p,audit,notify),audit),patterns=new WorkPatternsService(p,features,audit),contexts=new MonthlyGenerationContextBuilder(p,features),reviews=new ManagerResolutionService(p,contexts),settings=new SettingsService(p,audit),shifts=new ShiftsService(p,settings,notify,audit,patterns,features,contexts,reviews),actor={tenantId:t.id,sub:u.id,role:'ADMIN'};
 const schedule=await shifts.create(actor,'2026-09'),before=await baseline(t.id),empty=await monthly(t.id);
 phase='dry-run';const args=['--manifest',manifestPath,'--tenant-id',t.id];cli('import-monthly-input-manifest.cjs',args);assert.equal(await monthly(t.id),empty);
 phase='apply';cli('import-monthly-input-manifest.cjs',[...args,'--apply']);const imported=await monthly(t.id);phase='reapply';cli('import-monthly-input-manifest.cjs',[...args,'--apply']);assert.equal(await monthly(t.id),imported);assert.equal(await baseline(t.id),before);
 const items=await reviews.rows(t.id,'2026-09');assert.equal(items.length,25);assert.equal(new Set(items.map(i=>i.groupId)).size,7);const scope=draftScope(items,t.id,'2026-09');assert.equal(scope.blockedCells.length,25);
 const counts={staff:await p.staff.count({where:{tenantId:t.id}}),requests:await p.shiftRequest.count({where:{tenantId:t.id}}),events:await p.tenantEvent.count({where:{tenantId:t.id}}),closedDates:await p.tenantClosedDate.count({where:{tenantId:t.id}}),open:items.length,groups:scope.reviewCount};
 phase='generate';const generated=await shifts.generate(actor,schedule.id);
 phase='audit';const context=await contexts.build(t.id,new Date('2026-09-01T00:00:00Z'),schedule.id);
 for(const key of scope.blockedCells){const [staffId,date]=JSON.parse(key);assert(!context.assignments.some(a=>a.staffId===staffId&&a.workDate.toISOString().slice(0,10)===date),'OPEN cell filled');}
 assert(context.assignments.length>0);assert.equal(await baseline(t.id),before);assert.equal(await monthly(t.id),imported);assert.equal((await p.monthlyShift.findUnique({where:{id:schedule.id}})).status,'DRAFT');
 await assert.rejects(()=>shifts.confirm(actor,schedule.id));
 const diagnostics=validateGenerationContext(context,'CONFIRM');const warnings=generated.warnings??[];
 const buckets=rows=>Object.fromEntries([...new Set(rows.map(r=>r.code))].sort().map(code=>[code,rows.filter(r=>r.code===code).length]));
 const patternCounts={};for(const a of context.assignments){const code=a.workPattern?.code??a.shiftType;patternCounts[code]=(patternCounts[code]??0)+1;}
 let answerMappings=0;
 // Exercise every offered answer against the actual isolated baseline without persisting answers.
 const unchanged=hash(context);
 for(const item of items)for(const option of item.options){
  const answer={option,...(item.kind==='EARLY_DEPARTURE'?{time:'15:00'}:{}),...(option==='OTHER_TIME'?{startTime:'08:30',endTime:'17:00'}:{})};
  const pending=submitAnswer(item,{tenantId:t.id,userId:u.id,role:'ADMIN'},1,answer,new Date().toISOString());
  const applied=applyMonthlyAnswers(context,[{...pending,status:'RESOLVED'}]);
  assert.equal(pending.status,'ANSWERED_PENDING_REEVALUATION');assert.equal(hash(context),unchanged);
  if(option==='NO_ROTATION')assert(applied.workRules.some(r=>r.staffId===item.staffIds[0]&&r.workPattern?.code==='NO_ROTATION'));
  answerMappings++;
 }
 const rotationCodes=new Set(['EARLY','P02','P03','P04','P05','LATE']);
 const rotationCounts=context.staff.filter(s=>!context.excludedStaffIds.has(s.id)).map(s=>context.assignments.filter(a=>a.staffId===s.id&&rotationCodes.has(a.workPattern?.code)).length);
 const formalSourceAudit={earlyDeparture:manifest.dateFixedRules.filter(r=>r.endTime).map(r=>{const staff=context.staff.find(s=>s.employeeNumber===r.staffCode),a=context.assignments.find(a=>a.staffId===staff.id&&a.workDate.toISOString().slice(0,10)===r.date);return {date:r.date,match:a?.startTime===r.startTime&&a?.endTime===r.endTime};}),noRotation:manifest.dateFixedRules.filter(r=>r.patternCode==='NO_ROTATION').every(r=>{const staff=context.staff.find(s=>s.employeeNumber===r.staffCode);return context.assignments.some(a=>a.staffId===staff.id&&a.workDate.toISOString().slice(0,10)===r.date&&a.workPattern?.code==='NO_ROTATION'&&a.shiftType!=='OFF');}),halfDayModifiers:context.assignments.filter(a=>a.attendanceModifier).length,weeklyThirdExceptions:generated.approvedWeeklyThirdAssignments.length,weeklyRelaxations:generated.weeklyPatternRelaxations.length,rotationRange:[Math.min(...rotationCounts),Math.max(...rotationCounts)],fairnessStatus:'HETEROGENEOUS_FIXED_RULES_AND_OPEN_CELLS_NOT_FINAL_FAIRNESS',staffing:generated.staffingRequirementEvaluations?.filter(e=>!e.isSatisfied).map(e=>({date:e.date,code:e.code,required:e.requiredCount,actual:e.actualCount,shortage:e.shortageCount}))};
 const diagnosticDetails=diagnostics.filter(d=>d.severity==='ERROR').map(d=>{const a=context.assignments.find(a=>a.staffId===d.staffId&&a.workDate.toISOString().slice(0,10)===d.date);const r=context.approvedRequests.find(r=>r.staffId===d.staffId&&r.requestDate.toISOString().slice(0,10)===d.date);return {code:d.code,date:d.date,assigned:a?.workPattern?.code??a?.shiftType,approvedRequest:r?.requestType};});
 const weekdayFixed=new Set(context.workRules.filter(r=>r.ruleType==='FIXED_WORK_PATTERN'&&!r.startDate&&r.dayOfWeek>=1&&r.dayOfWeek<=5&&r.workPattern?.code!=='NO_ROTATION').map(r=>r.staffId));
 const comparable=context.staff.filter(s=>!context.excludedStaffIds.has(s.id)&&!weekdayFixed.has(s.id)).map(s=>context.assignments.filter(a=>a.staffId===s.id&&rotationCodes.has(a.workPattern?.code)).length);
 formalSourceAudit.comparableRotation={staff:comparable.length,min:Math.min(...comparable),max:Math.max(...comparable)};
 const exempt=new Set(context.attributes.filter(a=>a.attributeDefinition.code==='WEEKLY_PATTERN_GROUP_LIMIT_EXEMPT').map(a=>a.staffId));const automatic=new Map();
 for(const a of context.assignments){if(!rotationCodes.has(a.workPattern?.code)||exempt.has(a.staffId))continue;const fixed=context.workRules.some(r=>r.staffId===a.staffId&&r.ruleType==='FIXED_WORK_PATTERN'&&(!r.startDate||r.startDate<=a.workDate)&&(!r.endDate||r.endDate>=a.workDate)&&(r.dayOfWeek==null||r.dayOfWeek===a.workDate.getUTCDay()));if(fixed)continue;const week=new Date(a.workDate);week.setUTCDate(week.getUTCDate()-(week.getUTCDay()+6)%7);const key=a.staffId+week.toISOString();automatic.set(key,(automatic.get(key)??0)+1);}
 formalSourceAudit.automaticWeeklyMaximum=Math.max(0,...automatic.values());assert(formalSourceAudit.automaticWeeklyMaximum<=2);assert.equal(formalSourceAudit.weeklyThirdExceptions,0);
 const report={diagnosticDetails,answerMappings,formalSourceAudit,status:'DRAFT_GENERATED_WITH_OPEN_ITEMS',tenantId:t.id,monthlyShiftId:schedule.id,counts,assignments:context.assignments.length,unresolvedAssignments:0,hardDiagnostics:buckets(diagnostics.filter(d=>d.severity==='ERROR')),warnings:buckets(warnings),patternCounts,baselineUnchanged:true,monthlyInputsUnchanged:true,finalWritten:0,productionConnected:false,warningDetails:warnings.map(w=>({code:w.code,severity:w.level??w.severity,date:w.workDate??null}))};
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({...report,tenantId:undefined,monthlyShiftId:undefined,warningDetails:undefined}));
}
main().catch(e=>{console.error('MANIFEST_DRAFT_HOLD phase='+phase+' code='+(e.code??e.name));console.error(e.stack?.split('\n').filter(l=>l.trim().startsWith('at ')).slice(0,2).join('\n'));if(e.getResponse)console.error(JSON.stringify(e.getResponse().diagnostics?.map(d=>({code:d.code,date:d.date}))));process.exitCode=1;}).finally(()=>p.$disconnect());
