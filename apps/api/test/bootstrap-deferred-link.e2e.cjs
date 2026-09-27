const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const safety = require('./helpers/isolated-database.cjs');
safety.resolveIsolatedDatabaseUrl();
const base = safety.resolveLocalApiBaseUrl();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const tenants = [], users = [], secrets = [];
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aen-anonymous-bootstrap-'));
fs.chmodSync(directory, 0o700);
async function snapshot() {
  const tables = await p.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename");
  const rows = {};
  for (const { tablename: t } of tables) rows[t] = await p.$queryRawUnsafe('SELECT row_to_json(x) AS value FROM public."' + t + '" x ORDER BY row_to_json(x)::text');
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
function cli(env, args, success = true) {
  const r = spawnSync(process.execPath, ['scripts/bootstrap-admin.cjs', ...args], { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8' });
  const output = r.stdout + r.stderr;
  assert.ok(secrets.every(value => !output.includes(value)), 'CLI secret output');
  assert.equal(/accessToken|passwordHash|postgres(?:ql)?:\/\//.test(output), false, 'CLI sensitive fields');
  assert.equal(r.status === 0, success, 'bootstrap exit status');
  return r;
}
async function request(route, body, token) {
  const r = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json() };
}
async function main() {
  const other = await p.tenant.create({ data: { name: 'Anonymous sentinel' } }); tenants.push(other.id);
  const sentinel = await p.workPattern.create({ data: { tenantId: other.id, code: 'SENTINEL', name: 'Anonymous', shortName: 'TEST' } });
  for (const employee of [undefined, '   ', 'S019']) {
    const tenant = await p.tenant.create({ data: { name: 'Anonymous deferred test' } }); tenants.push(tenant.id);
    const password = 'Aa1!' + randomBytes(24).toString('hex'); secrets.push(password);
    const env = { ...process.env, DEPLOYMENT_ENV: 'production', ALLOW_PRODUCTION_ADMIN_BOOTSTRAP: 'true', ALLOW_PRODUCTION_PROVISIONING: 'true', CONFIRM_DEPLOYMENT_ENV: 'production', PROVISIONING_REHEARSAL: 'true', DATABASE_TARGET_ID: 'anonymous-bootstrap-test', CONFIRM_DATABASE_TARGET_ID: 'anonymous-bootstrap-test', DATABASE_TARGET_DATABASE: new URL(process.env.DATABASE_URL).pathname.slice(1), PROVISIONING_STATE_DIRECTORY: directory, INITIAL_ADMIN_TENANT_ID: tenant.id, INITIAL_ADMIN_EMAIL: randomUUID() + '@example.invalid', INITIAL_ADMIN_DISPLAY_NAME: 'Anonymous administrator', INITIAL_ADMIN_PASSWORD: password, INITIAL_ADMIN_STAFF_MODE: 'deferred-link', CONFIRM_PRODUCTION_APPLY: 'APPLY_MUSUBI_PRODUCTION_' + tenant.id };
    delete env.INITIAL_ADMIN_EMPLOYEE_NUMBER;
    if (employee !== undefined) env.INITIAL_ADMIN_EMPLOYEE_NUMBER = employee;
    const before = await snapshot();
    cli(env, ['--apply'], false); // Production receipt remains mandatory.
    cli({ ...env, INITIAL_ADMIN_PASSWORD: 'weak' }, [], false);
    cli({ ...env, CONFIRM_DATABASE_TARGET_ID: 'wrong-target' }, [], false);
    assert.equal(await snapshot(), before, 'rejected bootstrap writes 0');
    cli(env, []);
    assert.equal(await snapshot(), before, 'dry-run writes 0');
    cli({ ...env, INITIAL_ADMIN_STAFF_MODE: 'invalid' }, ['--apply'], false);
    assert.equal(await snapshot(), before, 'invalid mode transaction rolls back');
    cli(env, ['--apply']);
    const user = await p.user.findUniqueOrThrow({ where: { email: env.INITIAL_ADMIN_EMAIL }, include: { memberships: true } }); users.push(user.id); secrets.push(user.passwordHash);
    assert.equal(user.mustChangePassword, true); assert.equal(user.isPlatformAdmin, false);
    assert.equal(user.memberships.length, 1); assert.equal(user.memberships[0].tenantId, tenant.id); assert.equal(user.memberships[0].role, 'ADMIN');
    assert.equal(await p.staff.count(), 0);
    const audit = await p.auditLog.findFirstOrThrow({ where: { tenantId: tenant.id, action: 'INITIAL_ADMIN_CREATED' } });
    assert.deepEqual(audit.detail, { source: 'bootstrap-admin-cli', mustChangePassword: true, staffMode: 'deferred-link', ...(employee?.trim() ? { pendingEmployeeNumber: employee.trim() } : {}) });
    cli(env, ['--verify']);
    const created = await snapshot(); cli(env, ['--apply'], false); assert.equal(await snapshot(), created, 'duplicate apply writes 0');
    const login = await request('/auth/login', { email: env.INITIAL_ADMIN_EMAIL, password });
    assert.equal(login.status, 200); assert.equal(login.body.tenant.id, tenant.id); assert.equal(login.body.role, 'ADMIN'); assert.equal(login.body.mustChangePassword, true);
    const token = login.body.accessToken; secrets.push(token);
    assert.equal((await request('/staff', null, token)).body.code, 'INITIAL_PASSWORD_CHANGE_REQUIRED');
    const finalPassword = 'Zz9!' + randomBytes(24).toString('hex'); secrets.push(finalPassword);
    const changed = await request('/auth/change-initial-password', { currentPassword: password, newPassword: finalPassword, confirmPassword: finalPassword }, token);
    assert.equal(changed.status, 200);
    assert.equal((await request('/staff', null, token)).status, 401, 'old token invalidated');
    const fresh = await request('/auth/login', { email: env.INITIAL_ADMIN_EMAIL, password: finalPassword }); assert.equal(fresh.status, 200); secrets.push(fresh.body.accessToken);
    assert.equal((await request('/staff', null, fresh.body.accessToken)).status, 200);
    // A real foreign row is created only in this disposable test DB after Staff 0 was verified.
    const foreign = await p.staff.create({ data: { tenantId: other.id, employeeNumber: 'ANONYMOUS-SENTINEL', displayName: 'Anonymous foreign staff' } });
    try { assert.equal((await request('/staff/' + foreign.id, null, fresh.body.accessToken)).status, 404, 'foreign tenant access denied'); }
    finally { await p.staff.delete({ where: { id: foreign.id } }); }
    assert.deepEqual(await p.workPattern.findUnique({ where: { id: sentinel.id } }), sentinel);
    assert.equal(await p.membership.count({ where: { tenantId: other.id } }), 0);
    assert.equal(await p.staff.count(), 0);
  }
  console.log('PASS deferred bootstrap: omitted/blank/explicit ID; Staff0; ADMIN; initial password gate/change/token invalidation; foreign tenant404; receipt/weak password/target/duplicate/rollback; secret output0');
}
main().catch(error => { console.error('BOOTSTRAP_DEFERRED_TEST_FAILED', error.stack?.split('\n').filter(line => line.trim().startsWith('at ')).slice(0, 2).join(' ')); process.exitCode = 1; }).finally(async () => {
  for (const id of tenants.reverse()) await p.tenant.delete({ where: { id } });
  for (const id of users) await p.user.delete({ where: { id } });
  fs.rmSync(directory, { recursive: true, force: true }); await p.$disconnect();
});
