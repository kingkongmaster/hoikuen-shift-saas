import { createHash } from 'node:crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service';

// Select only structured, non-identifying setup data. Never expose staff names, reasons or provenance text here.
// Aggregate only identical conditions applied to the exact same staff set.
// Matching counts alone do not prove that weekdays refer to the same people.
export function groupFixedRules(rows: Array<{ staffId: string; ruleType: string; dayOfWeek: number | null; [key: string]: unknown }>) {
  const byDay = new Map<string, Set<string>>();
  for (const { staffId, ...rule } of rows.filter(r => r.ruleType === 'FIXED_WORK_PATTERN')) {
    const key = JSON.stringify(rule); if (!byDay.has(key)) byDay.set(key, new Set()); byDay.get(key)!.add(staffId);
  }
  const groups = new Map<string, { rule: Record<string, unknown>; days: Array<number | null>; staffCount: number }>();
  for (const [key, ids] of byDay) {
    const { dayOfWeek, ...rule } = JSON.parse(key);
    const groupKey = JSON.stringify([rule, [...ids].sort(), dayOfWeek === null]);
    if (!groups.has(groupKey)) groups.set(groupKey, { rule, days: [], staffCount: ids.size });
    groups.get(groupKey)!.days.push(dayOfWeek);
  }
  return [...groups.values()];
}

// Source-bound presentation metadata only; never an employee eligibility constraint.
export function sourceReviewDayScopes(configuration: unknown, patterns: Array<{code:string;startTime:string|null;endTime:string|null;isWorking:boolean}>) {
  const provenance = (configuration as {release1SourceProvenance?:{matrixSourceId?:string;matrixSha256?:string}} | null)?.release1SourceProvenance;
  if (provenance?.matrixSourceId !== 'MUSUBI-2026-039' || provenance.matrixSha256 !== '6db2e20d95802e185f2d21801dc513a1fd3b9f752c3544a393391229643869cb') return [];
  // Source035 weekday/ Saturday ordinary shifts, retained by approved Matrix039.
  const definitions = [
    {code:'NORMAL',startTime:'08:30',endTime:'17:00',days:[1,2,3,4,5],exclusive:false},
    {code:'SAT_NORMAL',startTime:'08:30',endTime:'16:00',days:[6],exclusive:true},
  ];
  return definitions.filter(d=>patterns.some(p=>p.code===d.code&&p.isWorking&&p.startTime===d.startTime&&p.endTime===d.endTime))
    .map(({code,days,exclusive})=>({code,days,exclusive,basis:'SOURCE_REVIEW_ONLY' as const,sourceId:'MUSUBI-2026-035',matrixSourceId:provenance.matrixSourceId}));
}

export async function workforceReview(prisma: PrismaService, tenantId: string, fiscalYearStartMonth: number) {
  const [staff, patterns, requirements, rules, departments, attributes, feature] = await Promise.all([
    prisma.staff.count({ where: { tenantId, isActive: true } }),
    prisma.workPattern.findMany({ where: { tenantId, isActive: true }, orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }], select: { code: true, name: true, startTime: true, endTime: true, isWorking: true } }),
    prisma.shiftStaffingRequirement.findMany({ where: { tenantId, isActive: true }, orderBy: { code: 'asc' }, select: { workPattern: { select: { code: true, name: true } }, attributeDefinition: { select: { code: true, name: true } }, classType: true, dayOfWeek: true, startDate: true, endDate: true, requiredCount: true, constraintLevel: true } }),
    prisma.staffWorkRule.findMany({ where: { tenantId, isActive: true, staff: { isActive: true } }, select: { staffId: true, ruleType: true, dayOfWeek: true, startDate: true, endDate: true, startTime: true, endTime: true, numericValue: true, isHardConstraint: true, workPattern: { select: { code: true, name: true } } } }),
    prisma.department.findMany({ where: { tenantId, isActive: true }, orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }], select: { name: true, staffAssignments: { where: { isActive: true, staff: { isActive: true } }, select: { staffId: true } } } }),
    prisma.staffAttributeAssignment.findMany({ where: { tenantId, staff: { isActive: true }, isActive: true, attributeDefinition: { isActive: true, code: { in: ['GENERATOR_EXCLUDED', 'FIXED_ASSIGNMENT'] } } }, select: { staffId: true, attributeDefinition: { select: { code: true } } } }),
    prisma.tenantFeature.findUnique({where:{tenantId_featureCode:{tenantId,featureCode:'TENANT_CUSTOM_RULES'}},select:{configuration:true}}),
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
  return { ...summary, sourceDayScopes: sourceReviewDayScopes(feature?.configuration, patterns), fixedRuleGroups: groupFixedRules(rules), digest, workConfirmed: sections.includes('WORK_SETTINGS'), staffConfirmed: sections.includes('STAFF_CLASSES') };
}
