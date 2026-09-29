const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const safety = require('./helpers/isolated-database.cjs');
safety.resolveIsolatedDatabaseUrl();
const base = safety.resolveLocalApiBaseUrl();
const { PrismaClient } = require('@prisma/client');
const { PasswordService } = require('../dist/application/auth/password.service');
const { recover } = require('../scripts/recover-admin-credential.cjs');
const p = new PrismaClient({ log: [] }), ps = new PasswordService();
const tenants = [], users = [], secrets = [];
const password = () => { const value = 'Aa1!' + randomBytes(24).toString('hex'); secrets.push(value); return value; };
async function request(route, body, token) {
  const r = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json(); if (data.accessToken) secrets.push(data.accessToken);
  return { status: r.status, body: data };
}
function cli(input, mode, success) {
  const r = spawnSync(process.execPath, ['scripts/recover-admin-credential.cjs', mode], { cwd: require('node:path').resolve(__dirname, '..'), env: process.env, input: JSON.stringify(input), encoding: 'utf8' });
  const output = r.stdout + r.stderr;
  assert.ok(secrets.every(s => !output.includes(s)), 'secret output');
  assert.equal(r.status === 0, success, 'safe CLI result');
}
async function snapshot() {
  return JSON.stringify([await p.user.findMany({ orderBy: { id: 'asc' } }), await p.membership.findMany({ orderBy: { userId: 'asc' } }), await p.auditLog.findMany({ orderBy: { id: 'asc' } }), await p.staff.findMany({ orderBy: { id: 'asc' } })]);
}
async function main() {
  const tenant = await p.tenant.create({ data: { name: 'Anonymous recovery tenant' } }); tenants.push(tenant.id);
  const other = await p.tenant.create({ data: { name: 'Anonymous sentinel' } }); tenants.push(other.id);
  const old = password(), temporary = password(), final = password();
  const hash = await ps.hash(old); secrets.push(hash);
  const u = await p.user.create({ data: { email: randomUUID() + '@example.invalid', displayName: 'Anonymous admin', passwordHash: hash, tokenVersion: 1, memberships: { create: { tenantId: tenant.id, role: 'ADMIN' } } } }); users.push(u.id);
  const historical = await p.auditLog.create({ data: { tenantId: tenant.id, memberId: u.id, action: 'INITIAL_PASSWORD_CHANGED', targetType: 'User', targetId: u.id, detail: { source: 'self-service' } } });
  for (let i = 0; i < 23; i++) await p.staff.create({ data: { tenantId: tenant.id, employeeNumber: `ANON-${i}`, displayName: `Anonymous ${i}` } });
  const foreign = await p.staff.create({ data: { tenantId: other.id, employeeNumber: 'OTHER', displayName: 'Anonymous other' } });
  const staffBefore = await p.staff.findMany({ orderBy: { id: 'asc' } });
  let membershipBefore = await p.membership.findMany();
  const login = await request('/auth/login', { email: u.email, password: old }); assert.equal(login.status, 200);
  const oldToken = login.body.accessToken;
  const input = { target: { tenantId: tenant.id, userId: u.id, email: u.email, expectedTokenVersion: 1, expectedMustChangePassword: false, approvalReference: 'ANONYMOUS_REVIEW_20260929' }, password: temporary, confirmPassword: temporary };
  const before = await snapshot();
  for (const invalid of [
    { ...input, password: 'weak', confirmPassword: 'weak' },
    { ...input, confirmPassword: password() },
    { ...input, password: old, confirmPassword: old },
    { ...input, target: { ...input.target, tenantId: other.id } },
    { ...input, target: { ...input.target, email: 'wrong@example.invalid' } },
    { ...input, target: { ...input.target, expectedTokenVersion: 0 } },
  ]) { cli(invalid, '--apply', false); assert.equal(await snapshot(), before); }
  cli(input, '--dry-run', true); assert.equal(await snapshot(), before);
  // Inject audit failure within the REAL PostgreSQL transaction: credential must roll back.
  const failing = new Proxy(p, { get(db, key) { if (key === '$transaction') return (fn, options) => db.$transaction(tx => fn(new Proxy(tx, { get(t, k) { return k === 'auditLog' ? { create: async () => { throw new Error('synthetic failure'); } } : t[k]; } })), options); const v = db[key]; return typeof v === 'function' ? v.bind(db) : v; } });
  await assert.rejects(recover(failing, input, true)); assert.equal(await snapshot(), before);
  await p.membership.create({ data: { tenantId: other.id, userId: u.id, role: 'ADMIN' } });
  const shared = await snapshot(); cli(input, '--apply', false); assert.equal(await snapshot(), shared);
  await p.membership.delete({ where: { tenantId_userId: { tenantId: other.id, userId: u.id } } });
  for (const patch of [{ isActive: false }, { isPlatformAdmin: true }]) {
    await p.user.update({ where: { id: u.id }, data: patch });
    const state = await snapshot(); cli(input, '--apply', false); assert.equal(await snapshot(), state);
    await p.user.update({ where: { id: u.id }, data: { isActive: true, isPlatformAdmin: false } });
  }
  await p.membership.update({ where: { tenantId_userId: { tenantId: tenant.id, userId: u.id } }, data: { role: 'STAFF' } });
  const wrongRole = await snapshot(); cli(input, '--apply', false); assert.equal(await snapshot(), wrongRole);
  await p.membership.update({ where: { tenantId_userId: { tenantId: tenant.id, userId: u.id } }, data: { role: 'ADMIN' } });
  membershipBefore = await p.membership.findMany();
  // Exercise the actual Production gates only against the explicit isolated DB.
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const receipt = fs.mkdtempSync(path.join(os.tmpdir(), 'aen-anonymous-recovery-')); fs.chmodSync(receipt, 0o700);
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { DEPLOYMENT_ENV: 'production', PROVISIONING_REHEARSAL: 'true', ALLOW_PRODUCTION_PROVISIONING: 'true', CONFIRM_DEPLOYMENT_ENV: 'production', DATABASE_TARGET_ID: 'anonymous-recovery-test', CONFIRM_DATABASE_TARGET_ID: 'anonymous-recovery-test', DATABASE_TARGET_DATABASE: new URL(process.env.DATABASE_URL).pathname.slice(1), PROVISIONING_STATE_DIRECTORY: receipt, CONFIRM_PRODUCTION_APPLY: 'APPLY_MUSUBI_PRODUCTION_' + tenant.id, CONFIRM_ADMIN_RECOVERY: input.target.approvalReference });
    const unchanged = await snapshot();
    cli(input, '--apply', false); // Missing receipt.
    cli(input, '--dry-run', true);
    process.env.CONFIRM_ADMIN_RECOVERY = 'wrong'; cli(input, '--apply', false);
    process.env.CONFIRM_ADMIN_RECOVERY = input.target.approvalReference;
    cli({ ...input, target: { ...input.target, approvalReference: 'DIFFERENT_APPROVAL' } }, '--apply', false);
    assert.equal(await snapshot(), unchanged);
    cli(input, '--apply', true);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved); fs.rmSync(receipt, { recursive: true, force: true });
  }

  const reset = await p.user.findUniqueOrThrow({ where: { id: u.id } }); secrets.push(reset.passwordHash);
  assert.equal(reset.tokenVersion, 2); assert.equal(reset.mustChangePassword, true);
  const after = await snapshot(); cli(input, '--apply', false); assert.equal(await snapshot(), after);
  assert.equal((await request('/auth/login', { email: u.email, password: old })).status, 401);
  assert.equal((await request('/staff', null, oldToken)).status, 401);
  const tempLogin = await request('/auth/login', { email: u.email, password: temporary });
  assert.equal(tempLogin.status, 200); assert.equal(tempLogin.body.mustChangePassword, true); assert.equal(tempLogin.body.role, 'ADMIN'); assert.equal(tempLogin.body.tenant.id, tenant.id);
  const tempToken = tempLogin.body.accessToken;
  const denied = await request('/staff', null, tempToken); assert.equal(denied.status, 403); assert.equal(denied.body.code, 'INITIAL_PASSWORD_CHANGE_REQUIRED');
  const changed = await request('/auth/change-initial-password', { currentPassword: temporary, newPassword: final, confirmPassword: final }, tempToken); assert.equal(changed.status, 200);
  assert.equal((await request('/auth/login', { email: u.email, password: temporary })).status, 401);
  assert.equal((await request('/staff', null, tempToken)).status, 401);
  const fresh = await request('/auth/login', { email: u.email, password: final }); assert.equal(fresh.status, 200); assert.equal(fresh.body.mustChangePassword, false);
  const list = await request('/staff', null, fresh.body.accessToken); assert.equal(list.status, 200); assert.equal(list.body.length, 23);
  assert.equal((await request('/staff/' + foreign.id, null, fresh.body.accessToken)).status, 404);
  assert.deepEqual(await p.staff.findMany({ orderBy: { id: 'asc' } }), staffBefore);
  assert.deepEqual(await p.membership.findMany(), membershipBefore);
  assert.deepEqual(await p.auditLog.findUnique({ where: { id: historical.id } }), historical);
  const audit = await p.auditLog.findMany({ where: { action: 'ADMIN_CREDENTIAL_RECOVERED', tenantId: tenant.id } }); assert.equal(audit.length, 1); assert.equal(audit[0].detail.affectedUserIsActor, false);
  const safeAudit = JSON.stringify(audit); assert.ok(secrets.every(s => !safeAudit.includes(s)));
  const finalUser = await p.user.findUniqueOrThrow({ where: { id: u.id } }); assert.equal(finalUser.tokenVersion, 3); assert.equal(finalUser.mustChangePassword, false);
  if (process.env.RECOVERY_TEST_LOG_PATH) { const log = require('node:fs').readFileSync(process.env.RECOVERY_TEST_LOG_PATH, 'utf8'); assert.ok(secrets.every(secret => !log.includes(secret)), 'API logs contain no test credential'); }
  console.log('PASS recovery lifecycle; old/current token invalidation; business gate; ADMIN/Tenant; anonymous Staff23 unchanged; foreign Tenant denied; historical audit preserved; duplicate/invalid/shared rejection; audit failure atomic rollback; secret output zero');
}
main().catch(e => { console.error('RECOVERY_TEST_FAIL', e.stack?.split('\n').filter(l => l.trim().startsWith('at ')).slice(0, 2).join(' ')); process.exitCode = 1; }).finally(async () => { for (const id of tenants.reverse()) await p.tenant.delete({ where: { id } }); for (const id of users) await p.user.delete({ where: { id } }); await p.$disconnect(); });
