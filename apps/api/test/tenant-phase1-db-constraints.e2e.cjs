const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient, Prisma, ShiftRequestType, ShiftType, StaffWorkRuleType } = require('@prisma/client');

const prisma = new PrismaClient();
const run = randomUUID().slice(0, 8);
const ids = { tenantA: null, tenantB: null };

async function expectForeignKeyFailure(label, action) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof Prisma.PrismaClientKnownRequestError, `${label}: Prisma known error expected`);
    assert.equal(error.code, 'P2003', `${label}: foreign-key violation expected`);
    return true;
  });
}

async function main() {
  const [tenantA, tenantB] = await Promise.all([
    prisma.tenant.create({ data: { name: `Phase1 constraint tenant A ${run}` } }),
    prisma.tenant.create({ data: { name: `Phase1 constraint tenant B ${run}` } }),
  ]);
  ids.tenantA = tenantA.id;
  ids.tenantB = tenantB.id;

  const [actorA, actorB] = await Promise.all([
    prisma.user.create({ data: { email: `phase1-a-${run}@e2e.invalid`, displayName: 'Phase1 A', passwordHash: 'not-a-real-password-hash' } }),
    prisma.user.create({ data: { email: `phase1-b-${run}@e2e.invalid`, displayName: 'Phase1 B', passwordHash: 'not-a-real-password-hash' } }),
  ]);
  await prisma.membership.createMany({ data: [
    { tenantId: tenantA.id, userId: actorA.id, role: 'ADMIN' },
    { tenantId: tenantB.id, userId: actorB.id, role: 'ADMIN' },
  ] });

  const [staffA, staffB, patternA, patternB, monthA, monthB] = await Promise.all([
    prisma.staff.create({ data: { tenantId: tenantA.id, employeeNumber: `A-${run}`, displayName: 'Anonymous A' } }),
    prisma.staff.create({ data: { tenantId: tenantB.id, employeeNumber: `B-${run}`, displayName: 'Anonymous B' } }),
    prisma.workPattern.create({ data: { tenantId: tenantA.id, code: `A_${run}`, name: 'Pattern A', shortName: 'A', startTime: '09:00', endTime: '18:00' } }),
    prisma.workPattern.create({ data: { tenantId: tenantB.id, code: `B_${run}`, name: 'Pattern B', shortName: 'B', startTime: '09:00', endTime: '18:00' } }),
    prisma.monthlyShift.create({ data: { tenantId: tenantA.id, targetMonth: new Date('2040-01-01T00:00:00.000Z'), createdByUserId: actorA.id } }),
    prisma.monthlyShift.create({ data: { tenantId: tenantB.id, targetMonth: new Date('2040-01-01T00:00:00.000Z'), createdByUserId: actorB.id } }),
  ]);

  const day = (value) => new Date(`2040-01-${String(value).padStart(2, '0')}T00:00:00.000Z`);

  await prisma.shiftAssignment.create({ data: { tenantId: tenantA.id, monthlyShiftId: monthA.id, staffId: staffA.id, workPatternId: patternA.id, workDate: day(2), shiftType: ShiftType.NORMAL } });
  await prisma.shiftRequest.create({ data: { tenantId: tenantA.id, staffId: staffA.id, requestDate: day(3), requestType: ShiftRequestType.DAY_OFF } });
  await prisma.staffWorkRule.create({ data: { tenantId: tenantA.id, staffId: staffA.id, workPatternId: patternA.id, ruleType: StaffWorkRuleType.PREFERRED_WORK_PATTERN } });
  await prisma.shiftAssignment.create({ data: { tenantId: tenantA.id, monthlyShiftId: monthA.id, staffId: staffA.id, workPatternId: null, workDate: day(4), shiftType: ShiftType.OFF } });
  await prisma.staffWorkRule.create({ data: { tenantId: tenantA.id, staffId: staffA.id, workPatternId: null, ruleType: StaffWorkRuleType.MAX_WORK_DAYS_PER_WEEK, numericValue: 5 } });

  await expectForeignKeyFailure('assignment foreign staff', () => prisma.shiftAssignment.create({ data: { tenantId: tenantA.id, monthlyShiftId: monthA.id, staffId: staffB.id, workDate: day(5), shiftType: ShiftType.NORMAL } }));
  await expectForeignKeyFailure('assignment foreign monthly shift', () => prisma.shiftAssignment.create({ data: { tenantId: tenantA.id, monthlyShiftId: monthB.id, staffId: staffA.id, workDate: day(6), shiftType: ShiftType.NORMAL } }));
  await expectForeignKeyFailure('assignment foreign work pattern', () => prisma.shiftAssignment.create({ data: { tenantId: tenantA.id, monthlyShiftId: monthA.id, staffId: staffA.id, workPatternId: patternB.id, workDate: day(7), shiftType: ShiftType.NORMAL } }));
  await expectForeignKeyFailure('request foreign staff', () => prisma.shiftRequest.create({ data: { tenantId: tenantA.id, staffId: staffB.id, requestDate: day(8), requestType: ShiftRequestType.DAY_OFF } }));
  await expectForeignKeyFailure('work rule foreign staff', () => prisma.staffWorkRule.create({ data: { tenantId: tenantA.id, staffId: staffB.id, ruleType: StaffWorkRuleType.MAX_WORK_DAYS_PER_WEEK, numericValue: 5 } }));
  await expectForeignKeyFailure('work rule foreign pattern', () => prisma.staffWorkRule.create({ data: { tenantId: tenantA.id, staffId: staffA.id, workPatternId: patternB.id, ruleType: StaffWorkRuleType.PREFERRED_WORK_PATTERN } }));

  await assert.rejects(() => prisma.workPattern.delete({ where: { id: patternA.id } }), (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003');

  console.log('Tenant Phase 1 direct database constraints: PASS (7 normal/nullable, 6 cross-tenant rejections, WorkPattern RESTRICT)');
}

main()
  .finally(async () => {
    for (const tenantId of [ids.tenantA, ids.tenantB]) {
      if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email: { endsWith: `-${run}@e2e.invalid` } } }).catch(() => undefined);
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
