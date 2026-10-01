'use strict';
// Narrow JSON import path: immutable approved monthly inputs, no permanent baseline edits.
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { assertEnvironment, assertDatabaseSafety, recordDryRun, packageDigest } = require('./lib/production-operation-guard.cjs');
const { eventFields, fixedFields, halfDayBaseFields, requestProvenanceFields, dateInMonth, assertSameExisting } = require('./lib/monthly-input-fields.cjs');
const arg = name => process.argv[process.argv.indexOf(name) + 1];
async function main() {
  if (!process.argv.includes('--manifest') || !process.argv.includes('--tenant-id')) throw Error('ARGUMENTS_REQUIRED');
  const tenantId = arg('--tenant-id'), bytes = fs.readFileSync(arg('--manifest')), input = JSON.parse(bytes);
  if (input.schemaVersion !== 1 || input.packageType !== 'MONTHLY_APPROVED_INPUT' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month) || input.referenceOnly || !['events','requests','dateFixedRules'].every(k => Array.isArray(input[k])) || Object.keys(input).some(k=>!['schemaVersion','packageType','month','events','requests','dateFixedRules'].includes(k))) throw Error('INVALID_MANIFEST');
  const mode = process.argv.includes('--apply') ? 'APPLY' : 'DRY_RUN';
  const operation = `monthly-approved-${input.month}`;
  const guard = assertEnvironment({tenantId, operation, mode, packageDigest: packageDigest(bytes)});
  const prisma = new PrismaClient();
  try {
    await assertDatabaseSafety(prisma, tenantId);
    await prisma.$transaction(async tx => {
      const tenant = await tx.tenant.findUnique({where:{id:tenantId}}); if (!tenant) throw Error('TENANT_MISSING');
      await tx.$queryRaw`SELECT id FROM "MonthlyShift" WHERE "tenantId"=${tenantId}::uuid AND "targetMonth"=${new Date(input.month+'-01T00:00:00Z')} FOR UPDATE`;
      const schedule = await tx.monthlyShift.findUnique({where:{tenantId_targetMonth:{tenantId,targetMonth:new Date(input.month+'-01T00:00:00Z')}}});
      if (schedule?.status === 'CONFIRMED') throw Error('CONFIRMED_MONTH_PROTECTED');
      const staff = await tx.staff.findMany({where:{tenantId,isActive:true}}), patterns = await tx.workPattern.findMany({where:{tenantId,isActive:true}});
      const lookup = {staffCodes:new Set(staff.map(s=>s.employeeNumber)),staffIds:new Map(staff.map(s=>[s.employeeNumber,s.id])),patternCodes:new Set(patterns.map(p=>p.code)),patternIds:new Map(patterns.map(p=>[p.code,p.id])),classCodes:new Set(['AGE_0','AGE_1','AGE_2','AGE_3','AGE_4','AGE_5','FREE'])};
      const rules = input.dateFixedRules.map(row => fixedFields(row,input.month,lookup));
      for (const row of input.events) {
        if (typeof row.name !== 'string' || !row.name.trim() || !['ONSITE','OFFSITE'].includes(row.eventType)) throw Error('INVALID_EVENT');
        const data = {tenantId,name:row.name,eventType:row.eventType,isActive:true,...eventFields(row,input.month,lookup)};
        const old = await tx.tenantEvent.findUnique({where:{tenantId_eventDate_name:{tenantId,eventDate:data.eventDate,name:data.name}}});
        if (old) assertSameExisting(old,data); else if (mode==='APPLY') await tx.tenantEvent.create({data});
      }
      for (const row of input.requests) {
        const staffId = lookup.staffIds.get(row.staffCode);
        if (!staffId || !['DAY_OFF','PAID_LEAVE','HALF_DAY_AM','HALF_DAY_PM','SUMMER_LEAVE','BEREAVEMENT'].includes(row.requestType)) throw Error('INVALID_REQUEST');
        const data = {tenantId,staffId,requestDate:dateInMonth(row.date,input.month),requestType:row.requestType,status:'APPROVED',...requestProvenanceFields(row)};
        if (row.requestType.startsWith('HALF_DAY')) rules.push(halfDayBaseFields(row,input.month,lookup));
        const existing = await tx.shiftRequest.findMany({where:{tenantId,staffId,requestDate:data.requestDate}});
        if (existing.length>1) throw Error('REQUEST_CONFLICT');
        if (existing.length) assertSameExisting(existing[0],data); else if (mode==='APPLY') await tx.shiftRequest.create({data});
      }
      for (const fields of rules) {
        const data={tenantId,...fields,isActive:true};
        const existing=await tx.staffWorkRule.findMany({where:{tenantId,staffId:data.staffId,ruleType:'FIXED_WORK_PATTERN',isActive:true,OR:[{startDate:null},{startDate:{lte:data.startDate}}],AND:[{OR:[{endDate:null},{endDate:{gte:data.endDate}}]},{OR:[{dayOfWeek:null},{dayOfWeek:data.startDate.getUTCDay()}]}]}});
        if (existing.length>1) throw Error('FIXED_RULE_CONFLICT');
        if (existing.length) assertSameExisting(existing[0],data); else if (mode==='APPLY') await tx.staffWorkRule.create({data});
      }
    },{isolationLevel:'Serializable'});
    if(mode==='DRY_RUN') recordDryRun(operation,tenantId,guard);
    console.log(JSON.stringify({mode,month:input.month,events:input.events.length,requests:input.requests.length,dateFixedRules:input.dateFixedRules.length}));
  } finally {await prisma.$disconnect();}
}
main().catch(()=>{process.stderr.write('MONTHLY_APPROVED_IMPORT_HOLD\n');process.exitCode=1;});
