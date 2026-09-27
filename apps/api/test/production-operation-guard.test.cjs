const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertEnvironment, assertDatabaseSafety, recordDryRun, packageDigest } = require('../scripts/lib/production-operation-guard.cjs');

const tenantId = '11111111-1111-4111-8111-111111111111';
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'aen-provision-guard-'));
const original = { ...process.env };
Object.assign(process.env, {
  DEPLOYMENT_ENV: 'production', ALLOW_PRODUCTION_PROVISIONING: 'true',
  DATABASE_URL: 'postgresql://local_user@127.0.0.1:55432/aen_production_rehearsal',
  DATABASE_TARGET_DATABASE: 'aen_production_rehearsal', DATABASE_TARGET_ID: 'musubi-rehearsal-db',
  CONFIRM_DATABASE_TARGET_ID: 'musubi-rehearsal-db', CONFIRM_DEPLOYMENT_ENV: 'production',
  PROVISIONING_REHEARSAL: 'true', TEST_DATABASE_ISOLATED: 'true', PROVISIONING_STATE_DIRECTORY: state,
});

function blocked(code, fn) { assert.throws(fn, new RegExp(`SYSTEM_SAFETY_BLOCK:${code}:`)); }

async function main() {
  const digest = packageDigest({ anonymous: true });
  const dry = assertEnvironment({ tenantId, operation: 'permanent-master', mode: 'DRY_RUN', packageDigest: digest });
  recordDryRun('permanent-master', tenantId, dry);
  process.env.CONFIRM_PRODUCTION_APPLY = `APPLY_MUSUBI_PRODUCTION_${tenantId}`;
  assert.equal(assertEnvironment({ tenantId, operation: 'permanent-master', mode: 'APPLY', packageDigest: digest }).production, true);
  for (const adminLinkMode of ['DEFERRED', 'LINKED']) {
    const args = { tenantId, operation: 'formal-mode-test', packageDigest: digest, adminLinkMode };
    recordDryRun(args.operation, tenantId, assertEnvironment({ ...args, mode: 'DRY_RUN' }));
    assert.equal(assertEnvironment({ ...args, mode: 'APPLY' }).adminLinkMode, adminLinkMode);
    blocked('DRY_RUN_RECEIPT_MISMATCH', () => assertEnvironment({ ...args, mode: 'APPLY', adminLinkMode: adminLinkMode === 'DEFERRED' ? 'LINKED' : 'DEFERRED' }));
    blocked('DRY_RUN_RECEIPT_MISMATCH', () => assertEnvironment({ ...args, mode: 'APPLY', adminLinkMode: undefined }));
  }
  const originalUrl = process.env.DATABASE_URL;
  for (const changedUrl of [
    originalUrl.replace('127.0.0.1', 'localhost'),
    originalUrl.replace('55432', '55433'),
    originalUrl.replace('local_user', 'another_user'),
  ]) {
    process.env.DATABASE_URL = changedUrl;
    blocked('DRY_RUN_RECEIPT_MISMATCH', () => assertEnvironment({ tenantId, operation: 'permanent-master', mode: 'APPLY', packageDigest: digest }));
  }
  process.env.DATABASE_URL = originalUrl + '?schema=other';
  blocked('SCHEMA_MISMATCH', () => assertEnvironment({ tenantId, operation: 'permanent-master', mode: 'VERIFY' }));
  process.env.DATABASE_URL = originalUrl;
  process.env.CONFIRM_PRODUCTION_APPLY = 'YES';
  blocked('APPLY_CONFIRMATION_MISMATCH', () => assertEnvironment({ tenantId, operation: 'permanent-master', mode: 'APPLY', packageDigest: digest }));
  process.env.CONFIRM_PRODUCTION_APPLY = `APPLY_MUSUBI_PRODUCTION_${tenantId}`;
  blocked('DRY_RUN_REQUIRED', () => assertEnvironment({ tenantId, operation: 'monthly-2026-10', mode: 'APPLY', packageDigest: digest }));
  process.env.DATABASE_TARGET_DATABASE = 'wrong_database';
  blocked('DATABASE_NAME_MISMATCH', () => assertEnvironment({ tenantId, operation: 'permanent-master', mode: 'VERIFY', packageDigest: digest }));
  process.env.DATABASE_TARGET_DATABASE = 'aen_production_rehearsal';
  blocked('INVALID_TENANT_ID', () => assertEnvironment({ tenantId: 'wrong', operation: 'permanent-master', mode: 'VERIFY', packageDigest: digest }));
  process.env.DATABASE_URL = 'postgresql://local_user@rehearsal-postgres:5432/aen_production_rehearsal';
  blocked('REHEARSAL_TARGET_INVALID', () => assertEnvironment({ tenantId, operation: 'permanent-master', mode: 'VERIFY', packageDigest: digest }));
  process.env.REHEARSAL_DATABASE_HOST = 'rehearsal-postgres';
  assert.equal(assertEnvironment({ tenantId, operation: 'permanent-master', mode: 'VERIFY', packageDigest: digest }).production, true);
  process.env.DATABASE_URL = 'postgresql://local_user@127.0.0.1:55432/aen_production_rehearsal';
  delete process.env.REHEARSAL_DATABASE_HOST;
  const complete = require('../scripts/lib/production-migrations.json').map((entry) => ({ migration_name: entry.name, checksum: entry.checksum, finished_at: new Date(), rolled_back_at: null }));
  const mock = (rows, target = { database: 'aen_production_rehearsal', schema: 'public' }) => ({ $queryRawUnsafe: async (sql) => sql.includes('current_database()') ? [target] : rows, tenant: { findUnique: async ({ where }) => where.id === tenantId ? { id: tenantId } : null } });
  const prisma = mock(complete);
  await assertDatabaseSafety(prisma, tenantId);
  for (const rows of [complete.slice(0, 29), [...complete, { migration_name: 'pending', finished_at: null }], complete.map((row, i) => i === 0 ? { ...row, checksum: 'wrong' } : row), complete.map((row, i) => i === 0 ? { ...row, migration_name: 'wrong' } : row)]) {
    await assert.rejects(() => assertDatabaseSafety(mock(rows), tenantId), /SYSTEM_SAFETY_BLOCK:MIGRATION_MISMATCH:/);
  }
  await assert.rejects(() => assertDatabaseSafety(mock(complete, { database: 'wrong', schema: 'public' }), tenantId), /SYSTEM_SAFETY_BLOCK:DATABASE_NAME_MISMATCH:/);
  await assert.rejects(() => assertDatabaseSafety(mock(complete, { database: 'aen_production_rehearsal', schema: 'other' }), tenantId), /SYSTEM_SAFETY_BLOCK:SCHEMA_MISMATCH:/);
  await assert.rejects(() => assertDatabaseSafety(prisma, '22222222-2222-4222-8222-222222222222'), /SYSTEM_SAFETY_BLOCK:TENANT_NOT_FOUND:/);
  process.env.DEPLOYMENT_ENV = 'prodution';
  process.env.NODE_ENV = 'production';
  blocked('ENVIRONMENT_MISMATCH', () => assertEnvironment({ tenantId, operation: 'permanent-master', mode: 'APPLY' }));
  delete process.env.NODE_ENV;
  process.env.DATABASE_URL = 'postgresql://user@remote.invalid:5432/aen_production_rehearsal';
  blocked('ENVIRONMENT_MISMATCH', () => assertEnvironment({ tenantId, operation: 'permanent-master', mode: 'APPLY' }));
  process.env.DEPLOYMENT_ENV = 'production';
  delete process.env.DATABASE_URL;
  blocked('DATABASE_URL_MISSING', () => assertEnvironment({ tenantId, operation: 'permanent-master', mode: 'VERIFY', packageDigest: digest }));
  console.log('production operation guard tests: PASS');
}

main().finally(() => { process.env = original; fs.rmSync(state, { recursive: true, force: true }); });
