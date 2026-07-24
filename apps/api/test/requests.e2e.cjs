const assert = require('node:assert/strict');
const { randomUUID, scryptSync } = require('node:crypto');
const { MembershipRole, PrismaClient, ShiftRequestStatus, ShiftRequestType } = require('@prisma/client');

const prisma = new PrismaClient();
const base = process.env.API_BASE_URL || 'http://localhost:8080/api';
const ownerEmail = process.env.SEED_OWNER_EMAIL || 'owner@demo.enshift.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD || 'ChangeMe123!';
const runId = randomUUID().slice(0, 8).toUpperCase();
const staffPassword = `TestOnly-${runId}!`;
const createdRequestIds = [];
let staffId;
let staffUserId;
let otherTenantId;

const now = new Date();
const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
const month = nextMonth.toISOString().slice(0, 7);
const date = (day) => `${month}-${String(day).padStart(2, '0')}`;

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
  return response.body.accessToken;
}

async function main() {
  const adminToken = await login(ownerEmail, ownerPassword);
  const me = await request('/me', {}, adminToken);
  assert.equal(me.status, 200);
  const tenantId = me.body.tenant.id;
  const adminStaff = await prisma.staff.findFirstOrThrow({ where: { tenantId, userId: me.body.user.id } });

  const staffUser = await prisma.user.create({ data: { email: `request-${runId.toLowerCase()}@e2e.local`, displayName: '希望休テスト職員', passwordHash: hash(staffPassword) } });
  staffUserId = staffUser.id;
  await prisma.membership.create({ data: { tenantId, userId: staffUser.id, role: MembershipRole.STAFF } });
  const staff = await prisma.staff.create({ data: { tenantId, userId: staffUser.id, employeeNumber: `REQ-${runId}`, displayName: staffUser.displayName } });
  staffId = staff.id;
  const staffToken = await login(staffUser.email, staffPassword);

  assert.equal((await request(`/requests?month=${month}`)).status, 401);
  assert.equal((await request(`/requests?month=${month}&staffId=${adminStaff.id}`, {}, staffToken)).status, 403);
  assert.equal((await request('/requests', { method: 'POST', body: JSON.stringify({ staffId: adminStaff.id, requestDate: date(5), requestType: 'DAY_OFF' }) }, staffToken)).status, 403);

  const pastDate = '2020-01-01';
  assert.equal((await request('/requests', { method: 'POST', body: JSON.stringify({ requestDate: pastDate, requestType: 'DAY_OFF' }) }, staffToken)).status, 400);

  const firstInput = { requestDate: date(5), requestType: 'DAY_OFF', reason: '家族の予定' };
  const created = await request('/requests', { method: 'POST', body: JSON.stringify(firstInput) }, staffToken);
  assert.equal(created.status, 201);
  assert.equal(created.body.staffId, staffId);
  assert.equal(created.body.status, 'PENDING');
  createdRequestIds.push(created.body.id);
  assert.equal((await request('/requests', { method: 'POST', body: JSON.stringify(firstInput) }, staffToken)).status, 409);

  const edited = await request(`/requests/${created.body.id}`, { method: 'PATCH', body: JSON.stringify({ reason: '家族行事のため' }) }, staffToken);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.reason, '家族行事のため');

  const second = await request('/requests', { method: 'POST', body: JSON.stringify({ requestDate: date(6), requestType: 'PAID_LEAVE', reason: '通院' }) }, staffToken);
  assert.equal(second.status, 201);
  createdRequestIds.push(second.body.id);
  const third = await request('/requests', { method: 'POST', body: JSON.stringify({ requestDate: date(7), requestType: 'HALF_DAY_PM', reason: '私用' }) }, staffToken);
  assert.equal(third.status, 201);
  createdRequestIds.push(third.body.id);

  const adminList = await request(`/requests?month=${month}&staffId=${staffId}`, {}, adminToken);
  assert.equal(adminList.status, 200);
  assert.equal(adminList.body.length, 3);

  const approved = await request(`/requests/${created.body.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'APPROVED', adminComment: '承認しました' }) }, adminToken);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'APPROVED');
  assert.equal(approved.body.adminComment, '承認しました');
  assert.equal((await request(`/requests/${created.body.id}`, { method: 'PATCH', body: JSON.stringify({ reason: '変更不可' }) }, staffToken)).status, 403);

  const rejected = await request(`/requests/${second.body.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'REJECTED', adminComment: '配置調整が必要です' }) }, adminToken);
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.status, 'REJECTED');
  assert.equal(rejected.body.adminComment, '配置調整が必要です');

  const cancelled = await request(`/requests/${third.body.id}`, { method: 'DELETE' }, staffToken);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.status, 'CANCELLED');

  const otherTenant = await prisma.tenant.create({ data: { name: `別園 希望休E2E ${runId}` } });
  otherTenantId = otherTenant.id;
  const otherStaff = await prisma.staff.create({ data: { tenantId: otherTenant.id, employeeNumber: `REQ-${runId}`, displayName: '別園職員' } });
  const otherRequest = await prisma.shiftRequest.create({ data: { tenantId: otherTenant.id, staffId: otherStaff.id, requestDate: new Date(`${date(8)}T00:00:00.000Z`), requestType: ShiftRequestType.OTHER, status: ShiftRequestStatus.PENDING } });
  assert.equal((await request(`/requests/${otherRequest.id}`, {}, adminToken)).status, 404);

  assert.equal((await request(`/requests/00000000-0000-4000-8000-ffffffffffff`, {}, adminToken)).status, 404);
  console.log('Sprint 3 API integration tests: PASS (14 scenarios)');
}

main().finally(async () => {
  if (createdRequestIds.length) await prisma.shiftRequest.deleteMany({ where: { id: { in: createdRequestIds } } }).catch(() => undefined);
  if (otherTenantId) await prisma.tenant.deleteMany({ where: { id: otherTenantId } }).catch(() => undefined);
  if (staffId) await prisma.staff.deleteMany({ where: { id: staffId } }).catch(() => undefined);
  if (staffUserId) await prisma.user.deleteMany({ where: { id: staffUserId } }).catch(() => undefined);
  await prisma.$disconnect();
}).catch((error) => { console.error(error); process.exitCode = 1; });
