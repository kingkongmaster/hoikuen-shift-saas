const assert = require('node:assert/strict');
const { randomUUID, randomBytes, scryptSync } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const safety = require('./helpers/isolated-database.cjs');
safety.resolveIsolatedDatabaseUrl();
const base = safety.resolveLocalApiBaseUrl();
const { anonymousFormalPackage } = require('./helpers/anonymous-formal-package.cjs');
const p = new PrismaClient();
const temporary = 'Synthetic-Initial-Aa7!';
const permanent = 'Synthetic-Changed-Bb8!';
let tenantId, otherId, userId, directory;
async function req(route, token, body, method = 'GET', extraHeaders = {}) {
  const r = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json() };
}
async function protectedSnapshot() {
  const tables = ['staff','department','staffDepartmentAssignment','tenantShiftSetting','classStaffingRequirement','workPattern','staffWorkRule','tenantFeature','staffAttributeAssignment','staffAttributeDefinition','shiftStaffingRequirement','conditionalShiftStaffingRequirement','membership'];
  const result = {};
  for (const table of tables) result[table] = (await p[table].findMany({ where: { tenantId } })).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(result);
}
async function main() {
  tenantId = (await p.tenant.create({ data: { name: 'Anonymous Nursery', code: 'acceptance-' + randomUUID(), setupStatus: 'NOT_STARTED', setupCurrentStep: 1 } })).id;
  otherId = (await p.tenant.create({ data: { name: 'Anonymous Other Nursery' } })).id;
  await p.tenantSubscription.create({ data: { tenantId, plan: 'PROFESSIONAL', status: 'ACTIVE' } });
  const salt = randomBytes(16).toString('hex');
  const email = 'acceptance-' + randomUUID() + '@example.invalid';
  const user = await p.user.create({ data: { email, displayName: 'Anonymous Administrator', passwordHash: `${salt}:${scryptSync(temporary, salt, 64).toString('hex')}`, mustChangePassword: true } }); userId = user.id;
  await p.membership.create({ data: { tenantId, userId, role: 'ADMIN' } });
  directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'aen-anonymous-first-login-')); fs.chmodSync(directory, 0o700);
  const file = path.join(directory, 'fixture.json'); fs.writeFileSync(file, JSON.stringify(anonymousFormalPackage(tenantId)), { mode: 0o600 });
  for (const args of [[ 'scripts/import-musubi-beta.cjs', file, '--formal-package', '--admin-employee-number', 'S001', '--apply' ], [ 'scripts/apply-musubi-tenant-master.cjs', '--tenant-id', tenantId, '--apply' ]]) {
    const r = spawnSync(process.execPath, args, { encoding: 'utf8' }); assert.equal(r.status, 0, 'anonymous fixture provisioning');
  }
  await p.staff.updateMany({ where: { tenantId }, data: { userId: null } });
  const login = () => req('/auth/login', null, { email, password: temporary }, 'POST');
  const first = await login(); assert.equal(first.status, 200); assert.equal(first.body.mustChangePassword, true);
  const oldToken = first.body.accessToken;
  for (const route of ['/staff', '/setup']) {
    const r = await req(route, oldToken); assert.equal(r.status, 403); assert.equal(r.body.code, 'INITIAL_PASSWORD_CHANGE_REQUIRED');
  }
  assert.equal((await req('/setup/tenant', oldToken, { name: 'Forbidden', contactEmail: 'contact@example.invalid' }, 'PATCH')).status, 403);
  const before = await protectedSnapshot();
  const change = await req('/auth/change-initial-password', oldToken, { currentPassword: temporary, newPassword: permanent, confirmPassword: permanent }, 'POST');
  assert.equal(change.status, 200); assert.equal(change.body.requiresReauthentication, true);
  assert.equal((await req('/me', oldToken)).status, 401);
  assert.equal((await req('/staff', oldToken)).status, 401);
  assert.equal((await login()).status, 401);
  const fresh = await req('/auth/login', null, { email, password: permanent }, 'POST');
  assert.equal(fresh.status, 200); assert.equal(fresh.body.mustChangePassword, false); assert.equal(fresh.body.role, 'ADMIN'); assert.equal(fresh.body.tenant.id, tenantId);
  const token = fresh.body.accessToken;
  const adminBefore = await p.user.findUnique({ where: { id: userId } });
  for (const contactEmail of [undefined, '', 'invalid']) {
    assert.equal((await req('/setup/tenant', token, { name: 'Anonymous Nursery', contactEmail }, 'PATCH')).status, 400);
  }
  const form = { name: 'Anonymous Nursery', contactEmail: 'contact@example.invalid', postalCode: '', phone: '', addressLine: '', contactName: '', prefecture: '', city: '' };
  const saved = await req('/setup/tenant', token, form, 'PATCH'); assert.equal(saved.status, 200);
  for (const [key,value] of Object.entries(form)) assert.equal(saved.body[key], value);
  assert.notEqual(saved.body.contactEmail, email);
  const missing = await req('/setup', token); assert.equal(missing.body.activeStaffCount, 23); assert.equal(missing.body.preserveWorkforceSetup, true);
  assert.equal((await req('/setup/progress', token, { currentStep: 4 }, 'PATCH')).status, 200);
  assert.equal((await req('/setup/consents', token, { acceptTerms: true, acceptPrivacy: true }, 'PATCH')).status, 200);
  assert.equal((await req('/setup/complete', token, {}, 'POST')).status, 201);
  assert.equal((await req('/setup', token)).body.setupStatus, 'COMPLETED');
  const staff = await req('/staff', token); assert.equal(staff.status, 200); assert.equal(staff.body.length, 23);
  assert.equal(await protectedSnapshot(), before, 'staff/rules/provenance/settings/membership unchanged');
  assert.deepEqual(await p.user.findUnique({ where: { id: userId } }), adminBefore, 'onboarding must not update admin');
  const otherStaff = await p.staff.create({ data: { tenantId: otherId, employeeNumber: 'OTHER', displayName: 'Anonymous Other Staff' } });
  assert.equal((await req('/staff/' + otherStaff.id, token, { displayName: 'Forbidden' }, 'PATCH')).status, 404);
  const otherBefore = await p.tenant.findUnique({ where: { id: otherId } });
  const forged = await req('/setup/tenant', token, { ...form, tenantId: otherId }, 'PATCH'); assert.equal(forged.body.id, tenantId);
  assert.deepEqual(await p.tenant.findUnique({ where: { id: otherId } }), otherBefore, 'body tenant spoof cannot target another tenant');
  assert.equal((await req('/staff/' + randomUUID(), token)).status, 404);
  const deps = await p.staffDepartmentAssignment.findMany({ where: { tenantId, isActive: true }, include: { department: true } });
  assert.deepEqual(['CHILDCARE','CHILDCARE_SUPPORT','FOOD_SERVICE'].map(code => deps.filter(d => d.department.code === code).length), [18,2,3]);
  const attrs = await p.staffAttributeAssignment.findMany({ where: { tenantId, isActive: true }, include: { attributeDefinition: true } });
  assert.equal(attrs.filter(a => a.attributeDefinition.code === 'GENERATOR_EXCLUDED').length, 3);
  assert.equal(attrs.filter(a => a.attributeDefinition.code === 'FIXED_ASSIGNMENT').length, 3);
  assert.equal(await p.monthlyShift.count({ where: { tenantId } }), 0); assert.equal(await p.shiftAssignment.count({ where: { tenantId } }), 0);
  assert.equal(await p.staff.count({ where: { tenantId, userId: { not: null } } }), 0);
  if (process.env.FIRST_LOGIN_KEEP_ANONYMOUS === 'true') {
    await p.user.update({ where: { id: userId }, data: { mustChangePassword: true, passwordHash: user.passwordHash, tokenVersion: { increment: 1 } } });
    await p.tenant.update({ where: { id: tenantId }, data: { contactEmail: null, setupStatus: 'NOT_STARTED', setupCurrentStep: 1, setupCompletedAt: null, termsAcceptedAt: null, privacyAcceptedAt: null } });
    fs.writeFileSync(process.env.FIRST_LOGIN_FIXTURE_METADATA, JSON.stringify({ email, tenantId, userId }), { mode: 0o600 });
  }
  console.log('FIRST_LOGIN_API_PASS: password priority, revocation, contact validation, optional blanks, same tenant, staff23, 18/2/3, protected data unchanged');
}
main().catch((error) => { console.error('FIRST_LOGIN_API_FAIL', error.code || error.name, (error.stack || '').split('\n').filter(line => line.includes('at ') && line.includes('first-login-acceptance')).join('\n')); process.exitCode = 1; }).finally(async () => {
  if (process.env.FIRST_LOGIN_KEEP_ANONYMOUS !== 'true') {
    if (tenantId) await p.tenant.delete({ where: { id: tenantId } });
    if (userId) await p.user.delete({ where: { id: userId } });
  }
  if (otherId) await p.tenant.delete({ where: { id: otherId } });
  if (directory) fs.rmSync(directory, { recursive: true });
  await p.$disconnect();
});
