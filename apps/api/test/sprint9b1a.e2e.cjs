const assert = require('node:assert/strict');
const { randomUUID, scryptSync } = require('node:crypto');
const { PrismaClient, MembershipRole, EmploymentType, AssignedClass, SubscriptionPlan, SubscriptionStatus } = require('@prisma/client');

const prisma = new PrismaClient();
const base = process.env.API_BASE_URL || 'http://localhost:8080/api';
const run = randomUUID().slice(0, 8);
const password = `S9B1a-${run}!`;
const hash = (value) => { const salt = randomUUID().replaceAll('-', ''); return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`; };
let tenantId; let otherTenantId; let userIds = [];

async function call(path, init = {}, token) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function login(email) { const result = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); assert.equal(result.status, 200); return result.body.accessToken; }
async function setup(token) { const result = await call('/setup', {}, token); assert.equal(result.status, 200); return result.body; }
function includes(result, code) { assert.ok(result.missingRequirements.includes(code), `${code} must be reported`); }

async function main() {
  const admin = await prisma.user.create({ data: { email: `s9b1a-admin-${run}@e2e.local`, displayName: 'セットアップ管理者', passwordHash: hash(password) } });
  const director = await prisma.user.create({ data: { email: `s9b1a-director-${run}@e2e.local`, displayName: '園長', passwordHash: hash(password) } });
  const staffUser = await prisma.user.create({ data: { email: `s9b1a-staff-${run}@e2e.local`, displayName: '一般職員', passwordHash: hash(password) } });
  const otherUser = await prisma.user.create({ data: { email: `s9b1a-other-${run}@e2e.local`, displayName: '別園職員', passwordHash: hash(password) } });
  const externalAdmin = await prisma.user.create({ data: { email: `s9b1a-external-${run}@e2e.local`, displayName: '別園管理者', passwordHash: hash(password), isPlatformAdmin: true } });
  userIds = [admin.id, director.id, staffUser.id, otherUser.id, externalAdmin.id];
  const consentAt = new Date();
  const tenant = await prisma.tenant.create({ data: { name: `Sprint 9-B1a 園 ${run}`, setupStatus: 'NOT_STARTED', setupCurrentStep: 1, termsAcceptedAt: consentAt, privacyAcceptedAt: consentAt, termsVersion: '2026-07-draft', privacyVersion: '2026-07-draft' } });
  tenantId = tenant.id;
  const other = await prisma.tenant.create({ data: { name: `別園 ${run}` } }); otherTenantId = other.id;
  await prisma.membership.createMany({ data: [
    { tenantId, userId: admin.id, role: MembershipRole.ADMIN }, { tenantId, userId: director.id, role: MembershipRole.DIRECTOR }, { tenantId, userId: staffUser.id, role: MembershipRole.STAFF }, { tenantId: otherTenantId, userId: otherUser.id, role: MembershipRole.ADMIN }, { tenantId: otherTenantId, userId: externalAdmin.id, role: MembershipRole.ADMIN },
  ] });
  await prisma.tenantSubscription.create({ data: { tenantId, plan: SubscriptionPlan.TRIAL, status: SubscriptionStatus.TRIAL, staffLimit: 20, trialStartedAt: consentAt, trialEndsAt: new Date(consentAt.getTime() + 30 * 86400000) } });
  await prisma.tenantShiftSetting.create({ data: { tenantId } });
  await prisma.classStaffingRequirement.create({ data: { tenantId, classType: AssignedClass.AGE_0, weekdayRequired: 3, saturdayRequired: 2 } });
  await prisma.staff.create({ data: { tenantId, userId: admin.id, employeeNumber: 'B1A-1', displayName: 'セットアップ管理者', employmentType: EmploymentType.FULL_TIME } });

  assert.equal((await call('/setup')).status, 401);
  const adminToken = await login(admin.email); const directorToken = await login(director.email); const staffToken = await login(staffUser.email); const otherToken = await login(otherUser.email); const externalToken = await login(externalAdmin.email);
  const initial = await setup(adminToken);
  for (const field of ['setupStatus', 'setupCurrentStep', 'setupCompletedAt', 'termsAcceptedAt', 'privacyAcceptedAt', 'termsVersion', 'privacyVersion', 'currentTermsVersion', 'currentPrivacyVersion', 'termsVersionCurrent', 'privacyVersionCurrent', 'tenant', 'shiftSettings', 'classRequirements', 'activeStaffCount', 'canComplete', 'missingRequirements']) assert.ok(Object.hasOwn(initial, field), `${field} must be returned`);
  assert.equal(initial.tenant.id, tenantId); assert.equal(initial.canComplete, true); assert.deepEqual(initial.missingRequirements, []); assert.equal(initial.activeStaffCount, 1); assert.equal(initial.currentTermsVersion, '2026-07-draft'); assert.equal(initial.currentPrivacyVersion, '2026-07-draft'); assert.equal(JSON.stringify(initial).includes('passwordHash'), false); assert.equal(JSON.stringify(initial).match(/passwordHash|refreshToken|secretKey|privateKey/), null);
  assert.equal((await setup(directorToken)).tenant.id, tenantId);
  assert.equal((await call('/setup', {}, staffToken)).status, 403);
  const otherSetup = await setup(otherToken); assert.equal(otherSetup.tenant.id, otherTenantId); assert.notEqual(otherSetup.tenant.id, tenantId); await prisma.membership.update({ where: { tenantId_userId: { tenantId: otherTenantId, userId: otherUser.id } }, data: { isActive: false } }); assert.equal((await call('/setup', {}, otherToken)).status, 403);
  const external = await setup(externalToken); assert.equal(external.tenant.id, otherTenantId); await prisma.membership.update({ where: { tenantId_userId: { tenantId: otherTenantId, userId: externalAdmin.id } }, data: { isActive: false } }); assert.equal((await call('/setup', {}, externalToken)).status, 403);
  await prisma.user.update({ where: { id: admin.id }, data: { isPlatformAdmin: true } }); const platformMemberToken = await login(admin.email); assert.equal((await setup(platformMemberToken)).tenant.id, tenantId); await prisma.user.update({ where: { id: admin.id }, data: { isPlatformAdmin: false } });

  await prisma.tenant.update({ where: { id: tenantId }, data: { name: '' } }); includes(await setup(adminToken), 'TENANT_NAME_REQUIRED'); await prisma.tenant.update({ where: { id: tenantId }, data: { name: tenant.name } });
  await prisma.tenantShiftSetting.delete({ where: { tenantId } }); includes(await setup(adminToken), 'SHIFT_SETTINGS_REQUIRED'); await prisma.tenantShiftSetting.create({ data: { tenantId } });
  await prisma.classStaffingRequirement.deleteMany({ where: { tenantId } }); includes(await setup(adminToken), 'CLASS_REQUIREMENTS_REQUIRED'); await prisma.classStaffingRequirement.create({ data: { tenantId, classType: AssignedClass.AGE_0, weekdayRequired: 3, saturdayRequired: 2 } });
  await prisma.staff.updateMany({ where: { tenantId }, data: { isActive: false } }); includes(await setup(adminToken), 'ACTIVE_STAFF_REQUIRED'); await prisma.staff.updateMany({ where: { tenantId }, data: { isActive: true } });
  await prisma.tenant.update({ where: { id: tenantId }, data: { termsAcceptedAt: null, termsVersion: null } }); let result = await setup(adminToken); includes(result, 'TERMS_NOT_ACCEPTED'); assert.equal(result.missingRequirements.includes('TERMS_VERSION_OUTDATED'), false);
  await prisma.tenant.update({ where: { id: tenantId }, data: { termsAcceptedAt: consentAt, termsVersion: 'old' } }); includes(await setup(adminToken), 'TERMS_VERSION_OUTDATED');
  await prisma.tenant.update({ where: { id: tenantId }, data: { termsVersion: '2026-07-draft', privacyAcceptedAt: null, privacyVersion: null } }); result = await setup(adminToken); includes(result, 'PRIVACY_NOT_ACCEPTED'); assert.equal(result.missingRequirements.includes('PRIVACY_VERSION_OUTDATED'), false);
  await prisma.tenant.update({ where: { id: tenantId }, data: { privacyAcceptedAt: consentAt, privacyVersion: 'old' } }); includes(await setup(adminToken), 'PRIVACY_VERSION_OUTDATED');
  await prisma.tenant.update({ where: { id: tenantId }, data: { privacyVersion: '2026-07-draft' } }); result = await setup(adminToken); assert.equal(result.canComplete, true); assert.equal(new Set(result.missingRequirements).size, result.missingRequirements.length);

  const beforeRead = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, setupStatus: true, setupCurrentStep: true, setupCompletedAt: true, termsAcceptedAt: true, privacyAcceptedAt: true, termsVersion: true, privacyVersion: true, updatedAt: true } });
  const beforeSettings = await prisma.tenantShiftSetting.findUniqueOrThrow({ where: { tenantId } }); const beforeClasses = await prisma.classStaffingRequirement.findMany({ where: { tenantId }, orderBy: { classType: 'asc' } }); const beforeStaff = await prisma.staff.findMany({ where: { tenantId }, select: { id: true, isActive: true }, orderBy: { id: 'asc' } });
  await setup(adminToken);
  assert.deepEqual(await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, setupStatus: true, setupCurrentStep: true, setupCompletedAt: true, termsAcceptedAt: true, privacyAcceptedAt: true, termsVersion: true, privacyVersion: true, updatedAt: true } }), beforeRead); assert.deepEqual(await prisma.tenantShiftSetting.findUniqueOrThrow({ where: { tenantId } }), beforeSettings); assert.deepEqual(await prisma.classStaffingRequirement.findMany({ where: { tenantId }, orderBy: { classType: 'asc' } }), beforeClasses); assert.deepEqual(await prisma.staff.findMany({ where: { tenantId }, select: { id: true, isActive: true }, orderBy: { id: 'asc' } }), beforeStaff);

  for (const status of [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED, SubscriptionStatus.EXPIRED]) { await prisma.tenantSubscription.update({ where: { tenantId }, data: { status } }); assert.equal((await setup(adminToken)).tenant.id, tenantId); }
  await prisma.tenantSubscription.update({ where: { tenantId }, data: { status: SubscriptionStatus.TRIAL, trialEndsAt: new Date(Date.now() - 60000) } }); assert.equal((await setup(adminToken)).tenant.id, tenantId);
  console.log('Sprint 9-B1a integration tests: PASS (38 scenarios)');
}

main().finally(async () => { if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined); if (otherTenantId) await prisma.tenant.delete({ where: { id: otherTenantId } }).catch(() => undefined); if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined); await prisma.$disconnect(); }).catch((error) => { console.error(error); process.exitCode = 1; });
