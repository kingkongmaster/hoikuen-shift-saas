const assert=require('node:assert/strict'); const {randomUUID}=require('node:crypto'); const {PrismaClient,Prisma}=require('@prisma/client');
const {resolveIsolatedDatabaseUrl}=require('./helpers/isolated-database.cjs'); process.env.DATABASE_URL=resolveIsolatedDatabaseUrl(); const prisma=new PrismaClient(); const run=randomUUID().slice(0,8); const tenantIds=[];
async function fk(label,action){await assert.rejects(action,e=>{assert.ok(e instanceof Prisma.PrismaClientKnownRequestError,label);assert.equal(e.code,'P2003',label);return true;});}
async function main(){
  const [a,b]=await Promise.all([prisma.tenant.create({data:{name:`Workforce A ${run}`}}),prisma.tenant.create({data:{name:`Workforce B ${run}`}})]);tenantIds.push(a.id,b.id);
  const [sa,sb,da,db,pa,pb,aa,ab]=await Promise.all([
    prisma.staff.create({data:{tenantId:a.id,employeeNumber:`A-${run}`,displayName:'Anonymous A'}}),prisma.staff.create({data:{tenantId:b.id,employeeNumber:`B-${run}`,displayName:'Anonymous B'}}),
    prisma.department.create({data:{tenantId:a.id,code:`A_${run}`,name:'Department A'}}),prisma.department.create({data:{tenantId:b.id,code:`B_${run}`,name:'Department B'}}),
    prisma.workPattern.create({data:{tenantId:a.id,code:`A_${run}`,name:'Pattern A',shortName:'A'}}),prisma.workPattern.create({data:{tenantId:b.id,code:`B_${run}`,name:'Pattern B',shortName:'B'}}),
    prisma.staffAttributeDefinition.create({data:{tenantId:a.id,code:`A_${run}`,name:'Capability A',category:'SKILL'}}),prisma.staffAttributeDefinition.create({data:{tenantId:b.id,code:`B_${run}`,name:'Capability B',category:'SKILL'}})
  ]);
  await prisma.staffDepartmentAssignment.create({data:{tenantId:a.id,staffId:sa.id,departmentId:da.id}});
  await prisma.staffAttributeAssignment.create({data:{tenantId:a.id,staffId:sa.id,attributeDefinitionId:aa.id}});
  await prisma.shiftStaffingRequirement.create({data:{tenantId:a.id,code:`REQ_${run}`,name:'Pattern capability',attributeDefinitionId:aa.id,workPatternId:pa.id,requiredCount:1,constraintLevel:'HARD'}});
  await prisma.conditionalShiftStaffingRequirement.create({data:{tenantId:a.id,code:`COND_${run}`,name:'Conditional capability',triggerAttributeDefinitionId:aa.id,triggerWorkPatternId:pa.id,triggerCount:2,targetAttributeDefinitionId:aa.id,targetWorkPatternId:pa.id,requiredCount:1,constraintLevel:'HARD'}});
  await fk('department cross tenant',()=>prisma.staffDepartmentAssignment.create({data:{tenantId:a.id,staffId:sa.id,departmentId:db.id}}));
  await fk('attribute assignment cross tenant staff',()=>prisma.staffAttributeAssignment.create({data:{tenantId:a.id,staffId:sb.id,attributeDefinitionId:aa.id}}));
  await fk('attribute assignment cross tenant definition',()=>prisma.staffAttributeAssignment.create({data:{tenantId:a.id,staffId:sa.id,attributeDefinitionId:ab.id}}));
  await fk('staffing requirement cross tenant pattern',()=>prisma.shiftStaffingRequirement.create({data:{tenantId:a.id,code:`BAD_${run}`,name:'Bad',attributeDefinitionId:aa.id,workPatternId:pb.id,requiredCount:1,constraintLevel:'HARD'}}));
  await fk('conditional cross tenant target',()=>prisma.conditionalShiftStaffingRequirement.create({data:{tenantId:a.id,code:`BADCOND_${run}`,name:'Bad conditional',triggerAttributeDefinitionId:aa.id,triggerWorkPatternId:pa.id,triggerCount:1,targetAttributeDefinitionId:ab.id,targetWorkPatternId:pa.id,requiredCount:1,constraintLevel:'HARD'}}));
  console.log('Common workforce foundation DB tests: PASS (4 valid writes, 5 cross-tenant rejections)');
}
main().finally(async()=>{for(const id of tenantIds)await prisma.tenant.delete({where:{id}}).catch(()=>{});await prisma.$disconnect();}).catch(e=>{console.error(e);process.exitCode=1;});
