const assert = require('node:assert/strict');
const { randomUUID, scryptSync } = require('node:crypto');
const { MembershipRole, PrismaClient, ShiftRequestStatus, ShiftRequestType } = require('@prisma/client');

const prisma = new PrismaClient();
const base = process.env.API_BASE_URL || 'http://localhost:8080/api';
const ownerEmail = process.env.SEED_OWNER_EMAIL || 'owner@demo.enshift.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD || 'ChangeMe123!';
const runId = randomUUID().slice(0, 8).toUpperCase();
const monthDate = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1));
const month = monthDate.toISOString().slice(0, 7);
const workDate = `${month}-05`;
let scheduleId; let otherScheduleId; let staffId; let staffUserId; let otherTenantId; let tenantId; let originalSaturdayOperationEnabled;

function hash(password) { const salt = randomUUID().replaceAll('-', ''); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
async function request(path, init = {}, token) { const response = await fetch(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } }); return { status: response.status, body: await response.json().catch(() => null) }; }
async function login(email, password) { const response = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); assert.equal(response.status, 200); return response.body.accessToken; }

async function main() {
  const adminToken = await login(ownerEmail, ownerPassword);
  const me = await request('/me', {}, adminToken); tenantId = me.body.tenant.id;
  const originalSetting = await prisma.tenantShiftSetting.findUnique({ where: { tenantId } }); originalSaturdayOperationEnabled = originalSetting?.saturdayOperationEnabled;
  await prisma.tenantShiftSetting.upsert({ where: { tenantId }, update: { saturdayOperationEnabled: false }, create: { tenantId, saturdayOperationEnabled: false } });
  const staffPassword = `TestOnly-${runId}!`;
  const staffUser = await prisma.user.create({ data: { email: `shift-${runId.toLowerCase()}@e2e.local`, displayName: 'シフトテスト職員', passwordHash: hash(staffPassword) } }); staffUserId = staffUser.id;
  await prisma.membership.create({ data: { tenantId, userId: staffUser.id, role: MembershipRole.STAFF } });
  const staff = await prisma.staff.create({ data: { tenantId, userId: staffUser.id, employeeNumber: `SHIFT-${runId}`, displayName: staffUser.displayName, canWorkEarly: false, canWorkLate: false, canWorkSaturdays: false, monthlyWorkHourLimit: 8, weeklyAvailableDays: 1 } }); staffId = staff.id;
  const staffToken = await login(staffUser.email, staffPassword);

  assert.equal((await request(`/shifts?month=${month}`)).status, 401);
  assert.equal((await request('/shifts', { method: 'POST', body: JSON.stringify({ month }) }, staffToken)).status, 403);
  const create = await request('/shifts', { method: 'POST', body: JSON.stringify({ month }) }, adminToken); assert.equal(create.status, 201); scheduleId = create.body.id;
  assert.equal((await request('/shifts', { method: 'POST', body: JSON.stringify({ month }) }, adminToken)).status, 409);
  assert.equal((await request(`/shifts/${scheduleId}/assignments`, { method: 'PUT', body: JSON.stringify({ assignments: [{ staffId, workDate, shiftType: 'EARLY' }, { staffId, workDate: `${month}-10`, shiftType: 'NORMAL' }] }) }, adminToken)).status, 200);
  const listed = await request(`/shifts?month=${month}`, {}, adminToken); assert.equal(listed.status, 200); assert.equal(listed.body.assignments.length, 2); assert.ok(listed.body.warnings.some((warning) => warning.code === 'EARLY_NOT_AVAILABLE'));
  assert.equal((await request(`/shifts/${scheduleId}/assignments`, { method: 'PUT', body: JSON.stringify({ assignments: [{ staffId, workDate: `${month}-01`, shiftType: 'NORMAL' }, { staffId, workDate: `${month}-01`, shiftType: 'LATE' }] }) }, adminToken)).status, 409);
  assert.equal((await request(`/shifts/${scheduleId}/assignments`, { method: 'PUT', body: JSON.stringify({ assignments: [{ staffId, workDate: `${month}-99`, shiftType: 'NORMAL' }] }) }, adminToken)).status, 400);
  assert.equal((await request(`/shifts/${scheduleId}/assignments`, { method: 'PUT', body: JSON.stringify({ assignments: [{ staffId, workDate, shiftType: 'INVALID' }] }) }, adminToken)).status, 400);
  const confirmed = await request(`/shifts/${scheduleId}/confirm`, { method: 'POST' }, adminToken); assert.equal(confirmed.status, 200); assert.equal(confirmed.body.status, 'CONFIRMED');
  assert.equal((await request(`/shifts/${scheduleId}/assignments`, { method: 'PUT', body: JSON.stringify({ assignments: [{ staffId, workDate: `${month}-12`, shiftType: 'NORMAL' }] }) }, adminToken)).status, 409);
  const staffView = await request(`/shifts?month=${month}`, {}, staffToken); assert.equal(staffView.status, 200); assert.equal(staffView.body.assignments.every((assignment) => assignment.staffId === staffId), true);
  assert.equal((await request(`/shifts?month=${month}&staffId=00000000-0000-4000-8000-ffffffffffff`, {}, staffToken)).status, 403);
  const reopened = await request(`/shifts/${scheduleId}/reopen`, { method: 'POST' }, adminToken); assert.equal(reopened.status, 200); assert.equal(reopened.body.status, 'DRAFT');
  await prisma.shiftRequest.create({ data: { tenantId, staffId, requestDate: new Date(`${workDate}T00:00:00.000Z`), requestType: ShiftRequestType.PAID_LEAVE, status: ShiftRequestStatus.APPROVED, reason: '競合テスト' } });
  const rejectedSave = await request(`/shifts/${scheduleId}/assignments`, { method: 'PUT', body: JSON.stringify({ assignments: [{ staffId, workDate, shiftType: 'NORMAL' }] }) }, adminToken);
  assert.equal(rejectedSave.status, 409);
  assert.ok(rejectedSave.body.warnings?.some((warning) => warning.code === 'APPROVED_REQUEST_CONFLICT'));
  const conflict = await request(`/shifts/${scheduleId}/confirm`, { method: 'POST' }, adminToken); assert.equal(conflict.status, 409); assert.ok(conflict.body.warnings?.some((warning) => warning.code === 'APPROVED_REQUEST_CONFLICT'));
  const otherTenant = await prisma.tenant.create({ data: { name: `別園 シフトE2E ${runId}` } }); otherTenantId = otherTenant.id;
  const otherSchedule = await prisma.monthlyShift.create({ data: { tenantId: otherTenant.id, targetMonth: monthDate, createdByUserId: staffUser.id } }); otherScheduleId = otherSchedule.id;
  assert.equal((await request(`/shifts/${otherScheduleId}`, {}, adminToken)).status, 404);
  console.log('Sprint 4 API integration tests: PASS (17 scenarios)');
}

main().finally(async () => {
  if (tenantId && originalSaturdayOperationEnabled !== undefined) await prisma.tenantShiftSetting.update({ where: { tenantId }, data: { saturdayOperationEnabled: originalSaturdayOperationEnabled } }).catch(() => undefined);
  if (scheduleId) await prisma.monthlyShift.deleteMany({ where: { id: scheduleId } }).catch(() => undefined);
  if (otherScheduleId) await prisma.monthlyShift.deleteMany({ where: { id: otherScheduleId } }).catch(() => undefined);
  if (otherTenantId) await prisma.tenant.deleteMany({ where: { id: otherTenantId } }).catch(() => undefined);
  if (staffId) await prisma.staff.deleteMany({ where: { id: staffId } }).catch(() => undefined);
  if (staffUserId) await prisma.user.deleteMany({ where: { id: staffUserId } }).catch(() => undefined);
  await prisma.$disconnect();
}).catch((error) => { console.error(error); process.exitCode = 1; });
