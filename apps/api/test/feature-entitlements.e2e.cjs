const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { PrismaClient, SubscriptionPlan, SubscriptionStatus } = require('@prisma/client');

const prisma = new PrismaClient();
const base = process.env.API_BASE_URL || 'http://localhost:8080/api';
const ownerEmail = process.env.SEED_OWNER_EMAIL || 'owner@demo.enshift.local';
const ownerPassword = process.env.SEED_OWNER_PASSWORD || 'ChangeMe123!';
let tenantId; let otherTenantId; let scheduleId; let actorId; let originalPlatform; let originalSubscription;

async function call(path, init = {}, token) {
  const response = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function login() { const response = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: ownerEmail, password: ownerPassword }) }); assert.equal(response.status, 200); return response.body.accessToken; }
async function featureList(token) { const response = await call('/features', {}, token); assert.equal(response.status, 200); return response.body; }
async function setSubscription(data) { await prisma.tenantSubscription.update({ where: { tenantId }, data }); }
async function setFeature(token, targetTenantId, input) { return call(`/platform/tenants/${targetTenantId}/features`, { method: 'PUT', body: JSON.stringify(input) }, token); }
function stable(value) { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; }
function checksum(value) { return createHash('sha256').update(stable(value), 'utf8').digest('hex'); }

async function main() {
  const token = await login();
  const me = await call('/me', {}, token); tenantId = me.body.tenant.id; actorId = me.body.user.id;
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: actorId } }); originalPlatform = actor.isPlatformAdmin;
  originalSubscription = await prisma.tenantSubscription.findUniqueOrThrow({ where: { tenantId } });
  await prisma.tenantFeature.deleteMany({ where: { tenantId } });

  await setSubscription({ plan: SubscriptionPlan.TRIAL, status: SubscriptionStatus.ACTIVE, trialEndsAt: null });
  let list = await featureList(token); assert.ok(list.enabledFeatures.includes('BASIC_SHIFT_GENERATION')); assert.equal(list.enabledFeatures.includes('ADVANCED_WORK_PATTERNS'), false);
  await setSubscription({ plan: SubscriptionPlan.STANDARD, status: SubscriptionStatus.ACTIVE });
  list = await featureList(token); assert.deepEqual(list.enabledFeatures, ['BASIC_SHIFT_GENERATION']);
  await setSubscription({ plan: SubscriptionPlan.PROFESSIONAL, status: SubscriptionStatus.ACTIVE });
  list = await featureList(token); assert.ok(list.enabledFeatures.includes('ADVANCED_WORK_PATTERNS')); assert.equal(list.enabledFeatures.includes('TENANT_CUSTOM_RULES'), false); assert.equal(list.features.some((item) => item.featureCode === 'UNKNOWN_FEATURE'), false);
  for (const status of [SubscriptionStatus.SUSPENDED, SubscriptionStatus.EXPIRED]) { await setSubscription({ status }); list = await featureList(token); assert.equal(list.enabledFeatures.length, 0); assert.ok(list.features.every((item) => item.code === 'FEATURE_NOT_AVAILABLE')); }
  await setSubscription({ plan: SubscriptionPlan.TRIAL, status: SubscriptionStatus.TRIAL, trialEndsAt: new Date(Date.now() - 60_000) });
  list = await featureList(token); assert.equal(list.enabledFeatures.length, 0);

  await setSubscription({ plan: SubscriptionPlan.STANDARD, status: SubscriptionStatus.ACTIVE, trialEndsAt: null });
  let result = await setFeature(token, tenantId, { featureCode: 'ADVANCED_WORK_PATTERNS', enabled: true, source: 'MANUAL' }); assert.equal(result.status, 403);
  assert.equal((await call(`/platform/tenants/${tenantId}/features`, {}, token)).status, 403);
  await prisma.user.update({ where: { id: actorId }, data: { isPlatformAdmin: true } });
  result = await setFeature(token, tenantId, { featureCode: 'ADVANCED_WORK_PATTERNS', enabled: true, source: 'MANUAL' }); assert.equal(result.status, 200);
  list = await featureList(token); assert.ok(list.enabledFeatures.includes('ADVANCED_WORK_PATTERNS'));
  result = await setFeature(token, tenantId, { featureCode: 'BASIC_SHIFT_GENERATION', enabled: false, source: 'PLAN_OVERRIDE' }); assert.equal(result.status, 200);
  list = await featureList(token); assert.equal(list.enabledFeatures.includes('BASIC_SHIFT_GENERATION'), false);
  await setSubscription({ plan: SubscriptionPlan.PROFESSIONAL });
  result = await setFeature(token, tenantId, { featureCode: 'ADVANCED_WORK_PATTERNS', enabled: false, source: 'PLAN_OVERRIDE', validTo: new Date(Date.now() - 60_000).toISOString() }); assert.equal(result.status, 200);
  list = await featureList(token); assert.ok(list.enabledFeatures.includes('ADVANCED_WORK_PATTERNS'), 'プラン既定ONへ復帰');
  await setSubscription({ plan: SubscriptionPlan.STANDARD });
  result = await setFeature(token, tenantId, { featureCode: 'STAFF_WORK_RULES', enabled: true, source: 'MANUAL', validTo: new Date(Date.now() - 60_000).toISOString() }); assert.equal(result.status, 200);
  list = await featureList(token); assert.equal(list.enabledFeatures.includes('STAFF_WORK_RULES'), false, '期限切れONはプラン既定OFFへ復帰'); assert.equal(list.features.find((item) => item.featureCode === 'STAFF_WORK_RULES').code, 'FEATURE_NOT_ENTITLED');
  result = await setFeature(token, tenantId, { featureCode: 'ROLE_QUALIFICATION_MANAGEMENT', enabled: true, source: 'MANUAL', validFrom: new Date(Date.now() + 86_400_000).toISOString() }); assert.equal(result.status, 200);
  list = await featureList(token); assert.equal(list.enabledFeatures.includes('ROLE_QUALIFICATION_MANAGEMENT'), false, '開始前ONは現在のプラン既定OFF');
  await setSubscription({ plan: SubscriptionPlan.PROFESSIONAL });
  result = await setFeature(token, tenantId, { featureCode: 'ADVANCED_STAFFING_REQUIREMENTS', enabled: false, source: 'PLAN_OVERRIDE' }); assert.equal(result.status, 200);
  list = await featureList(token); assert.equal(list.enabledFeatures.includes('ADVANCED_STAFFING_REQUIREMENTS'), false, '期間内OFFはプラン既定ONより優先');
  await setSubscription({ plan: SubscriptionPlan.STANDARD });
  result = await setFeature(token, tenantId, { featureCode: 'ROLE_QUALIFICATION_MANAGEMENT', enabled: true, source: 'MANUAL' }); assert.equal(result.status, 200);
  list = await featureList(token); assert.ok(list.enabledFeatures.includes('ROLE_QUALIFICATION_MANAGEMENT'), '期間内ONはプラン既定OFFより優先');
  result = await setFeature(token, tenantId, { featureCode: 'TENANT_CUSTOM_RULES', enabled: true, source: 'CUSTOM_CONTRACT' }); assert.equal(result.status, 200);
  list = await featureList(token); assert.ok(list.enabledFeatures.includes('TENANT_CUSTOM_RULES'));
  result = await call(`/platform/tenants/${tenantId}/features/ADVANCED_WORK_PATTERNS`, { method: 'DELETE' }, token); assert.equal(result.status, 200);
  list = await featureList(token); assert.equal(list.enabledFeatures.includes('ADVANCED_WORK_PATTERNS'), false);
  const deletedAudit = await prisma.auditLog.findFirst({ where: { tenantId, action: 'TENANT_FEATURE_DELETED', targetType: 'TenantFeature' }, orderBy: { createdAt: 'desc' } }); assert.ok(deletedAudit); assert.equal(deletedAudit.detail.tenantId, tenantId); assert.equal(deletedAudit.detail.featureCode, 'ADVANCED_WORK_PATTERNS'); assert.ok(Object.prototype.hasOwnProperty.call(deletedAudit.detail, 'validFrom')); assert.ok(Object.prototype.hasOwnProperty.call(deletedAudit.detail, 'validTo'));

  const month = `204${Math.floor(Math.random() * 9)}-${String(Math.floor(Math.random() * 11) + 1).padStart(2, '0')}`;
  const schedule = await prisma.monthlyShift.create({ data: { tenantId, targetMonth: new Date(`${month}-01T00:00:00.000Z`), createdByUserId: actorId } }); scheduleId = schedule.id;
  await setFeature(token, tenantId, { featureCode: 'BASIC_SHIFT_GENERATION', enabled: false, source: 'PLAN_OVERRIDE', validTo: new Date(Date.now() - 60_000).toISOString() });
  result = await call(`/shifts/${scheduleId}/precheck`, { method: 'POST' }, token); assert.notEqual(result.status, 403, '期限切れ上書きだけを理由にGuardは拒否しない');
  await setFeature(token, tenantId, { featureCode: 'BASIC_SHIFT_GENERATION', enabled: false, source: 'PLAN_OVERRIDE' });
  result = await call(`/shifts/${scheduleId}/precheck`, { method: 'POST' }, token); assert.equal(result.status, 403); assert.equal(result.body.code, 'FEATURE_NOT_ENTITLED');
  await setFeature(token, tenantId, { featureCode: 'BASIC_SHIFT_GENERATION', enabled: true, source: 'MANUAL' });
  result = await call(`/shifts/${scheduleId}/precheck`, { method: 'POST' }, token); assert.notEqual(result.status, 403);

  otherTenantId = (await prisma.tenant.create({ data: { name: `Feature別園-${randomUUID().slice(0, 8)}` } })).id;
  await prisma.tenantSubscription.create({ data: { tenantId: otherTenantId, plan: SubscriptionPlan.STANDARD, status: SubscriptionStatus.ACTIVE } });
  result = await setFeature(token, otherTenantId, { featureCode: 'TENANT_CUSTOM_RULES', enabled: true, source: 'CUSTOM_CONTRACT' }); assert.equal(result.status, 200);
  list = await featureList(token); assert.equal(list.features.find((item) => item.featureCode === 'TENANT_CUSTOM_RULES').source, 'TENANT_OVERRIDE');
  const otherFeature = await prisma.tenantFeature.findUniqueOrThrow({ where: { tenantId_featureCode: { tenantId: otherTenantId, featureCode: 'TENANT_CUSTOM_RULES' } } }); assert.equal(otherFeature.tenantId, otherTenantId);
  const audit = await prisma.auditLog.findFirst({ where: { tenantId: otherTenantId, action: 'TENANT_FEATURE_CREATED', memberId: actorId } }); assert.ok(audit); assert.equal(audit.detail.featureCode, 'TENANT_CUSTOM_RULES'); assert.equal(audit.detail.tenantId, otherTenantId); assert.deepEqual(Object.keys(audit.detail.after).sort(), ['enabled', 'source', 'validFrom', 'validTo']);
  const targetList = await call(`/platform/tenants/${otherTenantId}/features`, {}, token); assert.equal(targetList.status, 200); assert.ok(targetList.body.enabledFeatures.includes('TENANT_CUSTOM_RULES'));
  const ownList = await featureList(token); assert.equal(ownList.features.filter((item) => item.featureCode === 'TENANT_CUSTOM_RULES').length, 1);
  const backupResponse = await call('/backups/export', { method: 'POST' }, token); assert.equal(backupResponse.status, 201); assert.equal(backupResponse.body.version, 2); assert.ok(Array.isArray(backupResponse.body.data.tenantFeatures)); assert.ok(backupResponse.body.data.tenantFeatures.some((item) => item.featureCode === 'TENANT_CUSTOM_RULES'));
  assert.equal((await call('/backups/validate', { method: 'POST', body: JSON.stringify({ backup: backupResponse.body }) }, token)).status, 201);
  const legacyBackup = structuredClone(backupResponse.body); legacyBackup.version = 1; delete legacyBackup.data.tenantFeatures; delete legacyBackup.counts.tenantFeatures; legacyBackup.integrity.checksum = checksum(legacyBackup.data);
  assert.equal((await call('/backups/validate', { method: 'POST', body: JSON.stringify({ backup: legacyBackup }) }, token)).status, 201, 'version 1 backup remains readable');
  const wrongTenantBackup = structuredClone(backupResponse.body); wrongTenantBackup.tenantId = otherTenantId;
  assert.equal((await call('/backups/validate', { method: 'POST', body: JSON.stringify({ backup: wrongTenantBackup }) }, token)).status, 422, '別Tenant backup is rejected');
  console.log('Feature entitlement integration tests: PASS (contract, plans, overrides, guard, isolation, platform and audit)');
}

main().finally(async () => {
  if (scheduleId) await prisma.monthlyShift.deleteMany({ where: { id: scheduleId } }).catch(() => undefined);
  if (otherTenantId) await prisma.tenant.deleteMany({ where: { id: otherTenantId } }).catch(() => undefined);
  if (tenantId) await prisma.tenantFeature.deleteMany({ where: { tenantId } }).catch(() => undefined);
  if (originalSubscription) await prisma.tenantSubscription.update({ where: { tenantId }, data: { plan: originalSubscription.plan, status: originalSubscription.status, trialStartedAt: originalSubscription.trialStartedAt, trialEndsAt: originalSubscription.trialEndsAt, currentPeriodStartedAt: originalSubscription.currentPeriodStartedAt, currentPeriodEndsAt: originalSubscription.currentPeriodEndsAt, suspendedAt: originalSubscription.suspendedAt, cancelledAt: originalSubscription.cancelledAt, cancellationReason: originalSubscription.cancellationReason, suspensionReason: originalSubscription.suspensionReason, staffLimit: originalSubscription.staffLimit } }).catch(() => undefined);
  if (actorId && originalPlatform !== undefined) await prisma.user.update({ where: { id: actorId }, data: { isPlatformAdmin: originalPlatform } }).catch(() => undefined);
  await prisma.$disconnect();
}).catch((error) => { console.error(error); process.exitCode = 1; });
