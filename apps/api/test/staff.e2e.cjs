const assert = require('node:assert/strict');
const { randomUUID, scryptSync } = require('node:crypto');
const { MembershipRole, PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const base = process.env.API_BASE_URL || 'http://localhost:8080/api';
const ownerEmail = process.env.SEED_OWNER_EMAIL || 'owner@demo.enshift.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD || 'ChangeMe123!';
const runId = randomUUID().slice(0, 8).toUpperCase();
const employeeNumber = `E2E-${runId}`;
const staffPassword = `TestOnly-${runId}!`;
let createdStaffId;
let otherTenantId;
let staffUserId;

function hash(password) {
  const salt = randomUUID().replaceAll('-', '');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

async function request(path, init = {}, token) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function login(email, password) {
  const response = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200);
  assert.ok(response.body.accessToken);
  return response.body.accessToken;
}

async function main() {
  const health = await request('/health');
  assert.deepEqual(health, { status: 200, body: { status: 'ok' } });
  const readiness = await request('/ready');
  assert.deepEqual(readiness, { status: 200, body: { status: 'ready', database: 'up' } });
  const adminToken = await login(ownerEmail, ownerPassword);
  const me = await request('/me', {}, adminToken);
  assert.equal(me.status, 200);
  assert.equal(me.body.role, 'ADMIN');
  const tenantId = me.body.tenant.id;

  const unauthorized = await request('/staff');
  assert.equal(unauthorized.status, 401);

  const staffUser = await prisma.user.create({ data: { email: `staff-${runId.toLowerCase()}@e2e.local`, displayName: '権限テスト職員', passwordHash: hash(staffPassword) } });
  staffUserId = staffUser.id;
  await prisma.membership.create({ data: { tenantId, userId: staffUser.id, role: MembershipRole.STAFF } });
  const staffToken = await login(staffUser.email, staffPassword);
  const forbidden = await request('/staff', {}, staffToken);
  assert.equal(forbidden.status, 403);

  const invalid = await request('/staff', { method: 'POST', body: JSON.stringify({ employeeNumber: '', displayName: '', employmentType: 'UNKNOWN' }) }, adminToken);
  assert.equal(invalid.status, 400);

  const input = {
    employeeNumber, displayName: 'E2E テスト職員', email: `staff-master-${runId.toLowerCase()}@e2e.local`,
    employmentType: 'PART_TIME', assignedClass: 'SUPPORT', canWorkEarly: false, canWorkRegular: true,
    canWorkLate: false, earlyShiftOnly: false, lateShiftOnly: false, canWorkSaturdays: false,
    monthlyWorkHourLimit: 80, monthlyTargetWorkDays: 16, monthlyTargetWorkHours: 75, weeklyAvailableDays: 4, regularWorkStartTime: '09:00', regularWorkEndTime: '15:00',
    notes: 'Sprint 2 API統合テスト',
  };
  assert.equal((await request('/staff', { method: 'POST', body: JSON.stringify({ ...input, employeeNumber: `${employeeNumber}-START`, regularWorkEndTime: null }) }, adminToken)).status, 400);
  assert.equal((await request('/staff', { method: 'POST', body: JSON.stringify({ ...input, employeeNumber: `${employeeNumber}-FORMAT`, regularWorkStartTime: '9:00' }) }, adminToken)).status, 400);
  assert.equal((await request('/staff', { method: 'POST', body: JSON.stringify({ ...input, employeeNumber: `${employeeNumber}-ORDER`, regularWorkStartTime: '16:00', regularWorkEndTime: '09:00' }) }, adminToken)).status, 400);
  assert.equal((await request('/staff', { method: 'POST', body: JSON.stringify({ ...input, employeeNumber: `${employeeNumber}-DAYS-ZERO`, monthlyTargetWorkDays: 0 }) }, adminToken)).status, 400);
  assert.equal((await request('/staff', { method: 'POST', body: JSON.stringify({ ...input, employeeNumber: `${employeeNumber}-DAYS-DECIMAL`, monthlyTargetWorkDays: 12.5 }) }, adminToken)).status, 400);
  assert.equal((await request('/staff', { method: 'POST', body: JSON.stringify({ ...input, employeeNumber: `${employeeNumber}-DAYS-HIGH`, monthlyTargetWorkDays: 32 }) }, adminToken)).status, 400);
  assert.equal((await request('/staff', { method: 'POST', body: JSON.stringify({ ...input, employeeNumber: `${employeeNumber}-HOURS-ZERO`, monthlyTargetWorkHours: 0 }) }, adminToken)).status, 400);
  assert.equal((await request('/staff', { method: 'POST', body: JSON.stringify({ ...input, employeeNumber: `${employeeNumber}-LIMIT`, monthlyTargetWorkHours: 81 }) }, adminToken)).status, 400);
  const created = await request('/staff', { method: 'POST', body: JSON.stringify(input) }, adminToken);
  assert.equal(created.status, 201);
  assert.equal(created.body.employeeNumber, employeeNumber);
  assert.equal(created.body.regularWorkStartTime, '09:00');
  assert.equal(created.body.regularWorkEndTime, '15:00');
  assert.equal(created.body.monthlyTargetWorkDays, 16);
  assert.equal(created.body.monthlyTargetWorkHours, 75);
  createdStaffId = created.body.id;

  const duplicate = await request('/staff', { method: 'POST', body: JSON.stringify(input) }, adminToken);
  assert.equal(duplicate.status, 409);

  const detail = await request(`/staff/${createdStaffId}`, {}, adminToken);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.tenantId, tenantId);
  assert.equal(detail.body.regularWorkStartTime, '09:00');
  assert.equal(detail.body.regularWorkEndTime, '15:00');

  assert.equal((await request(`/staff/${createdStaffId}`, { method: 'PATCH', body: JSON.stringify({ regularWorkEndTime: null }) }, adminToken)).status, 400);
  assert.equal((await request(`/staff/${createdStaffId}`, { method: 'PATCH', body: JSON.stringify({ monthlyWorkHourLimit: 70 }) }, adminToken)).status, 400);
  const updated = await request(`/staff/${createdStaffId}`, { method: 'PATCH', body: JSON.stringify({ displayName: 'E2E 更新済み職員', canWorkLate: true, monthlyWorkHourLimit: 90, monthlyTargetWorkHours: 85, regularWorkStartTime: '09:00', regularWorkEndTime: '16:00' }) }, adminToken);
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.displayName, 'E2E 更新済み職員');
  assert.equal(updated.body.canWorkLate, true);
  assert.equal(updated.body.regularWorkStartTime, '09:00');
  assert.equal(updated.body.regularWorkEndTime, '16:00');

  const missingId = '00000000-0000-4000-8000-ffffffffffff';
  assert.equal((await request(`/staff/${missingId}`, {}, adminToken)).status, 404);

  const otherTenant = await prisma.tenant.create({ data: { name: `別園 E2E ${runId}` } });
  otherTenantId = otherTenant.id;
  const otherStaff = await prisma.staff.create({ data: { tenantId: otherTenant.id, employeeNumber, displayName: '別園職員' } });
  assert.equal((await request(`/staff/${otherStaff.id}`, {}, adminToken)).status, 404);
  assert.equal((await request(`/staff/${otherStaff.id}`, { method: 'PATCH', body: JSON.stringify({ displayName: '変更不可' }) }, adminToken)).status, 404);

  const deactivated = await request(`/staff/${createdStaffId}`, { method: 'DELETE' }, adminToken);
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.body.isActive, false);

  const activeList = await request('/staff', {}, adminToken);
  assert.equal(activeList.status, 200);
  assert.equal(activeList.body.some((member) => member.id === createdStaffId), false);
  const allList = await request('/staff?includeInactive=true', {}, adminToken);
  assert.equal(allList.status, 200);
  assert.equal(allList.body.some((member) => member.id === createdStaffId && !member.isActive), true);

  console.log('Sprint 2 API integration tests: PASS (individual hours CRUD and validation included)');
}

main().finally(async () => {
  if (createdStaffId) await prisma.staff.deleteMany({ where: { id: createdStaffId } }).catch(() => undefined);
  if (otherTenantId) await prisma.tenant.deleteMany({ where: { id: otherTenantId } }).catch(() => undefined);
  if (staffUserId) await prisma.user.deleteMany({ where: { id: staffUserId } }).catch(() => undefined);
  await prisma.$disconnect();
}).catch((error) => { console.error(error); process.exitCode = 1; });
