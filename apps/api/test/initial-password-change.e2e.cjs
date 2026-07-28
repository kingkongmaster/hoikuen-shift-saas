const assert = require('node:assert/strict');
const { randomBytes, randomUUID, scryptSync } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const base = process.env.API_BASE_URL || 'http://localhost:8080/api';
const run = randomUUID().slice(0, 8).toLowerCase();
const email = `initial-admin-${run}@e2e.local`;
const temporaryPassword = `Temporary-${run}-Aa1!`;
const finalPassword = `Permanent-${run}-Zz9!`;
let tenantId;
let userId;
let otherTenantId;
let otherUserId;

function hash(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }

async function request(path, init = {}, token) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function main() {
  const existing = await prisma.user.findUniqueOrThrow({ where: { email: process.env.SEED_OWNER_EMAIL || 'owner@demo.enshift.local' }, select: { mustChangePassword: true, tokenVersion: true } });
  assert.deepEqual(existing, { mustChangePassword: false, tokenVersion: 0 }, 'migration defaults keep existing users unrestricted with valid tokens');

  const bootstrap = spawnSync(process.execPath, ['scripts/bootstrap-admin.cjs'], {
    cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8', env: { ...process.env, DEPLOYMENT_ENV: 'e2e', INITIAL_TENANT_NAME: `初回変更園${run}`, INITIAL_TENANT_CODE: `initial-${run}`, INITIAL_ADMIN_EMAIL: email, INITIAL_ADMIN_PASSWORD: temporaryPassword, INITIAL_ADMIN_DISPLAY_NAME: `初期管理者${run}` },
  });
  assert.equal(bootstrap.status, 0, bootstrap.stderr);
  assert.equal(`${bootstrap.stdout}${bootstrap.stderr}`.includes(temporaryPassword), false);
  const created = await prisma.user.findUniqueOrThrow({ where: { email }, include: { memberships: true } });
  userId = created.id; tenantId = created.memberships[0].tenantId;
  assert.equal(created.mustChangePassword, true); assert.equal(created.tokenVersion, 0);
  const createdAudit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, memberId: userId, action: 'INITIAL_ADMIN_CREATED' } });
  assert.deepEqual(createdAudit.detail, { source: 'bootstrap-admin-cli', mustChangePassword: true });

  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: temporaryPassword }) });
  assert.equal(login.status, 200); assert.equal(login.body.mustChangePassword, true); const token = login.body.accessToken;
  assert.equal((await request('/health')).status, 200); assert.equal((await request('/ready')).status, 200);
  const me = await request('/me', {}, token); assert.equal(me.status, 200); assert.equal(me.body.mustChangePassword, true);
  const blocked = await request('/staff', {}, token); assert.equal(blocked.status, 403); assert.equal(blocked.body.code, 'INITIAL_PASSWORD_CHANGE_REQUIRED'); assert.equal(blocked.body.mustChangePassword, true);

  const change = (body) => request('/auth/change-initial-password', { method: 'POST', body: JSON.stringify(body) }, token);
  assert.equal((await change({ currentPassword: 'Wrong-Temporary-Aa1!', newPassword: finalPassword, confirmPassword: finalPassword })).status, 401);
  assert.equal((await change({ currentPassword: temporaryPassword, newPassword: finalPassword, confirmPassword: `${finalPassword}x` })).status, 400);
  assert.equal((await change({ currentPassword: temporaryPassword, newPassword: 'weak-password', confirmPassword: 'weak-password' })).status, 400);
  assert.equal((await change({ currentPassword: temporaryPassword, newPassword: temporaryPassword, confirmPassword: temporaryPassword })).status, 400);

  const otherTenant = await prisma.tenant.create({ data: { name: `別園${run}` } }); otherTenantId = otherTenant.id;
  const otherPassword = `Other-${run}-Bb2!`; const otherFinalPassword = `OtherFinal-${run}-Cc3!`;
  const otherUser = await prisma.user.create({ data: { email: `other-${run}@e2e.local`, displayName: `別管理者${run}`, passwordHash: hash(otherPassword), mustChangePassword: true } }); otherUserId = otherUser.id;
  await prisma.membership.create({ data: { tenantId: otherTenant.id, userId: otherUser.id, role: 'ADMIN' } });
  const otherLogin = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: otherUser.email, password: otherPassword }) }); assert.equal(otherLogin.status, 200);
  const otherChange = await request('/auth/change-initial-password', { method: 'POST', body: JSON.stringify({ currentPassword: otherPassword, newPassword: otherFinalPassword, confirmPassword: otherFinalPassword, targetUserId: userId }) }, otherLogin.body.accessToken);
  assert.equal(otherChange.status, 200); assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword, true, 'another tenant cannot change the target user');
  const concurrentChanges = await Promise.all([change({ currentPassword: temporaryPassword, newPassword: finalPassword, confirmPassword: finalPassword }), change({ currentPassword: temporaryPassword, newPassword: finalPassword, confirmPassword: finalPassword })]);
  assert.deepEqual(concurrentChanges.map((result) => result.status).sort(), [200, 409], 'only one concurrent password change succeeds');
  const changed = concurrentChanges.find((result) => result.status === 200); assert.deepEqual(changed.body, { success: true, mustChangePassword: false, requiresReauthentication: true });
  const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } }); assert.equal(updatedUser.mustChangePassword, false); assert.equal(updatedUser.tokenVersion, 1);
  assert.equal((await request('/staff', {}, token)).status, 401, 'JWT issued with the temporary password is revoked');
  assert.equal((await request('/me', {}, token)).status, 401, 'allowlisted endpoints still enforce token version');
  assert.equal((await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: temporaryPassword }) })).status, 401);
  const relogin = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: finalPassword }) }); assert.equal(relogin.status, 200); assert.equal(relogin.body.mustChangePassword, false); assert.equal((await request('/staff', {}, relogin.body.accessToken)).status, 200);
  const secondChange = await request('/auth/change-initial-password', { method: 'POST', body: JSON.stringify({ currentPassword: finalPassword, newPassword: `Another-${run}-Qq8!`, confirmPassword: `Another-${run}-Qq8!` }) }, relogin.body.accessToken);
  assert.equal(secondChange.status, 409, 'second initial change is rejected');
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, memberId: userId, action: 'INITIAL_PASSWORD_CHANGED' } });
  const auditText = JSON.stringify(audit); assert.equal(auditText.includes(temporaryPassword), false); assert.equal(auditText.includes(finalPassword), false); assert.ok(audit.detail.requestId);
  console.log('Initial password change API tests: PASS (bootstrap, guard, policy, transaction, audit and re-login)');
}

main().finally(async () => { if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined); if (otherTenantId) await prisma.tenant.delete({ where: { id: otherTenantId } }).catch(() => undefined); if (userId) await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined); if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } }).catch(() => undefined); await prisma.$disconnect(); }).catch((error) => { console.error(error); process.exitCode = 1; });
