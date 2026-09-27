const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
require('./helpers/isolated-database.cjs').resolveIsolatedDatabaseUrl();
const { PrismaClient } = require('@prisma/client');
const { anonymousFormalPackage } = require('./helpers/anonymous-formal-package.cjs');
const { derivePreflight, productionPreflight, hash } = require('../scripts/lib/formal-preflight.cjs');
const prisma = new PrismaClient();
let tenantId, otherId, dir;
const users = [];
function run(script, args, extra = {}, success = true) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, ...extra }, encoding: 'utf8' });
  if (success) assert.equal(r.status, 0, script + ': ' + r.stderr);
  else assert.notEqual(r.status, 0);
  return r;
}
async function snapshot(omitTimestamp = false) {
  const tables = await prisma.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename");
  const out = {};
  for (const { tablename } of tables) out[tablename] = await prisma.$queryRawUnsafe('SELECT row_to_json(t) AS value FROM public."' + tablename.replaceAll('"','""') + '" t ORDER BY row_to_json(t)::text');
  return JSON.stringify(out, (k,v) => omitTimestamp && k === 'updatedAt' ? undefined : v);
}
async function tenantSnapshot(id) {
  const all = JSON.parse(await snapshot());
  return JSON.stringify(Object.fromEntries(Object.entries(all).map(([table, rows]) => [table, rows.filter(row => row.value.tenantId === id || table === 'Tenant' && row.value.id === id)])));
}
async function main() {
  tenantId = (await prisma.tenant.create({ data: { name: 'Anonymous zero staff test', code: 'musubi-nursery' } })).id;
  otherId = (await prisma.tenant.create({ data: { name: 'Anonymous sentinel' } })).id;
  await prisma.tenantSubscription.create({ data: { tenantId, plan: 'TRIAL', status: 'TRIAL', staffLimit: 23 } });
  await prisma.workPattern.create({data:{tenantId:otherId,code:'SENTINEL',name:'Anonymous sentinel',shortName:'TEST'}});
  const otherBefore = await tenantSnapshot(otherId);
  const empty = await snapshot();
  run('scripts/apply-musubi-tenant-master.cjs', ['--tenant-id',tenantId,'--apply'], {}, false);
  assert.equal(await snapshot(),empty, 'bulk staff gate rollback');
  const master = ['--tenant-id', tenantId, '--scope', 'TENANT_ONLY', '--apply'];
  run('scripts/apply-musubi-tenant-master.cjs', master);
  assert.equal(await prisma.staff.count(), 0); assert.equal(await prisma.user.count(), 0); assert.equal(await prisma.membership.count(), 0);
  assert.equal(await prisma.shiftStaffingRequirement.count({ where: { tenantId } }), 33);
  assert.equal(await prisma.conditionalShiftStaffingRequirement.count({ where: { tenantId } }), 1);
  const zeroFeature = await prisma.tenantFeature.findUnique({where:{tenantId_featureCode:{tenantId,featureCode:'TENANT_CUSTOM_RULES'}}});
  assert.equal(zeroFeature.configuration.release1ProvisionalSoftRules, undefined);
  assert.equal(await prisma.staffWorkRule.count(), 0); assert.equal(await prisma.staffAttributeAssignment.count(), 0);
  const first = await snapshot(true); run('scripts/apply-musubi-tenant-master.cjs', master); assert.equal(await snapshot(true), first);
  const parent = anonymousFormalPackage(randomUUID());
  for (const row of parent.staff) row.provenance.displayName = { sourceId: 'MUSUBI-2026-001', locator: 'anonymous identity fixture', approvalStatus: 'APPROVED', approvalAuthority: 'APPROVED_ITEM_SCOPE' };
  const bytes = Buffer.from(JSON.stringify(parent)); const binding = { targetTenantId: tenantId, expectedParentHash: hash(bytes) };
  const derived = derivePreflight(bytes, { ...binding, approvalReference: 'isolated preflight test only' });
  // Exercise production environment/migration attestation checks in the isolated DB only.
  const saved = { ...process.env };
  Object.assign(process.env, { DEPLOYMENT_ENV: 'production', ALLOW_PRODUCTION_PROVISIONING: 'true', DATABASE_TARGET_ID: 'anonymous-zero-staff-test', CONFIRM_DATABASE_TARGET_ID: 'anonymous-zero-staff-test', DATABASE_TARGET_DATABASE: new URL(process.env.DATABASE_URL).pathname.slice(1), CONFIRM_DEPLOYMENT_ENV: 'production', PROVISIONING_REHEARSAL: 'true' });
  const before = await snapshot();
  for (let i = 0; i < 2; i++) { const result = await productionPreflight(prisma, derived, binding); assert.equal(result.writes, 0); assert.equal(result.expectedInserts, 23); assert.deepEqual(result.departments, [18,2,3]); }
  assert.equal(await snapshot(), before);
  await assert.rejects(productionPreflight(prisma, derived, { ...binding, targetTenantId: otherId }));
  await assert.rejects(prisma.$transaction(async tx => { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await tx.tenant.update({ where:{id:tenantId},data:{name:'forbidden'} }); }));
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved);
  dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'aen-anonymous-preflight-')); fs.chmodSync(dir, 0o700);
  const original = path.join(dir, 'original.json'); fs.writeFileSync(original, bytes, {mode:0o600});
  const derivedPath = path.join(dir, 'preflight.json');
  const cliArgs = ['--input', original, '--tenant-id', tenantId, '--parent-sha256', binding.expectedParentHash, '--derive', '--output', derivedPath, '--approval-reference', 'anonymous isolated preflight'];
  run('scripts/preflight-musubi-formal-package.cjs', cliArgs);
  assert.equal(fs.statSync(derivedPath).mode & 0o777, 0o600); assert.deepEqual(fs.readFileSync(original),bytes);
  const prefArgs = ['--input', derivedPath, '--tenant-id', tenantId, '--parent-sha256', binding.expectedParentHash];
  assert.equal(JSON.parse(run('scripts/preflight-musubi-formal-package.cjs', prefArgs).stdout).writes, 0);
  run('scripts/preflight-musubi-formal-package.cjs', [...prefArgs,'--apply'], {}, false);
  run('scripts/preflight-musubi-formal-package.cjs', cliArgs, {}, false); // Never overwrite an input.
  assert.equal(await snapshot(),before);
  const file = path.join(dir, 'parent.json'); parent.tenantIdentity.tenantId = tenantId; fs.writeFileSync(file, JSON.stringify(parent), {mode:0o600});
  const args = [file, '--formal-package', '--admin-employee-number', 'S001'];
  const refused = run('scripts/import-musubi-beta.cjs', [...args, '--apply'], {}, false);
  assert.match(refused.stderr, /exactly one active administrator/); assert.equal(await snapshot(), before);
  const wrapperFile = path.join(dir, 'derived.json'); fs.writeFileSync(wrapperFile, JSON.stringify(derived), {mode:0o600});
  run('scripts/import-musubi-beta.cjs', [wrapperFile, '--formal-package', '--admin-employee-number', 'S001', '--apply'], {}, false);
  assert.equal(await snapshot(), before);
  const email = 'anonymous-' + randomUUID() + '@example.invalid';
  run('scripts/bootstrap-admin.cjs', ['--apply'], { INITIAL_ADMIN_TENANT_ID: tenantId, INITIAL_ADMIN_EMAIL: email, INITIAL_ADMIN_PASSWORD: 'Aa1!' + randomBytes(24).toString('hex'), INITIAL_ADMIN_DISPLAY_NAME: 'Anonymous test administrator', INITIAL_ADMIN_STAFF_MODE: 'deferred-link', INITIAL_ADMIN_EMPLOYEE_NUMBER: 'S001' });
  users.push((await prisma.user.findUnique({where:{email}})).id); assert.equal(await prisma.staff.count(),0);
  run('scripts/import-musubi-beta.cjs', [...args, '--apply']);
  run('scripts/apply-musubi-tenant-master.cjs', ['--tenant-id', tenantId, '--scope', 'STAFF_DEPENDENT', '--apply']);
  assert.equal(await prisma.staff.count({where:{tenantId}}),23); assert.equal(await prisma.staffWorkContract.count(),0);
  const complete = await snapshot(true); run('scripts/apply-musubi-tenant-master.cjs', ['--tenant-id', tenantId, '--apply']); const afterComplete = await snapshot(true); if (afterComplete !== complete) { const a=JSON.parse(complete), b=JSON.parse(afterComplete); function diff(x,y,p='') { if(JSON.stringify(x)===JSON.stringify(y)) return; if(x && y && typeof x==='object' && typeof y==='object') { for(const k of new Set([...Object.keys(x),...Object.keys(y)])) diff(x[k],y[k],p+'.'+k); } else console.error('Changed field '+p); } diff(a,b); } assert.ok(afterComplete===complete, 'bulk business parity');
  assert.equal(await tenantSnapshot(otherId),otherBefore);
  console.log('Tenant zero staff PASS: tenant-only twice, admin-zero production preflight twice write0, apply refusal write0, deferred bootstrap + 23 import + staff-dependent, bulk parity, tenant isolation');
}
main().catch(e => { console.error(e.code || 'TEST_FAILED', e.stack?.split('\n').filter(line => line.trim().startsWith('at ')).slice(0,2).join(' ')); process.exitCode=1; }).finally(async () => {
  for (const id of [tenantId,otherId]) if(id) await prisma.tenant.delete({where:{id}});
  for (const id of users) await prisma.user.delete({where:{id}});
  if(dir) fs.rmSync(dir,{recursive:true}); await prisma.$disconnect();
});
