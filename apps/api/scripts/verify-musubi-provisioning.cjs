const { PrismaClient } = require('@prisma/client');
const { assertEnvironment, assertDatabaseSafety, EXPECTED_MIGRATION_COUNT } = require('./lib/production-operation-guard.cjs');

if (process.argv.includes('--help')) {
  process.stdout.write('Usage: node scripts/verify-musubi-provisioning.cjs --tenant-id <uuid> [--month YYYY-MM]\n');
  process.exit(0);
}

const prisma = new PrismaClient();
const tenantId = process.argv.find((value, index) => process.argv[index - 1] === '--tenant-id');
const month = process.argv.find((value, index) => process.argv[index - 1] === '--month') || '2026-10';
const day = (value) => new Date(`${value}T00:00:00.000Z`);

async function main() {
  assertEnvironment({ tenantId, operation: 'tenant-wide-verify', mode: 'VERIFY', packageDigest: '' });
  await assertDatabaseSafety(prisma, tenantId);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('SYSTEM_SAFETY_BLOCK:INVALID_MONTH:month must be YYYY-MM');
  const start = day(`${month}-01`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const [staff, excluded, food, admins, rules, requirements, contracts, assignments, events, exceptions, failedMigrations] = await Promise.all([
    prisma.staff.count({ where: { tenantId, isActive: true } }),
    prisma.staffAttributeAssignment.count({ where: { tenantId, isActive: true, attributeDefinition: { code: 'GENERATOR_EXCLUDED' } } }),
    prisma.staff.count({ where: { tenantId, isActive: true, departmentAssignments: { some: { isActive: true, department: { code: 'FOOD_SERVICE' } } } } }),
    prisma.membership.count({ where: { tenantId, role: 'ADMIN', isActive: true } }),
    prisma.staffWorkRule.count({ where: { tenantId, isActive: true, sourceType: 'TENANT_MASTER_PACKAGE' } }),
    prisma.shiftStaffingRequirement.count({ where: { tenantId, isActive: true, sourceType: 'TENANT_MASTER_PACKAGE' } }),
    prisma.staffWorkContract.count({ where: { tenantId, voidedAt: null, sourceType: 'TENANT_MASTER_PACKAGE' } }),
    prisma.shiftAssignment.count({ where: { tenantId, workDate: { gte: start, lt: end } } }),
    prisma.tenantEvent.count({ where: { tenantId, eventDate: { gte: start, lt: end } } }),
    prisma.tenantRuleException.count({ where: { tenantId, exceptionDate: { gte: start, lt: end }, isActive: true } }),
    prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL'),
  ]);
  const expectedAssignments = process.env.EXPECTED_ASSIGNMENT_COUNT ? Number(process.env.EXPECTED_ASSIGNMENT_COUNT) : null;
  const pass = staff === 23 && excluded === 3 && food === 3 && admins === 1 && rules === 42 && requirements === 33 && contracts === 8 && failedMigrations[0].count === 0 && (expectedAssignments == null || assignments === expectedAssignments);
  const result = { pass, tenantId, month, migrations: EXPECTED_MIGRATION_COUNT, staff, rotationEligible: staff - excluded, fixedOrExcluded: excluded, foodService: food, activeAdministrators: admins, permanentRules: rules, staffingRequirements: requirements, contracts, assignments, events, exceptions, incompleteMigrations: failedMigrations[0].count };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!pass) process.exitCode = 1;
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'SYSTEM_SAFETY_BLOCK:VERIFY_FAILED'}\n`); process.exitCode = 1; }).finally(() => prisma.$disconnect());
