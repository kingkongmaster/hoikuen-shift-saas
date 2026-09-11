const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const EXPECTED_MIGRATIONS = require('./production-migrations.json');
const EXPECTED_MIGRATION_COUNT = EXPECTED_MIGRATIONS.length;

function fail(code, message) {
  const error = new Error(`SYSTEM_SAFETY_BLOCK:${code}:${message}`);
  error.code = code;
  throw error;
}

function safeToken(value) {
  return String(value || '').replace(/[^A-Za-z0-9_.-]/g, '_');
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stateDirectory() {
  const directory = path.resolve(process.env.PROVISIONING_STATE_DIRECTORY || '/var/lib/aen-shift/provisioning');
  if (directory === '/' || directory.length < 12) fail('INVALID_STATE_DIRECTORY', 'provisioning state directory is unsafe');
  return directory;
}

function receiptPath(operation, tenantId) {
  return path.join(stateDirectory(), `${safeToken(operation)}-${safeToken(tenantId)}.dry-run.json`);
}

function productionMode() {
  return process.env.DEPLOYMENT_ENV?.trim().toLowerCase() === 'production';
}

function assertEnvironment({ tenantId, operation, mode, packageDigest = '' }) {
  if (!productionMode()) {
    let local;
    try { local = new URL(process.env.DATABASE_URL); } catch { fail('DATABASE_URL_INVALID', 'an explicit isolated localhost database is required'); }
    if (process.env.NODE_ENV === 'production' || process.env.TEST_DATABASE_ISOLATED !== 'true' || !['postgresql:', 'postgres:'].includes(local.protocol) || !['localhost', '127.0.0.1'].includes(local.hostname)) fail('ENVIRONMENT_MISMATCH', 'non-production provisioning requires an explicit isolated localhost database');
    return { production: false };
  }
  if (process.env.ALLOW_PRODUCTION_PROVISIONING !== 'true') fail('PRODUCTION_NOT_EXPLICIT', 'ALLOW_PRODUCTION_PROVISIONING=true is required');
  if (!/^[0-9a-f-]{36}$/i.test(tenantId || '')) fail('INVALID_TENANT_ID', 'an explicit Tenant UUID is required');
  if (!process.env.DATABASE_URL) fail('DATABASE_URL_MISSING', 'DATABASE_URL is required');
  let url;
  try { url = new URL(process.env.DATABASE_URL); } catch { fail('DATABASE_URL_INVALID', 'DATABASE_URL is invalid'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) fail('DATABASE_URL_INVALID', 'PostgreSQL URL is required');
  if ((url.searchParams.get('schema') || 'public') !== 'public') fail('SCHEMA_MISMATCH', 'only the public schema is supported');
  const databaseIdentity = digest(JSON.stringify({ host: url.hostname.toLowerCase(), port: url.port || '5432', database: url.pathname, user: url.username, schema: url.searchParams.get('schema') || 'public' }));
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const expectedDatabase = process.env.DATABASE_TARGET_DATABASE?.trim();
  const targetId = process.env.DATABASE_TARGET_ID?.trim();
  if (!targetId || targetId.length < 6 || process.env.CONFIRM_DATABASE_TARGET_ID?.trim() !== targetId) fail('DATABASE_TARGET_MISMATCH', 'database target confirmation does not match');
  if (!expectedDatabase || expectedDatabase !== databaseName) fail('DATABASE_NAME_MISMATCH', 'DATABASE_TARGET_DATABASE does not match DATABASE_URL');
  if (process.env.CONFIRM_DEPLOYMENT_ENV?.trim().toLowerCase() !== 'production') fail('ENVIRONMENT_MISMATCH', 'production environment confirmation does not match');
  const localHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
  const rehearsal = process.env.PROVISIONING_REHEARSAL === 'true' && process.env.TEST_DATABASE_ISOLATED === 'true';
  if (localHost && !rehearsal) fail('LOCAL_PRODUCTION_TARGET', 'localhost is allowed only for an explicit isolated rehearsal');
  if (rehearsal && !localHost && process.env.REHEARSAL_DATABASE_HOST?.trim() !== url.hostname) fail('REHEARSAL_TARGET_INVALID', 'container rehearsal requires an exact REHEARSAL_DATABASE_HOST confirmation');
  if (!rehearsal && process.env.REHEARSAL_DATABASE_HOST) fail('REHEARSAL_TARGET_INVALID', 'rehearsal host confirmation is forbidden outside isolated rehearsal mode');
  if (mode === 'APPLY') {
    const expectedApply = `APPLY_MUSUBI_PRODUCTION_${tenantId}`;
    if (process.env.CONFIRM_PRODUCTION_APPLY !== expectedApply) fail('APPLY_CONFIRMATION_MISMATCH', 'tenant-specific apply confirmation does not match');
    const file = receiptPath(operation, tenantId);
    if (!fs.existsSync(file)) fail('DRY_RUN_REQUIRED', 'a successful dry-run receipt is required before apply');
    let receipt;
    try { receipt = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail('DRY_RUN_RECEIPT_INVALID', 'dry-run receipt cannot be read'); }
    const age = Date.now() - Date.parse(receipt.completedAt || '');
    if (receipt.databaseIdentity !== databaseIdentity || receipt.operation !== operation || receipt.tenantId !== tenantId || receipt.databaseTargetId !== targetId || receipt.databaseName !== databaseName || receipt.packageDigest !== packageDigest || !Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000) fail('DRY_RUN_RECEIPT_MISMATCH', 'dry-run receipt is stale or belongs to another target');
  }
  return { production: true, targetId, databaseName, databaseIdentity, packageDigest };
}

async function assertDatabaseSafety(prisma, tenantId, { requireTenant = true } = {}) {
  if (!productionMode()) return;
  let migrations;
  let target;
  try {
    [target] = await prisma.$queryRawUnsafe('SELECT current_database() AS database, current_schema() AS schema');
    migrations = await prisma.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "public"."aen_release_migration_status"');
  } catch { fail('DATABASE_SCHEMA_UNVERIFIED', 'database schema and migration history could not be verified'); }
  if (!target || target.database !== process.env.DATABASE_TARGET_DATABASE?.trim()) fail('DATABASE_NAME_MISMATCH', 'connected database does not match the confirmed target');
  if (target.schema !== 'public') fail('SCHEMA_MISMATCH', 'connected schema must be public');
  const active = migrations.filter((row) => !row.rolled_back_at);
  if (active.length !== EXPECTED_MIGRATION_COUNT || EXPECTED_MIGRATIONS.some((expected) => !active.some((row) => row.migration_name === expected.name && row.checksum === expected.checksum && row.finished_at))) {
    fail('MIGRATION_MISMATCH', 'exact completed release migration names and checksums are required');
  }
  if (requireTenant) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) fail('TENANT_NOT_FOUND', 'target Tenant does not exist');
  }
}

function recordDryRun(operation, tenantId, context) {
  if (!context.production) return;
  const directory = stateDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const file = receiptPath(operation, tenantId);
  fs.writeFileSync(file, `${JSON.stringify({ version: 1, operation, tenantId, databaseTargetId: context.targetId, databaseName: context.databaseName, databaseIdentity: context.databaseIdentity, packageDigest: context.packageDigest, completedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function packageDigest(value) {
  return digest(typeof value === 'string' ? value : JSON.stringify(value));
}

module.exports = { assertEnvironment, assertDatabaseSafety, recordDryRun, packageDigest, fail, EXPECTED_MIGRATION_COUNT };
