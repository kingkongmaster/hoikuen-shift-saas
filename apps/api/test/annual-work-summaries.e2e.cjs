const assert = require('node:assert/strict');
const { randomUUID, scryptSync } = require('node:crypto');
const { PrismaClient, MembershipRole, MonthlyShiftStatus, ShiftType } = require('@prisma/client');

const prisma = new PrismaClient();
const base = process.env.API_BASE_URL || 'http://localhost:8080/api';
const run = randomUUID().slice(0, 8).toUpperCase();
const ownerEmail = `annual-admin-${run.toLowerCase()}@e2e.invalid`;
const staffEmail = `annual-staff-${run.toLowerCase()}@e2e.invalid`;
const password = `Annual-${run}!`;
const created = { tenantId: null, userIds: [], otherTenantId: null };

function hash(value) {
  const salt = randomUUID().replaceAll('-', '');
  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
}

async function call(path, init = {}, token) {
  const response = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function login(email, password) {
  const response = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200);
  return response.body;
}

async function main() {
  const tenant = await prisma.tenant.create({ data: { name: `Annual tenant ${run}` } });
  created.tenantId = tenant.id;
  const [ownerUser, staffUser] = await Promise.all([
    prisma.user.create({ data: { email: ownerEmail, displayName: 'Annual Admin', passwordHash: hash(password) } }),
    prisma.user.create({ data: { email: staffEmail, displayName: 'Annual Staff', passwordHash: hash(password) } }),
  ]);
  created.userIds.push(ownerUser.id, staffUser.id);
  await prisma.membership.createMany({ data: [
    { tenantId: tenant.id, userId: ownerUser.id, role: MembershipRole.ADMIN },
    { tenantId: tenant.id, userId: staffUser.id, role: MembershipRole.STAFF },
  ] });
  await prisma.tenantShiftSetting.create({ data: { tenantId: tenant.id, fiscalYearStartMonth: 4, defaultBreakMinutes: 60 } });
  const owner = await login(ownerEmail, password);
  const tenantId = owner.tenant.id;

  assert.equal((await call('/annual-work-summaries?fiscalYear=2036')).status, 401);
  assert.equal((await call('/annual-work-summaries?fiscalYear=1999', {}, owner.accessToken)).status, 400);
  for (const fiscalYearStartMonth of [0, 13]) {
    assert.equal((await call('/settings/shifts', { method: 'PATCH', body: JSON.stringify({ fiscalYearStartMonth }) }, owner.accessToken)).status, 400);
  }
  for (const fiscalYearStartMonth of [1, 12, 4]) {
    const setting = await call('/settings/shifts', { method: 'PATCH', body: JSON.stringify({ fiscalYearStartMonth }) }, owner.accessToken);
    assert.equal(setting.status, 200, JSON.stringify(setting.body));
    assert.equal(setting.body.fiscalYearStartMonth, fiscalYearStartMonth);
  }

  const [staff, unavailableStaff] = await Promise.all([
    prisma.staff.create({ data: { tenantId, employeeNumber: `ANNUAL-${run}`, displayName: 'Annual A', regularWorkStartTime: '09:00', regularWorkEndTime: '18:00' } }),
    prisma.staff.create({ data: { tenantId, employeeNumber: `ANNUAL-U-${run}`, displayName: 'Annual unavailable' } }),
  ]);
  const [confirmed, draft] = await Promise.all([
    prisma.monthlyShift.create({ data: { tenantId, targetMonth: new Date('2036-04-01T00:00:00Z'), status: MonthlyShiftStatus.CONFIRMED, createdByUserId: owner.user.id, confirmedByUserId: owner.user.id, confirmedAt: new Date() } }),
    prisma.monthlyShift.create({ data: { tenantId, targetMonth: new Date('2036-05-01T00:00:00Z'), status: MonthlyShiftStatus.DRAFT, createdByUserId: owner.user.id } }),
  ]);
  await prisma.shiftAssignment.createMany({ data: [
    { tenantId, monthlyShiftId: confirmed.id, staffId: staff.id, workDate: new Date('2036-04-01T00:00:00Z'), shiftType: ShiftType.NORMAL, startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
    { tenantId, monthlyShiftId: confirmed.id, staffId: staff.id, workDate: new Date('2036-04-02T00:00:00Z'), shiftType: ShiftType.PAID_LEAVE },
    { tenantId, monthlyShiftId: confirmed.id, staffId: staff.id, workDate: new Date('2036-04-03T00:00:00Z'), shiftType: ShiftType.AM_HALF },
    { tenantId, monthlyShiftId: confirmed.id, staffId: unavailableStaff.id, workDate: new Date('2036-04-02T00:00:00Z'), shiftType: ShiftType.PAID_LEAVE },
    { tenantId, monthlyShiftId: draft.id, staffId: staff.id, workDate: new Date('2036-05-01T00:00:00Z'), shiftType: ShiftType.NORMAL, startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
  ] });

  const otherTenant = await prisma.tenant.create({ data: { name: `Annual other ${run}` } });
  created.otherTenantId = otherTenant.id;
  const otherStaff = await prisma.staff.create({ data: { tenantId: otherTenant.id, employeeNumber: `OTHER-${run}`, displayName: 'Other tenant' } });
  const otherSchedule = await prisma.monthlyShift.create({ data: { tenantId: otherTenant.id, targetMonth: new Date('2036-04-01T00:00:00Z'), status: MonthlyShiftStatus.CONFIRMED, createdByUserId: owner.user.id, confirmedByUserId: owner.user.id, confirmedAt: new Date() } });
  await prisma.shiftAssignment.create({ data: { tenantId: otherTenant.id, monthlyShiftId: otherSchedule.id, staffId: otherStaff.id, workDate: new Date('2036-04-01T00:00:00Z'), shiftType: ShiftType.NORMAL, startTime: '09:00', endTime: '18:00', breakMinutes: 60 } });

  const summary = await call('/annual-work-summaries?fiscalYear=2036', {}, owner.accessToken);
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  assert.equal(summary.body.fiscalYearStart, '2036-04-01');
  assert.equal(summary.body.fiscalYearEndExclusive, '2037-04-01');
  assert.equal(summary.body.summaries.some((row) => row.staffId === otherStaff.id), false, 'other tenant staff must never be returned');
  const row = summary.body.summaries.find((item) => item.staffId === staff.id);
  assert.deepEqual(row, { staffId: staff.id, actualWorkedMinutes: 480, paidLeaveEquivalentMinutes: 480, halfLeaveEquivalentMinutes: 240, fairnessActualMinutes: 1200, calculationStatus: 'COMPLETE', unavailableReason: null });
  const unavailable = summary.body.summaries.find((item) => item.staffId === unavailableStaff.id);
  assert.equal(unavailable.calculationStatus, 'UNAVAILABLE');
  assert.equal(unavailable.fairnessActualMinutes, null);

  await prisma.monthlyShift.update({ where: { id: confirmed.id }, data: { status: MonthlyShiftStatus.DRAFT, confirmedAt: null, confirmedByUserId: null } });
  const reopened = await call('/annual-work-summaries?fiscalYear=2036', {}, owner.accessToken);
  assert.equal(reopened.body.summaries.find((item) => item.staffId === staff.id).actualWorkedMinutes, 0, 'reopened schedule must be excluded');

  const staffLogin = await login(staffEmail, password);
  assert.equal((await call('/annual-work-summaries?fiscalYear=2036', {}, staffLogin.accessToken)).status, 403);
  console.log('Annual work summaries API tests: PASS');
}

main().finally(async () => {
  for (const tenantId of [created.tenantId, created.otherTenantId]) if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  if (created.userIds.length) await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => undefined);
  await prisma.$disconnect();
}).catch((error) => { console.error(error); process.exitCode = 1; });
