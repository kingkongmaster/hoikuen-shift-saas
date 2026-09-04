const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { writeFileSync, chmodSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');

const url = new URL(process.env.DATABASE_URL || '');
assert.equal(process.env.TEST_DATABASE_ISOLATED, 'true');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.match(url.pathname.slice(1), /restore_(?:test|verify)/);
assert.doesNotMatch(url.pathname.slice(1), /prod|production/i);
const reportPath = process.env.RESTORE_REPORT_PATH;
assert.ok(reportPath?.startsWith('/'));
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const dateOf = (value) => new Date(value).toISOString().slice(0, 10);

async function main() {
  const targetMonth = `${process.env.VERIFY_MONTH || '2026-09'}-01T00:00:00.000Z`;
  const nextMonth = new Date(targetMonth);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const schedule = await prisma.monthlyShift.findFirst({
    where: { targetMonth: { gte: new Date(targetMonth), lt: nextMonth } },
    orderBy: { createdAt: 'desc' },
  });
  const counts = {
    tenants: await prisma.tenant.count(),
    staff: await prisma.staff.count(),
    shiftAssignments: await prisma.shiftAssignment.count(),
    shiftAttendanceModifiers: await prisma.shiftAttendanceModifier.count(),
    paidLeaveUsages: await prisma.paidLeaveUsage.count(),
    paidLeaveAllocations: await prisma.paidLeaveAllocation.count(),
    tenantEvents: await prisma.tenantEvent.count(),
    tenantRuleExceptions: await prisma.tenantRuleException.count(),
    staffWorkContracts: await prisma.staffWorkContract.count(),
    staffWorkRules: await prisma.staffWorkRule.count(),
    shiftStaffingRequirements: await prisma.shiftStaffingRequirement.count(),
  };
  const migrationRows = await prisma.$queryRaw`SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL)::int AS failed FROM "_prisma_migrations"`;
  const boundaryChecks = {
    assignmentStaff: Number((await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "ShiftAssignment" a JOIN "Staff" s ON s.id=a."staffId" WHERE a."tenantId"<>s."tenantId"`)[0].count),
    assignmentSchedule: Number((await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "ShiftAssignment" a JOIN "MonthlyShift" m ON m.id=a."monthlyShiftId" WHERE a."tenantId"<>m."tenantId"`)[0].count),
    modifierAssignment: Number((await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "ShiftAttendanceModifier" x JOIN "ShiftAssignment" a ON a.id=x."shiftAssignmentId" WHERE x."tenantId"<>a."tenantId"`)[0].count),
    usageStaff: Number((await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "PaidLeaveUsage" u JOIN "Staff" s ON s.id=u."staffId" WHERE u."tenantId"<>s."tenantId"`)[0].count),
    allocationUsage: Number((await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "PaidLeaveAllocation" a JOIN "PaidLeaveUsage" u ON u.id=a."usageId" WHERE a."tenantId"<>u."tenantId"`)[0].count),
  };
  assert.ok(Object.values(boundaryChecks).every((count) => count === 0));
  const rows = schedule ? await prisma.shiftAssignment.findMany({
    where: { monthlyShiftId: schedule.id },
    include: { staff: true, workPattern: true, attendanceModifier: true },
    orderBy: [{ staff: { employeeNumber: 'asc' } }, { workDate: 'asc' }],
  }) : [];
  const canonicalInput = rows.map((row) => [
    row.staff.employeeNumber,
    dateOf(row.workDate),
    row.workPattern?.code || row.shiftType,
    row.shiftType,
    row.startTime ?? '',
    row.endTime ?? '',
    row.breakMinutes ?? '',
    row.assignedClass ?? '',
    row.attendanceModifier?.modifierType ?? '',
    row.attendanceModifier?.effectiveStartTime ?? '',
    row.attendanceModifier?.effectiveEndTime ?? '',
  ].join('|')).join('\n');
  const canonicalAssignmentDigest = createHash('sha256').update(canonicalInput).digest('hex');
  const report = {
    database: { host: url.hostname, name: url.pathname.slice(1), isolated: true },
    migrations: { total: Number(migrationRows[0].count), incomplete: Number(migrationRows[0].failed) },
    counts,
    verifiedMonth: process.env.VERIFY_MONTH || '2026-09',
    monthStaff: new Set(rows.map((row) => row.staffId)).size,
    monthAssignments: rows.length,
    canonicalAssignmentDigest,
    tenantBoundaryViolations: boundaryChecks,
  };
  assert.equal(report.migrations.incomplete, 0);
  if (process.env.EXPECTED_STAFF_COUNT) assert.equal(report.monthStaff, Number(process.env.EXPECTED_STAFF_COUNT));
  if (process.env.EXPECTED_ASSIGNMENT_COUNT) assert.equal(report.monthAssignments, Number(process.env.EXPECTED_ASSIGNMENT_COUNT));
  if (process.env.EXPECTED_CANONICAL_DIGEST) assert.equal(canonicalAssignmentDigest, process.env.EXPECTED_CANONICAL_DIGEST);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  chmodSync(reportPath, 0o600);
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(`restore audit failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
