import { createHash } from 'node:crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service';

// Select only structured, non-identifying setup data. Never expose staff names, reasons or provenance text here.
export async function workforceReview(prisma: PrismaService, tenantId: string, fiscalYearStartMonth: number) {
  const [staff, patterns, requirements, rules, departments, attributes] = await Promise.all([
    prisma.staff.count({ where: { tenantId, isActive: true } }),
    prisma.workPattern.findMany({ where: { tenantId, isActive: true }, orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }], select: { code: true, name: true, startTime: true, endTime: true, isWorking: true } }),
    prisma.shiftStaffingRequirement.findMany({ where: { tenantId, isActive: true }, orderBy: { code: 'asc' }, select: { workPattern: { select: { name: true } }, attributeDefinition: { select: { name: true } }, classType: true, dayOfWeek: true, startDate: true, endDate: true, requiredCount: true, constraintLevel: true } }),
    prisma.staffWorkRule.findMany({ where: { tenantId, isActive: true, staff: { isActive: true } }, select: { staffId: true, ruleType: true, dayOfWeek: true, startDate: true, endDate: true, startTime: true, endTime: true, numericValue: true, isHardConstraint: true, workPattern: { select: { name: true } } } }),
    prisma.department.findMany({ where: { tenantId, isActive: true }, orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }], select: { name: true, staffAssignments: { where: { isActive: true, staff: { isActive: true } }, select: { staffId: true } } } }),
    prisma.staffAttributeAssignment.findMany({ where: { tenantId, staff: { isActive: true }, isActive: true, attributeDefinition: { isActive: true, code: { in: ['GENERATOR_EXCLUDED', 'FIXED_ASSIGNMENT'] } } }, select: { staffId: true, attributeDefinition: { select: { code: true } } } }),
  ]);
  const grouped = new Map<string, Set<string>>();
  for (const { staffId, ...rule } of rules) { const key = JSON.stringify(rule); if (!grouped.has(key)) grouped.set(key, new Set()); grouped.get(key)!.add(staffId); }
  const excluded = new Set(attributes.filter(a => a.attributeDefinition.code === 'GENERATOR_EXCLUDED').map(a => a.staffId));
  const fixed = new Set(attributes.filter(a => a.attributeDefinition.code === 'FIXED_ASSIGNMENT').map(a => a.staffId));
  const summary = {
    fiscalYearStartMonth, staffCount: staff, generatorCount: staff - excluded.size, excludedCount: excluded.size, fixedAttributeCount: fixed.size,
    patterns, requirements,
    rules: [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([key, ids]) => ({ ...JSON.parse(key), staffCount: ids.size })),
    departments: departments.map(d => ({ name: d.name, staffCount: new Set(d.staffAssignments.map(a => a.staffId)).size, fixedCount: new Set(d.staffAssignments.filter(a => fixed.has(a.staffId)).map(a => a.staffId)).size, excludedCount: new Set(d.staffAssignments.filter(a => excluded.has(a.staffId)).map(a => a.staffId)).size })),
  };
  const digest = createHash('sha256').update(JSON.stringify(summary)).digest('hex');
  const evidence = await prisma.auditLog.findMany({ where: { tenantId, action: 'SETUP_STEP_UPDATED', detail: { path: ['reviewDigest'], equals: digest } }, select: { detail: true } });
  const sections = evidence.map(e => (e.detail as { confirmedSection?: string })?.confirmedSection);
  return { ...summary, digest, workConfirmed: sections.includes('WORK_SETTINGS'), staffConfirmed: sections.includes('STAFF_CLASSES') };
}
