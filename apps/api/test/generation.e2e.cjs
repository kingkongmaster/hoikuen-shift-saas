const assert = require('node:assert/strict');
const { randomUUID, scryptSync } = require('node:crypto');
const { AssignedClass, EmploymentType, MembershipRole, PrismaClient, ShiftRequestStatus, ShiftRequestType, ShiftType } = require('@prisma/client');

const prisma = new PrismaClient(); const base = process.env.API_BASE_URL || 'http://localhost:8080/api'; const runId = randomUUID().slice(0, 8).toLowerCase();
let tenantId; let adminId; let staffUserId; let scheduleId;
const hash = (password) => { const salt = randomUUID().replaceAll('-', ''); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
async function request(path, init = {}, token) { const response = await fetch(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } }); return { status: response.status, body: await response.json().catch(() => null) }; }
async function login(email, password) { const response = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); assert.equal(response.status, 200); return response.body.accessToken; }

async function main() {
  const password = `Generation-${runId}!`; const tenant = await prisma.tenant.create({ data: { name: `生成E2E園 ${runId}` } }); tenantId = tenant.id;
  const admin = await prisma.user.create({ data: { email: `admin-${runId}@e2e.local`, displayName: '生成管理者', passwordHash: hash(password) } }); adminId = admin.id;
  await prisma.membership.create({ data: { tenantId, userId: admin.id, role: MembershipRole.ADMIN } });
  const employeeRows = [
    ['GEN-E1', '早出A', AssignedClass.AGE_0, { canWorkEarly: true, canWorkRegular: false, canWorkLate: false, earlyShiftOnly: true }],
    ['GEN-E2', '早出B', AssignedClass.AGE_0, { canWorkEarly: true, canWorkRegular: false, canWorkLate: false, earlyShiftOnly: true }],
    ['GEN-L1', '遅出A', AssignedClass.AGE_0, { canWorkEarly: false, canWorkRegular: false, canWorkLate: true, lateShiftOnly: true }],
    ['GEN-L2', '遅出B', AssignedClass.AGE_1, { canWorkEarly: false, canWorkRegular: false, canWorkLate: true, lateShiftOnly: true }],
    ['GEN-N1', 'パート通常上限', AssignedClass.AGE_1, { employmentType: EmploymentType.PART_TIME, canWorkEarly: false, canWorkRegular: true, canWorkLate: false, monthlyWorkHourLimit: 8 }],
    ['GEN-N2', '再雇用通常週上限', AssignedClass.AGE_2, { employmentType: EmploymentType.REEMPLOYED, canWorkEarly: false, canWorkRegular: true, canWorkLate: false, weeklyAvailableDays: 1, canWorkSaturdays: false }],
  ];
  const created = [];
  for (const [employeeNumber, displayName, assignedClass, rules] of employeeRows) created.push(await prisma.staff.create({ data: { tenantId, employeeNumber, displayName, assignedClass, employmentType: EmploymentType.FULL_TIME, ...rules } }));
  const staffUser = await prisma.user.create({ data: { email: `staff-${runId}@e2e.local`, displayName: '生成一般職員', passwordHash: hash(password) } }); staffUserId = staffUser.id;
  await prisma.membership.create({ data: { tenantId, userId: staffUser.id, role: MembershipRole.STAFF } }); await prisma.staff.create({ data: { tenantId, userId: staffUser.id, employeeNumber: 'GEN-STAFF', displayName: staffUser.displayName } });
  const adminToken = await login(admin.email, password); const staffToken = await login(staffUser.email, password);
  const month = '2033-01'; const schedule = await request('/shifts', { method: 'POST', body: JSON.stringify({ month }) }, adminToken); assert.equal(schedule.status, 201); scheduleId = schedule.body.id;
  const earlyA = created[0]; const requestDate = new Date('2033-01-03T00:00:00.000Z'); await prisma.shiftRequest.create({ data: { tenantId, staffId: earlyA.id, requestDate, requestType: ShiftRequestType.PAID_LEAVE, status: ShiftRequestStatus.APPROVED } });
  assert.equal((await request(`/shifts/${scheduleId}/generate`, { method: 'POST' })).status, 401);
  assert.equal((await request(`/shifts/${scheduleId}/generate`, { method: 'POST' }, staffToken)).status, 403);
  const generated = await request(`/shifts/${scheduleId}/generate`, { method: 'POST' }, adminToken); assert.equal(generated.status, 201); assert.equal(generated.body.generatedCount, 31 * 7); assert.equal(generated.body.workingAssignmentCount + generated.body.offAssignmentCount + generated.body.leaveAssignmentCount, generated.body.generatedCount); assert.ok(generated.body.workingAssignmentCount > 0); assert.ok(generated.body.offAssignmentCount > 0); assert.ok(generated.body.processingTimeMs >= 0); assert.ok(generated.body.warnings.some((warning) => warning.code === 'CLASS_SHORTAGE')); assert.ok(!generated.body.warnings.some((warning) => warning.code === 'MONTHLY_HOURS_LIMIT' || warning.code === 'WEEKLY_DAYS_LIMIT'), '上限内で見送った候補は警告にしない');
  const view = await request(`/shifts?month=${month}`, {}, adminToken); assert.equal(view.status, 200); assert.equal(view.body.schedule.status, 'DRAFT');
  const leave = view.body.assignments.find((item) => item.staffId === earlyA.id && item.workDate.slice(0, 10) === '2033-01-03'); assert.equal(leave.shiftType, ShiftType.PAID_LEAVE);
  const actualWorking = new Set([ShiftType.EARLY, ShiftType.NORMAL, ShiftType.LATE, ShiftType.OTHER]);
  const limitedMonthly = view.body.assignments.filter((item) => item.staffId === created[4].id && actualWorking.has(item.shiftType)); assert.ok(limitedMonthly.length <= 1, '月間勤務時間上限を超えない');
  const limitedWeekly = new Map(); for (const item of view.body.assignments.filter((assignment) => assignment.staffId === created[5].id && actualWorking.has(assignment.shiftType))) { const date = new Date(`${item.workDate.slice(0, 10)}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); const week = date.toISOString().slice(0, 10); limitedWeekly.set(week, (limitedWeekly.get(week) ?? 0) + 1); } assert.ok([...limitedWeekly.values()].every((days) => days <= 1), '週勤務可能日数を超えない');
  assert.ok(view.body.assignments.some((item) => item.staffId === created[4].id && item.shiftType === ShiftType.NORMAL), 'パート職員にも通常勤務を割り当てる');
  assert.ok(view.body.assignments.some((item) => item.staffId === created[5].id && item.shiftType === ShiftType.NORMAL), '再雇用職員にも通常勤務を割り当てる');
  const weekday = view.body.assignments.filter((item) => item.workDate.slice(0, 10) === '2033-01-04'); const monday = new Map(view.body.assignments.filter((item) => item.workDate.slice(0, 10) === '2033-01-03').map((item) => [item.staffId, item.shiftType])); assert.ok(weekday.filter((item) => item.shiftType === ShiftType.EARLY).length <= 2); assert.ok(weekday.filter((item) => item.shiftType === ShiftType.LATE).length <= 2); assert.ok(weekday.every((item) => !(item.shiftType === ShiftType.EARLY && monday.get(item.staffId) === ShiftType.EARLY))); assert.ok(weekday.every((item) => !(item.shiftType === ShiftType.LATE && monday.get(item.staffId) === ShiftType.LATE)));
  const saturdayStaff = created[5]; const saturdayAssignments = view.body.assignments.filter((item) => item.staffId === saturdayStaff.id && new Date(`${item.workDate.slice(0, 10)}T00:00:00Z`).getUTCDay() === 6); assert.ok(saturdayAssignments.every((item) => item.shiftType === ShiftType.OFF));
  const workingTypes = new Set([ShiftType.EARLY, ShiftType.NORMAL, ShiftType.LATE, ShiftType.OTHER]);
  assert.ok(generated.body.warnings.some((warning) => warning.code === 'SATURDAY_MINIMUM_SHORTAGE' && warning.level === 'ERROR'), '土曜最低勤務人数不足をERRORにする');
  const shortageConfirm = await request(`/shifts/${scheduleId}/confirm`, { method: 'POST' }, adminToken); assert.equal(shortageConfirm.status, 409); assert.ok(shortageConfirm.body.warnings.some((warning) => warning.code === 'SATURDAY_MINIMUM_SHORTAGE'));
  const otherTenant = await prisma.tenant.create({ data: { name: `別園生成E2E ${runId}` } }); const otherSchedule = await prisma.monthlyShift.create({ data: { tenantId: otherTenant.id, targetMonth: new Date('2033-02-01T00:00:00.000Z'), createdByUserId: admin.id } }); assert.equal((await request(`/shifts/${otherSchedule.id}/generate`, { method: 'POST' }, adminToken)).status, 404); await prisma.tenant.delete({ where: { id: otherTenant.id } });
  console.log('Sprint 5 API integration tests: PASS (12 scenarios)');
}
main().finally(async () => { if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined); await prisma.$disconnect(); }).catch((error) => { console.error(error); process.exitCode = 1; });
