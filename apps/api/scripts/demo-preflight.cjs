const { execFileSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { scryptSync, timingSafeEqual } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const DEMO_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const DEMO_PASSWORD = 'ChangeMe123!';
const ADMIN_EMAIL = (process.env.SEED_OWNER_EMAIL || 'owner@demo.enshift.local').toLowerCase();
const STAFF_EMAIL = 'staff@demo.enshift.local';
const API_BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, '');
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}\n`);
}

function presentationDecision(failed) {
  if (!failed.length) return 'Presentation Ready';
  return ['FAIL項目:', ...failed.map((result) => `- ${result.name}`), '', 'Presentation NOT Ready'].join('\n');
}

function verifyPassword(password, encoded) {
  const [salt, stored] = String(encoded || '').split(':');
  if (!salt || !stored) return false;
  const digest = scryptSync(password, salt, 64);
  const expected = Buffer.from(stored, 'hex');
  return expected.length === digest.length && timingSafeEqual(expected, digest);
}

async function request(path, options) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

async function main() {
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production' || (process.env.DEPLOYMENT_ENV || '').toLowerCase() === 'production') {
    throw new Error('Demo preflight is disabled in production.');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const databaseUrl = new URL(process.env.DATABASE_URL);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
  record('DATABASE_URLがローカルのデモDBを指す', localHosts.has(databaseUrl.hostname), `host=${databaseUrl.hostname}, db=${databaseUrl.pathname.slice(1)}`);
  record('デモ用パスワードが統一されている', (process.env.DEMO_USER_PASSWORD || DEMO_PASSWORD) === DEMO_PASSWORD && (!process.env.SEED_OWNER_PASSWORD || process.env.SEED_OWNER_PASSWORD === DEMO_PASSWORD) && (!process.env.SEED_STAFF_PASSWORD || process.env.SEED_STAFF_PASSWORD === DEMO_PASSWORD));

  const prisma = new PrismaClient();
  try {
    const tableRows = await prisma.$queryRawUnsafe(`SELECT to_regclass('public."User"')::text AS "userTable", to_regclass('public."_prisma_migrations"')::text AS "migrationTable"`);
    const userTableExists = Boolean(tableRows[0]?.userTable);
    const migrationTableExists = Boolean(tableRows[0]?.migrationTable);
    record('Userテーブル存在', userTableExists);

    let migrationsPassed = false;
    if (migrationTableExists) {
      const applied = await prisma.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
      const expected = readdirSync(join(__dirname, '../prisma/migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
      const names = new Set(applied.map((row) => row.migration_name));
      migrationsPassed = expected.every((name) => names.has(name));
    }
    record('Prisma Migration適用済み', migrationsPassed);

    let users = [];
    let tenant = null;
    if (userTableExists) {
      [tenant, users] = await Promise.all([
        prisma.tenant.findUnique({ where: { id: DEMO_TENANT_ID }, select: { id: true } }),
        prisma.user.findMany({ where: { email: { endsWith: '@demo.enshift.local' } }, select: { email: true, passwordHash: true, isActive: true, memberships: { where: { isActive: true }, select: { role: true } } } }),
      ]);
    }
    const byEmail = new Map(users.map((user) => [user.email, user]));
    const requiredUsersExist = Boolean(tenant && byEmail.get(ADMIN_EMAIL)?.isActive && byEmail.get(STAFF_EMAIL)?.isActive);
    const allHashesMatch = users.length >= 2 && users.every((user) => verifyPassword(DEMO_PASSWORD, user.passwordHash));
    record('Demo Seed適用済み', requiredUsersExist && allHashesMatch, `demoUsers=${users.length}`);

    for (const [label, email, role] of [['デモ管理者ログイン', ADMIN_EMAIL, 'ADMIN'], ['一般職員デモログイン', STAFF_EMAIL, 'STAFF']]) {
      try {
        const { response, body } = await request('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) });
        record(label, response.status === 200 && body?.role === role, `HTTP ${response.status}`);
      } catch (error) { record(label, false, error.message); }
    }
  } finally {
    await prisma.$disconnect();
  }

  for (const [label, path] of [['/api/health', '/health'], ['/api/ready', '/ready']]) {
    try { const { response } = await request(path); record(`${label} がHTTP 200`, response.status === 200, `HTTP ${response.status}`); }
    catch (error) { record(`${label} がHTTP 200`, false, error.message); }
  }

  const gitClean = execFileSync('git', ['status', '--porcelain'], { cwd: join(__dirname, '../../..'), encoding: 'utf8' }).trim() === '';
  record('git status clean', gitClean);
  const failed = results.filter((result) => !result.passed);
  process.stdout.write(`\n${presentationDecision(failed)}\n`);
  if (failed.length) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => {
  const failure = { name: 'Preflight実行', passed: false, detail: error.message };
  process.stderr.write(`Preflight ERROR: ${error.message}\n`);
  process.stdout.write(`${presentationDecision([failure])}\n`);
  process.exitCode = 1;
});

module.exports = { presentationDecision };
