const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { PrismaClient, SubscriptionPlan, SubscriptionStatus } = require('@prisma/client');
const prisma = new PrismaClient();
const base = process.env.API_BASE_URL || 'http://localhost:8080/api';
let tenantId, otherTenantId, originalSubscription;

async function call(path, init = {}, token) {
  const response = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return { status: response.status, body: await response.json().catch(() => null) };
}
function stable(value) { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; }
function checksum(value) { return createHash('sha256').update(stable(value)).digest('hex'); }
const input = (attributeDefinitionId, overrides = {}) => ({ code: `REQ_${randomUUID().slice(0, 8).toUpperCase()}`, name: '属性別必要人数', attributeDefinitionId, classType: null, dayOfWeek: 1, startDate: '2026-08-03', endDate: '2026-08-31', requiredCount: 1, constraintLevel: 'HARD', reason: 'E2E配置条件', displayOrder: 10, isActive: true, ...overrides });

async function main() {
  const login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: process.env.SEED_OWNER_EMAIL || 'owner@demo.enshift.local', password: process.env.SEED_OWNER_PASSWORD || 'ChangeMe123!' }) });
  assert.equal(login.status, 200); let token = login.body.accessToken;
  tenantId = (await call('/me', {}, token)).body.tenant.id;
  originalSubscription = await prisma.tenantSubscription.findUniqueOrThrow({ where: { tenantId } });
  const definition = await prisma.staffAttributeDefinition.create({ data: { tenantId, code: 'E2E_STAFFING_ATTR', name: 'E2E属性', category: 'QUALIFICATION' } });

  await prisma.tenantSubscription.update({ where: { tenantId }, data: { plan: SubscriptionPlan.STANDARD, status: SubscriptionStatus.ACTIVE, trialEndsAt: null } });
  assert.equal((await call('/staffing-requirements', {}, token)).status, 200, 'Feature OFFでも読取可');
  assert.equal((await call('/staffing-requirements', { method: 'POST', body: JSON.stringify(input(definition.id)) }, token)).status, 403, 'Feature OFF書込拒否');
  await prisma.tenantSubscription.update({ where: { tenantId }, data: { plan: SubscriptionPlan.PROFESSIONAL } });

  for (const invalid of [{ requiredCount: 0 }, { dayOfWeek: 7 }, { endDate: null }, { startDate: '2026-09-01', endDate: '2026-08-01' }, { startDate: '2026-08-03', endDate: '2026-08-03', dayOfWeek: 2 }]) {
    assert.equal((await call('/staffing-requirements', { method: 'POST', body: JSON.stringify(input(definition.id, invalid)) }, token)).status, 400);
  }

  let result = await call('/staffing-requirements', { method: 'POST', body: JSON.stringify(input(definition.id, { code: 'E2E_STAFFING' })) }, token);
  assert.equal(result.status, 201); const row = result.body; assert.equal(row.attributeDefinition.id, definition.id);
  assert.ok(await prisma.auditLog.findFirst({ where: { tenantId, targetId: row.id, action: 'SHIFT_STAFFING_REQUIREMENT_CREATED' } }));
  const auditBefore = await prisma.auditLog.count({ where: { tenantId } });
  assert.equal((await call('/staffing-requirements', { method: 'POST', body: JSON.stringify(input(definition.id, { code: 'E2E_OVERLAP', startDate: '2026-08-31', endDate: '2026-09-30' })) }, token)).status, 409, '境界日重複');
  assert.equal((await call('/staffing-requirements', { method: 'POST', body: JSON.stringify(input(definition.id, { code: 'E2E_UNBOUNDED', startDate: null, endDate: null })) }, token)).status, 409, '無期限重複');
  assert.equal(await prisma.auditLog.count({ where: { tenantId } }), auditBefore, '拒否時AuditLogなし');
  assert.equal((await call('/staffing-requirements', { method: 'POST', body: JSON.stringify(input(definition.id, { code: 'E2E_NEXT', startDate: '2026-09-01', endDate: '2026-09-30' })) }, token)).status, 201, '非重複期間許可');
  assert.equal((await call(`/staffing-requirements/${row.id}`, { method: 'PUT', body: JSON.stringify(input(definition.id, { code: 'CHANGED' })) }, token)).status, 400, 'code変更拒否');
  result = await call(`/staffing-requirements/${row.id}`, { method: 'PUT', body: JSON.stringify(input(definition.id, { code: 'E2E_STAFFING', name: '更新済み' })) }, token);
  assert.equal(result.status, 200); assert.ok(await prisma.auditLog.findFirst({ where: { tenantId, targetId: row.id, action: 'SHIFT_STAFFING_REQUIREMENT_UPDATED' } }));
  assert.equal((await call(`/staffing-requirements/${row.id}`, { method: 'DELETE' }, token)).status, 200);
  assert.ok(await prisma.auditLog.findFirst({ where: { tenantId, targetId: row.id, action: 'SHIFT_STAFFING_REQUIREMENT_DEACTIVATED' } }));
  result = await call('/staffing-requirements', { method: 'POST', body: JSON.stringify(input(definition.id, { code: 'E2E_STAFFING', name: '再有効' })) }, token);
  assert.equal(result.status, 201); assert.equal(result.body.id, row.id); assert.ok(await prisma.auditLog.findFirst({ where: { tenantId, targetId: row.id, action: 'SHIFT_STAFFING_REQUIREMENT_REACTIVATED' } }));

  const other = await prisma.tenant.create({ data: { name: `別園-${randomUUID().slice(0, 6)}` } }); otherTenantId = other.id;
  const otherDefinition = await prisma.staffAttributeDefinition.create({ data: { tenantId: other.id, code: 'OTHER', name: '別園属性', category: 'ROLE' } });
  assert.equal((await call('/staffing-requirements', { method: 'POST', body: JSON.stringify(input(otherDefinition.id)) }, token)).status, 404, '属性tenant不一致');
  const otherRow = await prisma.shiftStaffingRequirement.create({ data: { tenantId: other.id, code: 'OTHER_REQ', name: '別園条件', attributeDefinitionId: otherDefinition.id, requiredCount: 1, constraintLevel: 'INFO' } });
  assert.equal((await call(`/staffing-requirements/${otherRow.id}`, { method: 'DELETE' }, token)).status, 404, 'tenant越境拒否');

  const ownerId = login.body.user.id;
  await prisma.membership.update({ where: { tenantId_userId: { tenantId, userId: ownerId } }, data: { role: 'DIRECTOR' } });
  const director = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: process.env.SEED_OWNER_EMAIL || 'owner@demo.enshift.local', password: process.env.SEED_OWNER_PASSWORD || 'ChangeMe123!' }) });
  assert.equal((await call('/staffing-requirements', {}, director.body.accessToken)).status, 200);
  assert.equal((await call('/staffing-requirements', { method: 'POST', body: JSON.stringify(input(definition.id)) }, director.body.accessToken)).status, 403);
  await prisma.membership.update({ where: { tenantId_userId: { tenantId, userId: ownerId } }, data: { role: 'ADMIN' } });
  const staffLogin = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'staff@demo.enshift.local', password: process.env.SEED_STAFF_PASSWORD || 'ChangeMe123!' }) });
  assert.equal((await call('/staffing-requirements', {}, staffLogin.body.accessToken)).status, 403);

  token = (await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: process.env.SEED_OWNER_EMAIL || 'owner@demo.enshift.local', password: process.env.SEED_OWNER_PASSWORD || 'ChangeMe123!' }) })).body.accessToken;
  const backup = await call('/backups/export', { method: 'POST' }, token); assert.equal(backup.status, 201); assert.ok(Array.isArray(backup.body.data.shiftStaffingRequirements));
  const legacy = structuredClone(backup.body); delete legacy.data.shiftStaffingRequirements; delete legacy.counts.shiftStaffingRequirements; legacy.integrity.checksum = checksum(legacy.data);
  assert.equal((await call('/backups/validate', { method: 'POST', body: JSON.stringify({ backup: legacy }) }, token)).status, 201, '旧形式互換');
  const invalid = structuredClone(backup.body); invalid.data.shiftStaffingRequirements[0].requiredCount = 0; invalid.integrity.checksum = checksum(invalid.data);
  assert.equal((await call('/backups/validate', { method: 'POST', body: JSON.stringify({ backup: invalid }) }, token)).status, 422, '不正バックアップ拒否');
  console.log('StaffingRequirement integration tests: PASS');
}

main().finally(async () => {
  if (tenantId) {
    const owner = await prisma.user.findUnique({ where: { email: process.env.SEED_OWNER_EMAIL || 'owner@demo.enshift.local' }, select: { id: true } }).catch(() => null);
    if (owner) await prisma.membership.update({ where: { tenantId_userId: { tenantId, userId: owner.id } }, data: { role: 'ADMIN' } }).catch(() => {});
    await prisma.shiftStaffingRequirement.deleteMany({ where: { tenantId, code: { startsWith: 'E2E_' } } }).catch(() => {});
    await prisma.staffAttributeDefinition.deleteMany({ where: { tenantId, code: 'E2E_STAFFING_ATTR' } }).catch(() => {});
    if (originalSubscription) await prisma.tenantSubscription.update({ where: { tenantId }, data: { plan: originalSubscription.plan, status: originalSubscription.status, trialEndsAt: originalSubscription.trialEndsAt } }).catch(() => {});
  }
  if (otherTenantId) await prisma.tenant.delete({ where: { id: otherTenantId } }).catch(() => {});
  await prisma.$disconnect();
}).catch((error) => { console.error(error); process.exitCode = 1; });
