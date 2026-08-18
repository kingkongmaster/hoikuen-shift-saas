const assert = require('node:assert/strict');
const { randomUUID, scryptSync } = require('node:crypto');
const { PrismaClient, MembershipRole } = require('@prisma/client');
const { Prisma } = require('@prisma/client');
const { isStaffWorkContractOverlapError } = require('../dist/presentation/staff-work-contracts/staff-work-contracts.service');

const prisma = new PrismaClient();
const base = process.env.API_BASE_URL || 'http://localhost:8080/api';
const run = randomUUID().slice(0, 8).toLowerCase();
const password = `Contract-${run}!`;
const created = { tenantIds: [], userIds: [] };
const hash = (value) => { const salt = randomUUID().replaceAll('-', ''); return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`; };
async function call(path, init = {}, token) { const response = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } }); return { status: response.status, body: await response.json().catch(() => null) }; }
async function login(email) { const response = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); assert.equal(response.status, 200); return response.body.accessToken; }
const input = (effectiveFrom, effectiveTo = null, annualizedTargetMinutes = 115200, prescribedDailyMinutes = 480) => ({ effectiveFrom, effectiveTo, annualizedTargetMinutes, prescribedDailyMinutes });

async function main() {
  const targeted = new Prisma.PrismaClientUnknownRequestError('PostgresError { code: "23P01", constraint: "StaffWorkContract_no_active_period_overlap" }', { clientVersion: '6.19.3' });
  const otherConstraint = new Prisma.PrismaClientUnknownRequestError('PostgresError { code: "23P01", constraint: "Other_exclusion_constraint" }', { clientVersion: '6.19.3' });
  const otherDatabaseError = new Prisma.PrismaClientUnknownRequestError('PostgresError { code: "08006", message: "connection failure" }', { clientVersion: '6.19.3' });
  assert.equal(isStaffWorkContractOverlapError(targeted), true);
  assert.equal(isStaffWorkContractOverlapError(otherConstraint), false, 'other 23P01 constraints must not become 409');
  assert.equal(isStaffWorkContractOverlapError(otherDatabaseError), false, 'unrelated database errors must not become 409');

  const [tenant, otherTenant] = await Promise.all([prisma.tenant.create({ data: { name: `Contract ${run}` } }), prisma.tenant.create({ data: { name: `Contract other ${run}` } })]);
  created.tenantIds.push(tenant.id, otherTenant.id);
  const users = await Promise.all(['admin','director','staff'].map(async (role) => prisma.user.create({ data: { email: `contract-${role}-${run}@e2e.invalid`, displayName: role, passwordHash: hash(password) } })));
  created.userIds.push(...users.map((user) => user.id));
  await prisma.membership.createMany({ data: [
    { tenantId: tenant.id, userId: users[0].id, role: MembershipRole.ADMIN },
    { tenantId: tenant.id, userId: users[1].id, role: MembershipRole.DIRECTOR },
    { tenantId: tenant.id, userId: users[2].id, role: MembershipRole.STAFF },
  ] });
  const [staff, concurrentStaff, otherStaff] = await Promise.all([
    prisma.staff.create({ data: { tenantId: tenant.id, employeeNumber: `C-${run}`, displayName: 'Contract staff' } }),
    prisma.staff.create({ data: { tenantId: tenant.id, employeeNumber: `CC-${run}`, displayName: 'Concurrent staff' } }),
    prisma.staff.create({ data: { tenantId: otherTenant.id, employeeNumber: `O-${run}`, displayName: 'Other staff' } }),
  ]);
  const [adminToken, directorToken, staffToken] = await Promise.all(users.map((user) => login(user.email)));
  const path = `/staff/${staff.id}/work-contracts`;
  assert.equal((await call(path)).status, 401);
  assert.equal((await call(path, {}, staffToken)).status, 403);
  assert.equal((await call(`/staff/${otherStaff.id}/work-contracts`, {}, adminToken)).status, 404);
  for (const bad of [input('2032-04-01', null, 0), input('2032-04-01', null, 115200, 0), input('2032-10-01', '2032-09-30')]) assert.equal((await call(path, { method: 'POST', body: JSON.stringify(bad) }, adminToken)).status, 400);

  let response = await call(path, { method: 'POST', body: JSON.stringify(input('2032-04-01', '2032-09-30')) }, adminToken);
  assert.equal(response.status, 201, JSON.stringify(response.body)); const first = response.body;
  response = await call(path, { method: 'POST', body: JSON.stringify(input('2032-10-01')) }, directorToken);
  assert.equal(response.status, 201, JSON.stringify(response.body)); const second = response.body;
  assert.equal((await call(path, { method: 'POST', body: JSON.stringify(input('2032-09-30', '2032-10-15')) }, adminToken)).status, 409);
  assert.equal((await call(path, { method: 'POST', body: JSON.stringify(input('2033-01-01')) }, adminToken)).status, 409, 'open end overlap');
  response = await call(`${path}/${second.id}`, { method: 'PUT', body: JSON.stringify(input('2032-10-01', '2033-03-31')) }, directorToken);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal((await call(`${path}/${first.id}`, { method: 'DELETE' }, adminToken)).status, 404, 'physical delete route must not exist');
  response = await call(`${path}/${first.id}`, { method: 'PUT', body: JSON.stringify(input('2032-04-01', '2032-09-29', 120000, 450)) }, directorToken);
  assert.equal(response.status, 200); assert.equal(response.body.annualizedTargetMinutes, 120000);
  assert.equal((await call(`${path}/${first.id}/void`, { method: 'POST' }, adminToken)).status, 201);
  assert.equal((await call(`${path}/${first.id}`, { method: 'PUT', body: JSON.stringify(input('2032-04-01', '2032-09-30')) }, adminToken)).status, 409, 'void contract immutable');
  response = await call(path, { method: 'POST', body: JSON.stringify(input('2032-04-01', '2032-09-30')) }, adminToken);
  assert.equal(response.status, 201, JSON.stringify(response.body));

  await assert.rejects(prisma.staffWorkContract.create({ data: { tenantId: tenant.id, staffId: otherStaff.id, effectiveFrom: new Date('2040-01-01T00:00:00Z'), annualizedTargetMinutes: 1000, prescribedDailyMinutes: 60 } }), 'DB tenant guard');
  await assert.rejects(prisma.staffWorkContract.create({ data: { tenantId: tenant.id, staffId: staff.id, effectiveFrom: new Date('2032-06-01T00:00:00Z'), annualizedTargetMinutes: 1000, prescribedDailyMinutes: 60 } }), 'DB overlap constraint');
  const concurrentPath = `/staff/${concurrentStaff.id}/work-contracts`;
  const concurrent = await Promise.all([1, 2].map(() => call(concurrentPath, { method: 'POST', body: JSON.stringify(input('2035-04-01')) }, adminToken)));
  assert.deepEqual(concurrent.map((result) => result.status).sort(), [201, 409], 'DB race guard must become a safe 409');
  const logs = await prisma.auditLog.findMany({ where: { tenantId: tenant.id, targetType: 'StaffWorkContract' }, select: { action: true, detail: true } });
  for (const action of ['STAFF_WORK_CONTRACT_CREATED','STAFF_WORK_CONTRACT_UPDATED','STAFF_WORK_CONTRACT_ENDED','STAFF_WORK_CONTRACT_VOIDED']) assert.ok(logs.some((log) => log.action === action), action);
  assert.ok(logs.every((log) => log.detail && !JSON.stringify(log.detail).includes('@e2e.invalid')));
  const listed = await call(path, {}, directorToken); assert.equal(listed.status, 200); assert.ok(listed.body.some((row) => row.id === first.id && row.voidedAt)); assert.ok(listed.body.some((row) => row.id === second.id));
  console.log('Staff work contracts E2E tests: PASS');
}
main().finally(async () => { for (const tenantId of created.tenantIds) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined); if (created.userIds.length) await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => undefined); await prisma.$disconnect(); }).catch((error) => { console.error(error); process.exitCode = 1; });
