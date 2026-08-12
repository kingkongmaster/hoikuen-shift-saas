const { ShiftRequestStatus, ShiftRequestType } = require('@prisma/client');

const TARGET_REQUEST_COUNT = 25;
const FIXTURE_REASON = 'Sprint 10-A isolated fixture';

async function installSprint10AFixture(prisma, tenantId) {
  if (process.env.TEST_DATABASE_ISOLATED !== 'true') {
    throw new Error('Sprint 10-A fixture requires TEST_DATABASE_ISOLATED=true. Refusing to modify a non-isolated database.');
  }

  const existingCount = await prisma.shiftRequest.count({ where: { tenantId } });
  if (existingCount > TARGET_REQUEST_COUNT) {
    throw new Error(`Sprint 10-A fixture expected at most ${TARGET_REQUEST_COUNT} existing requests, found ${existingCount}.`);
  }

  const missingCount = TARGET_REQUEST_COUNT - existingCount;
  if (missingCount === 0) return [];

  const staff = await prisma.staff.findMany({
    where: { tenantId, isActive: true },
    orderBy: { employeeNumber: 'asc' },
    select: { id: true },
  });
  if (staff.length === 0) throw new Error('Sprint 10-A fixture requires active staff.');

  const statuses = [ShiftRequestStatus.PENDING, ShiftRequestStatus.APPROVED, ShiftRequestStatus.REJECTED];
  const requestTypes = [ShiftRequestType.DAY_OFF, ShiftRequestType.PAID_LEAVE, ShiftRequestType.SUMMER_LEAVE, ShiftRequestType.HALF_DAY_AM, ShiftRequestType.HALF_DAY_PM];
  const createdIds = [];
  for (let index = 0; index < missingCount; index += 1) {
    const created = await prisma.shiftRequest.create({
      data: {
        tenantId,
        staffId: staff[index % staff.length].id,
        requestDate: new Date(Date.UTC(2042, 0, index + 1)),
        requestType: requestTypes[index % requestTypes.length],
        status: statuses[index % statuses.length],
        reason: FIXTURE_REASON,
        adminComment: statuses[index % statuses.length] === ShiftRequestStatus.PENDING ? null : FIXTURE_REASON,
      },
      select: { id: true },
    });
    createdIds.push(created.id);
  }
  return createdIds;
}

async function removeSprint10AFixture(prisma, createdIds) {
  if (createdIds.length === 0) return;
  await prisma.shiftRequest.deleteMany({ where: { id: { in: createdIds }, reason: FIXTURE_REASON } });
}

module.exports = { installSprint10AFixture, removeSprint10AFixture, TARGET_REQUEST_COUNT };
